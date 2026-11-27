import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/database/collections';
import { getDb } from '@/lib/database/firebase';
import { getArgentinaNowISO, normalizeDni } from '@/lib/utils/formatters';
import type {
  AttendanceMark,
  DailyAttendanceRecord,
  EfParteRecord,
  NonComputableCause,
  NonComputableDay,
  Student,
  StudentGradeRecord,
  Subject,
  SubjectAttendanceRecord,
  TeacherAssignment,
} from '@/types/domain';

// ────────────────────────── UTILIDADES DE FECHAS Y CÁLCULOS ──────────────────────────

export const WEEKDAYS = [
  { value: 1, short: 'Lun', label: 'Lunes' },
  { value: 2, short: 'Mar', label: 'Martes' },
  { value: 3, short: 'Mié', label: 'Miércoles' },
  { value: 4, short: 'Jue', label: 'Jueves' },
  { value: 5, short: 'Vie', label: 'Viernes' },
] as const;

export const NON_COMPUTABLE_CAUSES: NonComputableCause[] = [
  'Jornada Institucional',
  'Paro / Medida de fuerza',
  'Causas climáticas',
  'Feriado / Asueto escolar',
  'Suspensión por edificio / servicios',
  'Otra causa',
];

/** Devuelve el día de semana de una fecha YYYY-MM-DD (0=Dom, 1=Lun .. 5=Vie, 6=Sáb). */
export function getDayOfWeekISO(dateStr: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return -1;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getDay();
}

export function isWeekday(dateStr: string): boolean {
  const dow = getDayOfWeekISO(dateStr);
  return dow >= 1 && dow <= 5;
}

export interface StudentAttendanceStat {
  dni: string;
  totalClasses: number;
  presentUnits: number; // P=1, J=1, T=0.5, A=0
  absences: number;
  tardies: number;
  justified: number;
  percentage: number; // 0..100
  below75: boolean;
}

/**
 * Calcula estadísticas de asistencia por estudiante excluyendo automáticamente
 * todas las fechas marcadas como no contabilizables (jornada institucional, feriados, etc.).
 */
export function computeAttendanceStats(
  studentDnis: string[],
  records: { date: string; marks: Record<string, AttendanceMark> }[],
  nonComputableDates: Set<string>
): Map<string, StudentAttendanceStat> {
  const validRecords = records.filter((r) => !nonComputableDates.has(r.date));
  const map = new Map<string, StudentAttendanceStat>();

  for (const dni of studentDnis) {
    let totalClasses = 0;
    let presentUnits = 0;
    let absences = 0;
    let tardies = 0;
    let justified = 0;

    for (const rec of validRecords) {
      const mark = rec.marks?.[dni];
      if (!mark) continue;
      totalClasses += 1;
      if (mark === 'P') presentUnits += 1;
      else if (mark === 'J') {
        presentUnits += 1;
        justified += 1;
      } else if (mark === 'T') {
        presentUnits += 0.5;
        tardies += 1;
      } else if (mark === 'A') {
        absences += 1;
      }
    }

    const percentage =
      totalClasses > 0 ? Math.round((presentUnits / totalClasses) * 1000) / 10 : 100;
    map.set(dni, {
      dni,
      totalClasses,
      presentUnits,
      absences,
      tardies,
      justified,
      percentage,
      below75: totalClasses > 0 && percentage < 75,
    });
  }

  return map;
}

/**
 * Convierte partes diarios de HOST28_EF (colección `partes`, solo lectura) al formato
 * de sesiones para calcular asistencia real de Educación Física (respetando días no contabilizados).
 */
export function adaptEfPartesToAttendanceRecords(
  partes: EfParteRecord[],
  courseLegacyCode?: string
): { date: string; marks: Record<string, AttendanceMark>; curso: string }[] {
  return partes
    .filter((p) => {
      if (p.huboClase && p.huboClase !== 'Sí') return false;
      if (courseLegacyCode && p.curso !== courseLegacyCode) return false;
      return Boolean(p.fecha && p.asistencia);
    })
    .map((p) => {
      const marks: Record<string, AttendanceMark> = {};
      Object.entries(p.asistencia ?? {}).forEach(([dni, status]) => {
        const clean = normalizeDni(dni);
        if (!clean) return;
        const st = String(status).toLowerCase();
        if (st.includes('presente')) marks[clean] = 'P';
        else if (st.includes('justific')) marks[clean] = 'J';
        else if (st.includes('tarde')) marks[clean] = 'T';
        else marks[clean] = 'A';
      });
      return { date: p.fecha, marks, curso: p.curso };
    });
}

