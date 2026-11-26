import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/database/collections';
import {
  buildDefaultCoursesForYear,
  DEFAULT_ACADEMIC_YEAR_2026,
  DEFAULT_SHIFTS,
} from '@/lib/database/defaults';
import { getDb } from '@/lib/database/firebase';
import {
  formatCourseLabels,
  getArgentinaDateISO,
  getArgentinaNowISO,
  normalizeDni,
  parseLegacyCourseCode,
} from '@/lib/utils/formatters';
import {
  listStudents,
  getStudentByDni,
  syncStudentActiveEnrollmentToLegacy,
} from '@/repositories/studentRepository';
import type {
  AcademicYear,
  AcademicYearStatus,
  Course,
  CourseStatus,
  Enrollment,
  EnrollmentMovement,
  EnrollmentStatus,
  MovementType,
  Shift,
  Student,
} from '@/types/domain';

// ────────────────────────── CICLOS LECTIVOS ──────────────────────────

export async function listAcademicYears(): Promise<AcademicYear[]> {
  const db = getDb();
  const snap = await getDocs(collection(db, COLLECTIONS.ACADEMIC_YEARS));
  if (snap.empty) {
    await setDoc(
      doc(db, COLLECTIONS.ACADEMIC_YEARS, DEFAULT_ACADEMIC_YEAR_2026.id),
      DEFAULT_ACADEMIC_YEAR_2026
    );
    return [DEFAULT_ACADEMIC_YEAR_2026];
  }
  return snap.docs
    .map((d) => d.data() as AcademicYear)
    .sort((a, b) => b.year - a.year);
}

export async function saveAcademicYear(input: {
  year: number;
  startDate: string;
  endDate: string;
  status: AcademicYearStatus;
  isDefault: boolean;
  createdBy: string;
  initializeDefaultCourses?: boolean;
}): Promise<AcademicYear> {
  const db = getDb();
  const id = String(input.year);
  const existing = await getDoc(doc(db, COLLECTIONS.ACADEMIC_YEARS, id));

  // Si se marca como predeterminado, desmarcar los demás
  if (input.isDefault) {
    const all = await getDocs(collection(db, COLLECTIONS.ACADEMIC_YEARS));
    const batch = writeBatch(db);
    all.docs.forEach((d) => {
      if (d.id !== id && d.data().isDefault) {
        batch.set(d.ref, { isDefault: false }, { merge: true });
      }
    });
    await batch.commit();
  }

  const record: AcademicYear = {
    id,
    year: input.year,
    startDate: input.startDate,
    endDate: input.endDate,
    status: input.status,
    isDefault: input.isDefault,
    createdAt: existing.exists()
      ? (existing.data().createdAt as string)
      : getArgentinaNowISO(),
    createdBy: existing.exists()
      ? (existing.data().createdBy as string)
      : input.createdBy,
  };

  await setDoc(doc(db, COLLECTIONS.ACADEMIC_YEARS, id), record, { merge: true });

  if (input.initializeDefaultCourses && !existing.exists()) {
    const courses = buildDefaultCoursesForYear(id);
    const batch = writeBatch(db);
    courses.forEach((c) => {
      batch.set(doc(db, COLLECTIONS.COURSES, c.id), c, { merge: true });
    });
    await batch.commit();
  }

  return record;
}

// ────────────────────────── TURNOS ──────────────────────────

export async function listShifts(): Promise<Shift[]> {
  const db = getDb();
  const snap = await getDocs(collection(db, COLLECTIONS.SHIFTS));
  if (snap.empty) {
    const batch = writeBatch(db);
    DEFAULT_SHIFTS.forEach((s) => {
      batch.set(doc(db, COLLECTIONS.SHIFTS, s.id), s);
    });
    await batch.commit();
    return DEFAULT_SHIFTS;
  }
  return snap.docs.map((d) => d.data() as Shift);
}

export async function saveShift(shift: Omit<Shift, 'id'> & { id?: string }): Promise<Shift> {
  const db = getDb();
  const id =
    shift.id ||
    shift.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_');
  const record: Shift = {
    id,
    name: shift.name.trim(),
    code: shift.code.trim().toUpperCase(),
    startTime: shift.startTime || '',
    endTime: shift.endTime || '',
    active: shift.active,
  };
  await setDoc(doc(db, COLLECTIONS.SHIFTS, id), record, { merge: true });
  return record;
}