// ────────────────────────── CLASIFICACIÓN DE TRAYECTORIAS (RES. 1650/24) ──────────────────────────

export interface StudentRiskDetail {
  student: Student;
  riskCount: number;
  riskSubjects: { name: string; reason: string }[];
  bucket: 'all_approved' | 'one_two' | 'three_four' | 'five_plus';
}

/**
 * Clasifica a cada estudiante de un curso según cantidad de materias con
 * TEP, TED o calificación numérica de 1 a 6 (en 1° o 2° cuatrimestre sin acreditar).
 */
export function classifyStudentsByRisk(
  students: Student[],
  subjects: Subject[],
  grades: StudentGradeRecord[]
): {
  details: StudentRiskDetail[];
  counts: {
    all_approved: number;
    one_two: number;
    three_four: number;
    five_plus: number;
    total: number;
  };
} {
  const gradeMap = new Map<string, StudentGradeRecord>();
  grades.forEach((g) => gradeMap.set(`${g.studentDni}_${g.subjectId}`, g));

  const details: StudentRiskDetail[] = [];
  const counts = {
    all_approved: 0,
    one_two: 0,
    three_four: 0,
    five_plus: 0,
    total: students.length,
  };

  for (const st of students) {
    const riskSubjects: { name: string; reason: string }[] = [];

    for (const subj of subjects) {
      const g = gradeMap.get(`${st.dni}_${subj.id}`);
      if (!g) continue;
      // Si ya acreditó la materia (por ambos cuatrimestres >=7 o intensificación AA >=4), no está en riesgo
      if (g.estadoAcreditacion === 'acreditada') continue;

      const reasons: string[] = [];
      if (g.val1 === 'TEP' || g.val1 === 'TED') reasons.push(`1°V: ${g.val1}`);
      if (g.nota1 !== null && g.nota1 >= 1 && g.nota1 <= 6) reasons.push(`1°C: ${g.nota1}`);
      if (g.val2 === 'TEP' || g.val2 === 'TED') reasons.push(`2°V: ${g.val2}`);
      if (g.nota2 !== null && g.nota2 >= 1 && g.nota2 <= 6) reasons.push(`2°C: ${g.nota2}`);

      if (reasons.length > 0) {
        riskSubjects.push({ name: subj.name, reason: reasons.join(', ') });
      }
    }

    const riskCount = riskSubjects.length;
    const bucket: StudentRiskDetail['bucket'] =
      riskCount === 0
        ? 'all_approved'
        : riskCount <= 2
          ? 'one_two'
          : riskCount <= 4
            ? 'three_four'
            : 'five_plus';

    counts[bucket] += 1;
    details.push({ student: st, riskCount, riskSubjects, bucket });
  }

  return { details, counts };
}

// ────────────────────────── REPOSITORIO FIRESTORE ──────────────────────────

export async function listTeacherAssignments(
  academicYearId: string,
  teacherDni?: string
): Promise<TeacherAssignment[]> {
  const db = getDb();
  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.TEACHER_ASSIGNMENTS),
      where('academicYearId', '==', academicYearId)
    )
  );
  let list = snap.docs.map((d) => d.data() as TeacherAssignment);
  if (teacherDni) {
    const clean = normalizeDni(teacherDni);
    list = list.filter((a) => normalizeDni(a.teacherDni) === clean);
  }
  return list.sort((a, b) => a.courseLabel.localeCompare(b.courseLabel, 'es', { numeric: true }));
}

export async function saveTeacherAssignment(
  input: Omit<TeacherAssignment, 'id' | 'updatedAt'> & { id?: string }
): Promise<TeacherAssignment> {
  const db = getDb();
  const cleanDni = normalizeDni(input.teacherDni);
  const id =
    input.id ||
    `ta_${input.academicYearId}_${cleanDni}_${input.courseId}_${input.subjectId}`;
  const record: TeacherAssignment = {
    ...input,
    id,
    teacherDni: cleanDni,
    updatedAt: getArgentinaNowISO(),
  };
  await setDoc(doc(db, COLLECTIONS.TEACHER_ASSIGNMENTS, id), record, { merge: true });
  return record;
}

export async function deleteTeacherAssignment(id: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, COLLECTIONS.TEACHER_ASSIGNMENTS, id));
}