// ────────────────────────── CURSOS Y DIVISIONES ──────────────────────────

export async function listCourses(academicYearId?: string): Promise<Course[]> {
  const db = getDb();
  const colRef = collection(db, COLLECTIONS.COURSES);
  const snap = academicYearId
    ? await getDocs(query(colRef, where('academicYearId', '==', academicYearId)))
    : await getDocs(colRef);

  if (snap.empty && academicYearId === '2026') {
    const defaults = buildDefaultCoursesForYear('2026');
    const batch = writeBatch(db);
    defaults.forEach((c) => batch.set(doc(db, COLLECTIONS.COURSES, c.id), c));
    await batch.commit();
    return defaults;
  }

  return snap.docs
    .map((d) => d.data() as Course)
    .sort((a, b) => {
      if (a.yearNumber !== b.yearNumber) return a.yearNumber - b.yearNumber;
      return a.division.localeCompare(b.division, 'es', { numeric: true });
    });
}

export async function saveCourse(input: {
  id?: string;
  academicYearId: string;
  yearNumber: number;
  division: string;
  shiftId: string;
  shiftName: string;
  orientation?: string;
  capacity?: number | null;
  status: CourseStatus;
}): Promise<Course> {
  const db = getDb();
  const { label, legacyCode } = formatCourseLabels(input.yearNumber, input.division);
  const divSlug = input.division.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const id = input.id || `${input.academicYearId}_${input.yearNumber}_${divSlug}`;
  const record: Course = {
    id,
    academicYearId: input.academicYearId,
    yearNumber: input.yearNumber,
    division: input.division.trim(),
    legacyCode,
    label,
    shiftId: input.shiftId,
    shiftName: input.shiftName,
    orientation: input.orientation?.trim() || '',
    capacity: input.capacity ?? null,
    status: input.status,
    createdAt: getArgentinaNowISO(),
  };
  await setDoc(doc(db, COLLECTIONS.COURSES, id), record, { merge: true });
  return record;
}

// ────────────────────────── MATRÍCULAS Y MOVIMIENTOS ──────────────────────────

/**
 * Deriva una matrícula compatible desde el registro compartido `alumnos/{dni}` de HOST28_EF
 * (`cursoOrigen` y `turno`, respetando `fechaDeBaja`), para que todos los estudiantes
 * matriculados en el Host de Educación Física aparezcan automáticamente en SGAE
 * en el ciclo lectivo vigente (`2026` o el ciclo por defecto) sin duplicar registros.
 */
export function deriveLegacyEnrollmentForStudent(
  student: Student,
  academicYearId: string,
  courses: Course[]
): Enrollment | null {
  if (student.estadoInstitucional === 'archivado') return null;

  const rawCourse =
    student.cursoOrigen?.trim() ||
    (student.cursoEF && student.cursoEF !== 'No cursa' ? student.cursoEF.trim() : '');
  if (!rawCourse) return null;

  const parsed = parseLegacyCourseCode(rawCourse);
  const matchedCourse =
    courses.find((c) => c.legacyCode === rawCourse || c.label === rawCourse) ||
    (parsed
      ? courses.find(
          (c) => c.yearNumber === parsed.yearNumber && c.division === parsed.division
        )
      : undefined);

  const yearNumber = matchedCourse?.yearNumber ?? parsed?.yearNumber ?? 1;
  const division = matchedCourse?.division ?? parsed?.division ?? '1ª';
  const { label, legacyCode } = matchedCourse
    ? { label: matchedCourse.label, legacyCode: matchedCourse.legacyCode }
    : formatCourseLabels(yearNumber, division);

  const inferredShiftName =
    student.turno?.trim() ||
    matchedCourse?.shiftName ||
    (legacyCode.endsWith('1°') ? 'Mañana' : 'Tarde');
  const inferredShiftId =
    matchedCourse?.shiftId ||
    inferredShiftName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_');

  const isDropped = Boolean(student.fechaDeBaja) || student.estadoInstitucional === 'desvinculado';
  const status: EnrollmentStatus =
    student.estadoInstitucional === 'egresado'
      ? 'egresado'
      : student.estadoInstitucional === 'pase'
        ? 'pase'
        : isDropped
          ? 'baja'
          : 'activa';

  return {
    id: `ef_sync_${academicYearId}_${student.dni}`,
    studentId: student.id,
    studentDni: student.dni,
    academicYearId,
    courseId:
      matchedCourse?.id ??
      `${academicYearId}_${yearNumber}_${division.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`,
    yearNumber,
    division,
    courseLabel: label,
    courseLegacyCode: legacyCode,
    shiftId: inferredShiftId,
    shiftName: inferredShiftName,
    startDate: `${academicYearId}-03-02`,
    endDate: student.fechaDeBaja ?? null,
    status,
    observations: 'Matrícula vinculada desde base compartida HOST28_EF',
    createdBy: 'host28_ef',
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
  };
}

async function getDefaultAcademicYearId(): Promise<string> {
  const years = await listAcademicYears();
  const def = years.find((y) => y.isDefault) || years.find((y) => y.status === 'activo') || years[0];
  return def?.id ?? '2026';
}

export async function listEnrollments(academicYearId?: string): Promise<Enrollment[]> {
  const db = getDb();
  const colRef = collection(db, COLLECTIONS.ENROLLMENTS);
  const snap = academicYearId
    ? await getDocs(query(colRef, where('academicYearId', '==', academicYearId)))
    : await getDocs(colRef);
  const explicit = snap.docs.map((d) => d.data() as Enrollment);

  // Para el ciclo lectivo vigente (o consulta global), complementar automáticamente con
  // las matrículas ya cargadas en `alumnos/{dni}` de HOST28_EF que aún no tengan
  // un registro explícito en `sgae_enrollments`.
  const defaultYearId = await getDefaultAcademicYearId();
  if (!academicYearId || academicYearId === defaultYearId) {
    const targetYear = academicYearId || defaultYearId;
    const explicitDnisForYear = new Set(
      explicit.filter((e) => e.academicYearId === targetYear).map((e) => e.studentDni)
    );
    const [students, courses] = await Promise.all([
      listStudents(),
      listCourses(targetYear),
    ]);

    const derived: Enrollment[] = [];
    for (const st of students) {
      if (explicitDnisForYear.has(st.dni)) continue;
      const enr = deriveLegacyEnrollmentForStudent(st, targetYear, courses);
      if (enr) derived.push(enr);
    }
    return [...explicit, ...derived];
  }

  return explicit;
}

export async function listStudentEnrollments(studentDniRaw: string): Promise<Enrollment[]> {
  const dni = normalizeDni(studentDniRaw);
  const db = getDb();
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.ENROLLMENTS), where('studentDni', '==', dni))
  );
  const explicit = snap.docs.map((d) => d.data() as Enrollment);

  const defaultYearId = await getDefaultAcademicYearId();
  const hasExplicitInDefaultYear = explicit.some((e) => e.academicYearId === defaultYearId);
  if (!hasExplicitInDefaultYear) {
    const [student, courses] = await Promise.all([
      getStudentByDni(dni),
      listCourses(defaultYearId),
    ]);
    if (student) {
      const derived = deriveLegacyEnrollmentForStudent(student, defaultYearId, courses);
      if (derived) explicit.push(derived);
    }
  }

  return explicit.sort(
    (a, b) =>
      b.academicYearId.localeCompare(a.academicYearId) || b.startDate.localeCompare(a.startDate)
  );
}