export async function listSubjectAttendance(
  academicYearId: string,
  courseId?: string,
  subjectId?: string
): Promise<SubjectAttendanceRecord[]> {
  const db = getDb();
  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.SUBJECT_ATTENDANCE),
      where('academicYearId', '==', academicYearId)
    )
  );
  let rows = snap.docs.map((d) => d.data() as SubjectAttendanceRecord);
  if (courseId) rows = rows.filter((r) => r.courseId === courseId);
  if (subjectId) rows = rows.filter((r) => r.subjectId === subjectId);
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveSubjectAttendance(
  input: Omit<SubjectAttendanceRecord, 'id' | 'updatedAt'>
): Promise<SubjectAttendanceRecord> {
  const db = getDb();
  const id = `${input.academicYearId}_${input.courseId}_${input.subjectId}_${input.date}`;
  const record: SubjectAttendanceRecord = {
    ...input,
    id,
    updatedAt: getArgentinaNowISO(),
  };
  await setDoc(doc(db, COLLECTIONS.SUBJECT_ATTENDANCE, id), record, { merge: true });
  return record;
}

export async function listDailyAttendance(
  academicYearId: string,
  courseId?: string
): Promise<DailyAttendanceRecord[]> {
  const db = getDb();
  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.DAILY_ATTENDANCE),
      where('academicYearId', '==', academicYearId)
    )
  );
  let rows = snap.docs.map((d) => d.data() as DailyAttendanceRecord);
  if (courseId) rows = rows.filter((r) => r.courseId === courseId);
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveDailyAttendance(
  input: Omit<DailyAttendanceRecord, 'id' | 'updatedAt'>
): Promise<DailyAttendanceRecord> {
  const db = getDb();
  const id = `${input.academicYearId}_${input.courseId}_${input.date}`;
  const record: DailyAttendanceRecord = {
    ...input,
    id,
    updatedAt: getArgentinaNowISO(),
  };
  await setDoc(doc(db, COLLECTIONS.DAILY_ATTENDANCE, id), record, { merge: true });
  return record;
}

export async function listNonComputableDays(
  academicYearId: string
): Promise<NonComputableDay[]> {
  const db = getDb();
  const [sgaeSnap, efFeriadosSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, COLLECTIONS.NON_COMPUTABLE_DAYS),
        where('academicYearId', '==', academicYearId)
      )
    ),
    getDocs(collection(db, COLLECTIONS.EF_FERIADOS)).catch(() => null),
  ]);

  const rows = sgaeSnap.docs.map((d) => d.data() as NonComputableDay);
  const existingDates = new Set(rows.map((r) => `${r.date}_${r.scope}`));

  // Incorporar automáticamente los feriados cargados en HOST28_EF sin duplicar
  if (efFeriadosSnap) {
    efFeriadosSnap.docs.forEach((d) => {
      const data = d.data();
      const fecha = String(data.fecha || '');
      if (fecha.startsWith(academicYearId) && !existingDates.has(`${fecha}_all`)) {
        rows.push({
          id: `ef_feriado_${d.id}`,
          academicYearId,
          date: fecha,
          cause: 'Feriado / Asueto escolar',
          detail: String(data.descripcion || 'Feriado (HOST28_EF)'),
          scope: 'all',
          createdBy: 'HOST28_EF',
          createdAt: '',
        });
      }
    });
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveNonComputableDay(
  input: Omit<NonComputableDay, 'id' | 'createdAt'>
): Promise<NonComputableDay> {
  const db = getDb();
  const id = `ncd_${input.academicYearId}_${input.date}_${input.scope}`;
  const record: NonComputableDay = {
    ...input,
    id,
    createdAt: getArgentinaNowISO(),
  };
  await setDoc(doc(db, COLLECTIONS.NON_COMPUTABLE_DAYS, id), record, { merge: true });
  return record;
}

export async function deleteNonComputableDay(id: string): Promise<void> {
  if (id.startsWith('ef_feriado_')) return;
  const db = getDb();
  await deleteDoc(doc(db, COLLECTIONS.NON_COMPUTABLE_DAYS, id));
}

/** Lee los partes reales de Educación Física desde HOST28_EF (solo lectura). */
export async function listEfPartesForYear(academicYearId: string): Promise<EfParteRecord[]> {
  const db = getDb();
  const snap = await getDocs(collection(db, COLLECTIONS.EF_PARTES));
  return snap.docs
    .map((d) => d.data() as EfParteRecord)
    .filter((p) => String(p.fecha || '').startsWith(academicYearId))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}