export async function listMovements(filters?: {
  academicYearId?: string;
  studentDni?: string;
}): Promise<EnrollmentMovement[]> {
  const db = getDb();
  const colRef = collection(db, COLLECTIONS.ENROLLMENT_MOVEMENTS);
  let snap;
  if (filters?.studentDni) {
    snap = await getDocs(
      query(colRef, where('studentDni', '==', normalizeDni(filters.studentDni)))
    );
  } else if (filters?.academicYearId) {
    snap = await getDocs(
      query(colRef, where('academicYearId', '==', filters.academicYearId))
    );
  } else {
    snap = await getDocs(colRef);
  }
  return snap.docs
    .map((d) => d.data() as EnrollmentMovement)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface EnrollStudentInput {
  student: Student;
  academicYearId: string;
  course: Course;
  startDate?: string;
  observations?: string;
  performedByDni: string;
  performedByName: string;
  movementType?: MovementType;
  isCurrentDefaultYear?: boolean;
}

/**
 * Matricula a un estudiante en un curso de un ciclo lectivo.
 * Si ya tiene una matrícula activa en el mismo ciclo lectivo, la cierra
 * conservando su vigencia histórica y registra el movimiento correspondiente
 * (evita dos matrículas activas incompatibles).
 */
export async function enrollStudent(input: EnrollStudentInput): Promise<{
  enrollment: Enrollment;
  movement: EnrollmentMovement;
}> {
  const db = getDb();
  const now = getArgentinaNowISO();
  const effectiveDate = input.startDate || getArgentinaDateISO();

  const existingSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.ENROLLMENTS),
      where('studentDni', '==', input.student.dni),
      where('academicYearId', '==', input.academicYearId)
    )
  );

  const activeExisting = existingSnap.docs
    .map((d) => d.data() as Enrollment)
    .find((e) => e.status === 'activa');

  let previousEnrollment: Enrollment | null = activeExisting ?? null;
  if (!previousEnrollment) {
    const defaultYearId = await getDefaultAcademicYearId();
    if (input.academicYearId === defaultYearId && input.student.cursoOrigen) {
      const courses = await listCourses(input.academicYearId);
      const derived = deriveLegacyEnrollmentForStudent(input.student, input.academicYearId, courses);
      if (derived && derived.status === 'activa') {
        previousEnrollment = derived;
      }
    }
  }

  if (activeExisting && activeExisting.courseId === input.course.id) {
    throw new Error(
      `El estudiante ${input.student.nombre} ya posee una matrícula activa en ${input.course.label} para el ciclo ${input.academicYearId}.`
    );
  }

  let movementType: MovementType = input.movementType ?? 'alta';

  if (activeExisting) {
    // Cerrar matrícula anterior preservando historial
    await setDoc(
      doc(db, COLLECTIONS.ENROLLMENTS, activeExisting.id),
      {
        status: 'cambio_curso' as EnrollmentStatus,
        endDate: effectiveDate,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  if (previousEnrollment && previousEnrollment.courseId !== input.course.id && !input.movementType) {
    if (previousEnrollment.shiftId !== input.course.shiftId) {
      movementType = 'cambio_turno';
    } else if (previousEnrollment.yearNumber === input.course.yearNumber) {
      movementType = 'cambio_division';
    } else {
      movementType = 'cambio_curso';
    }
  }

  const enrollmentId = `enr_${input.academicYearId}_${input.student.dni}_${Date.now()}`;
  const enrollment: Enrollment = {
    id: enrollmentId,
    studentId: input.student.id,
    studentDni: input.student.dni,
    academicYearId: input.academicYearId,
    courseId: input.course.id,
    yearNumber: input.course.yearNumber,
    division: input.course.division,
    courseLabel: input.course.label,
    courseLegacyCode: input.course.legacyCode,
    shiftId: input.course.shiftId,
    shiftName: input.course.shiftName,
    startDate: effectiveDate,
    endDate: null,
    status: 'activa',
    observations: input.observations?.trim() || '',
    createdBy: input.performedByDni,
    createdAt: now,
    updatedAt: now,
  };

  const movementId = `mov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const movement: EnrollmentMovement = {
    id: movementId,
    studentId: input.student.id,
    studentDni: input.student.dni,
    studentFullName: input.student.nombre,
    academicYearId: input.academicYearId,
    enrollmentId,
    type: movementType,
    fromCourseId: previousEnrollment?.courseId ?? null,
    fromCourseLabel: previousEnrollment?.courseLabel ?? null,
    fromShiftName: previousEnrollment?.shiftName ?? null,
    toCourseId: input.course.id,
    toCourseLabel: input.course.label,
    toShiftName: input.course.shiftName,
    effectiveDate,
    reason: input.observations?.trim() || '',
    performedBy: input.performedByDni,
    performedByName: input.performedByName,
    createdAt: now,
  };

  await setDoc(doc(db, COLLECTIONS.ENROLLMENTS, enrollmentId), enrollment);
  await setDoc(doc(db, COLLECTIONS.ENROLLMENT_MOVEMENTS, movementId), movement);

  // Mantener compatibilidad con HOST28_EF si es el ciclo lectivo activo/vigente
  if (input.isCurrentDefaultYear !== false) {
    await syncStudentActiveEnrollmentToLegacy(
      input.student.dni,
      input.course.legacyCode,
      input.course.shiftName
    );
  }

  return { enrollment, movement };
}

export async function closeEnrollment(input: {
  enrollment: Enrollment;
  studentName: string;
  newStatus: Extract<EnrollmentStatus, 'baja' | 'pase' | 'egresado'>;
  effectiveDate?: string;
  reason?: string;
  performedByDni: string;
  performedByName: string;
}): Promise<void> {
  const db = getDb();
  const now = getArgentinaNowISO();
  const effectiveDate = input.effectiveDate || getArgentinaDateISO();

  // Si la matrícula proviene de HOST28_EF (derivada, id ef_sync_*), crear primero el documento
  // explícito en sgae_enrollments y reflejar la fecha de baja en alumnos/{dni} si corresponde.
  await setDoc(
    doc(db, COLLECTIONS.ENROLLMENTS, input.enrollment.id),
    {
      ...input.enrollment,
      status: input.newStatus,
      endDate: effectiveDate,
      observations: input.reason || input.enrollment.observations || '',
      updatedAt: now,
    },
    { merge: true }
  );

  const movType: MovementType =
    input.newStatus === 'pase'
      ? 'pase'
      : input.newStatus === 'egresado'
        ? 'egreso'
        : 'baja';

  const movementId = `mov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const movement: EnrollmentMovement = {
    id: movementId,
    studentId: input.enrollment.studentId,
    studentDni: input.enrollment.studentDni,
    studentFullName: input.studentName,
    academicYearId: input.enrollment.academicYearId,
    enrollmentId: input.enrollment.id,
    type: movType,
    fromCourseId: input.enrollment.courseId,
    fromCourseLabel: input.enrollment.courseLabel,
    fromShiftName: input.enrollment.shiftName,
    toCourseId: null,
    toCourseLabel: null,
    toShiftName: null,
    effectiveDate,
    reason: input.reason || '',
    performedBy: input.performedByDni,
    performedByName: input.performedByName,
    createdAt: now,
  };
  await setDoc(doc(db, COLLECTIONS.ENROLLMENT_MOVEMENTS, movementId), movement);
}

/**
 * Sincroniza (sin duplicar ni sobrescribir) estudiantes heredados de HOST28_EF
 * que tienen `cursoOrigen` pero todavía no poseen matrícula registrada en `sgae_enrollments`
 * para el ciclo lectivo indicado.
 */
export async function syncLegacyEnrollmentsFromStudents(
  academicYearId: string,
  students: Student[],
  courses: Course[],
  performedByDni: string,
  performedByName: string
): Promise<number> {
  const existing = await listEnrollments(academicYearId);
  const enrolledDnis = new Set(existing.map((e) => e.studentDni));
  let created = 0;

  for (const st of students) {
    if (enrolledDnis.has(st.dni)) continue;
    if (!st.cursoOrigen || st.estadoInstitucional === 'archivado') continue;

    let course = courses.find(
      (c) => c.legacyCode === st.cursoOrigen || c.label === st.cursoOrigen
    );
    if (!course) {
      const parsed = parseLegacyCourseCode(st.cursoOrigen);
      if (parsed) {
        course = courses.find(
          (c) => c.yearNumber === parsed.yearNumber && c.division === parsed.division
        );
      }
    }
    if (!course) continue;

    await enrollStudent({
      student: st,
      academicYearId,
      course,
      observations: 'Matrícula sincronizada automáticamente desde base compartida HOST28_EF',
      performedByDni,
      performedByName,
      movementType: 'alta',
      isCurrentDefaultYear: false,
    });
    created += 1;
  }

  return created;
}

export const academicRepository = {
  listAcademicYears,
  saveAcademicYear,
  listShifts,
  saveShift,
  listCourses,
  listCoursesByYear: (academicYearId: string) => listCourses(academicYearId),
  saveCourse,
  listEnrollments,
  listStudentEnrollments,
  listMovements,
  enrollStudent,
  closeEnrollment,
  syncLegacyEnrollmentsFromStudents,
};

