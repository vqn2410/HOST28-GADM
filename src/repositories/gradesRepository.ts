import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/database/collections';
import { getDb } from '@/lib/database/firebase';
import { getArgentinaNowISO, normalizeDni } from '@/lib/utils/formatters';
import type {
  AccreditationStatus,
  IntensificationPlan,
  StudentGradeRecord,
  Subject,
} from '@/types/domain';

// ────────────────────────── MATERIAS DISEÑO CURRICULAR PBA ──────────────────────────

export const DEFAULT_PBA_SUBJECTS: Subject[] = [
  // 1° Año — Ciclo Básico
  { id: 'y1_pl', yearNumber: 1, name: 'Prácticas del Lenguaje', area: 'Lengua', active: true },
  { id: 'y1_mat', yearNumber: 1, name: 'Matemática', area: 'Exactas', active: true },
  { id: 'y1_cs', yearNumber: 1, name: 'Ciencias Sociales', area: 'Sociales', active: true },
  { id: 'y1_cn', yearNumber: 1, name: 'Ciencias Naturales', area: 'Naturales', active: true },
  { id: 'y1_ing', yearNumber: 1, name: 'Inglés', area: 'Idiomas', active: true },
  { id: 'y1_art', yearNumber: 1, name: 'Educación Artística', area: 'Arte', active: true },
  { id: 'y1_ef', yearNumber: 1, name: 'Educación Física', area: 'Educación Física', active: true },
  { id: 'y1_cc', yearNumber: 1, name: 'Construcción de Ciudadanía', area: 'Ciudadanía', active: true },

  // 2° Año — Ciclo Básico
  { id: 'y2_pl', yearNumber: 2, name: 'Prácticas del Lenguaje', area: 'Lengua', active: true },
  { id: 'y2_mat', yearNumber: 2, name: 'Matemática', area: 'Exactas', active: true },
  { id: 'y2_his', yearNumber: 2, name: 'Historia', area: 'Sociales', active: true },
  { id: 'y2_geo', yearNumber: 2, name: 'Geografía', area: 'Sociales', active: true },
  { id: 'y2_bio', yearNumber: 2, name: 'Biología', area: 'Naturales', active: true },
  { id: 'y2_fq', yearNumber: 2, name: 'Físico-Química', area: 'Naturales', active: true },
  { id: 'y2_ing', yearNumber: 2, name: 'Inglés', area: 'Idiomas', active: true },
  { id: 'y2_art', yearNumber: 2, name: 'Educación Artística', area: 'Arte', active: true },
  { id: 'y2_ef', yearNumber: 2, name: 'Educación Física', area: 'Educación Física', active: true },
  { id: 'y2_cc', yearNumber: 2, name: 'Construcción de Ciudadanía', area: 'Ciudadanía', active: true },

  // 3° Año — Ciclo Básico
  { id: 'y3_pl', yearNumber: 3, name: 'Prácticas del Lenguaje', area: 'Lengua', active: true },
  { id: 'y3_mat', yearNumber: 3, name: 'Matemática', area: 'Exactas', active: true },
  { id: 'y3_his', yearNumber: 3, name: 'Historia', area: 'Sociales', active: true },
  { id: 'y3_geo', yearNumber: 3, name: 'Geografía', area: 'Sociales', active: true },
  { id: 'y3_bio', yearNumber: 3, name: 'Biología', area: 'Naturales', active: true },
  { id: 'y3_fq', yearNumber: 3, name: 'Físico-Química', area: 'Naturales', active: true },
  { id: 'y3_ing', yearNumber: 3, name: 'Inglés', area: 'Idiomas', active: true },
  { id: 'y3_art', yearNumber: 3, name: 'Educación Artística', area: 'Arte', active: true },
  { id: 'y3_ef', yearNumber: 3, name: 'Educación Física', area: 'Educación Física', active: true },
  { id: 'y3_cc', yearNumber: 3, name: 'Construcción de Ciudadanía', area: 'Ciudadanía', active: true },

  // 4° Año — Ciclo Superior
  { id: 'y4_lit', yearNumber: 4, name: 'Literatura', area: 'Lengua', active: true },
  { id: 'y4_mat', yearNumber: 4, name: 'Matemática', area: 'Exactas', active: true },
  { id: 'y4_his', yearNumber: 4, name: 'Historia', area: 'Sociales', active: true },
  { id: 'y4_geo', yearNumber: 4, name: 'Geografía', area: 'Sociales', active: true },
  { id: 'y4_bio', yearNumber: 4, name: 'Biología', area: 'Naturales', active: true },
  { id: 'y4_ing', yearNumber: 4, name: 'Inglés', area: 'Idiomas', active: true },
  { id: 'y4_nticx', yearNumber: 4, name: 'NTICx', area: 'Tecnología', active: true },
  { id: 'y4_syad', yearNumber: 4, name: 'Salud y Adolescencia', area: 'Naturales', active: true },
  { id: 'y4_ef', yearNumber: 4, name: 'Educación Física', area: 'Educación Física', active: true },

  // 5° Año — Ciclo Superior
  { id: 'y5_lit', yearNumber: 5, name: 'Literatura', area: 'Lengua', active: true },
  { id: 'y5_mat', yearNumber: 5, name: 'Matemática', area: 'Exactas', active: true },
  { id: 'y5_his', yearNumber: 5, name: 'Historia', area: 'Sociales', active: true },
  { id: 'y5_geo', yearNumber: 5, name: 'Geografía', area: 'Sociales', active: true },
  { id: 'y5_ing', yearNumber: 5, name: 'Inglés', area: 'Idiomas', active: true },
  { id: 'y5_pol', yearNumber: 5, name: 'Política y Ciudadanía', area: 'Ciudadanía', active: true },
  { id: 'y5_art', yearNumber: 5, name: 'Arte / Orientación', area: 'Arte', active: true },
  { id: 'y5_ef', yearNumber: 5, name: 'Educación Física', area: 'Educación Física', active: true },

  // 6° Año — Ciclo Superior
  { id: 'y6_lit', yearNumber: 6, name: 'Literatura', area: 'Lengua', active: true },
  { id: 'y6_mat', yearNumber: 6, name: 'Matemática', area: 'Exactas', active: true },
  { id: 'y6_ing', yearNumber: 6, name: 'Inglés', area: 'Idiomas', active: true },
  { id: 'y6_fil', yearNumber: 6, name: 'Filosofía', area: 'Humanidades', active: true },
  { id: 'y6_tyc', yearNumber: 6, name: 'Trabajo y Ciudadanía', area: 'Ciudadanía', active: true },
  { id: 'y6_art', yearNumber: 6, name: 'Arte / Proyecto Orientación', area: 'Arte', active: true },
  { id: 'y6_ef', yearNumber: 6, name: 'Educación Física', area: 'Educación Física', active: true },
];

// ────────────────────────── MOTOR DE REGLAS RES. 1650/24 PBA ──────────────────────────

/**
 * Calcula el estado de acreditación y nota final de una materia conforme a
 * la Resolución 1650/24 DGCyE (Provincia de Buenos Aires):
 * - Acreditación regular: ambos cuatrimestres con calificación >= 7.
 * - Si adeuda 1 o ambos cuatrimestres (< 7): pasa a Intensificación (Diciembre / Febrero-Marzo).
 * - En Intensificación acredita con estado 'AA' y calificación >= 4.
 */
export function evaluateRes1650Accreditation(record: {
  nota1: number | null;
  nota2: number | null;
  intDicEstado: StudentGradeRecord['intDicEstado'];
  intDicNota: number | null;
  intFebEstado: StudentGradeRecord['intFebEstado'];
  intFebNota: number | null;
}): { estadoAcreditacion: AccreditationStatus; notaFinal: number | null } {
  const { nota1, nota2, intDicEstado, intDicNota, intFebEstado, intFebNota } = record;

  // 1. Si ambos cuatrimestres están aprobados (>= 7): Aprobó y Acreditó
  if (nota1 !== null && nota2 !== null && nota1 >= 7 && nota2 >= 7) {
    const avg = Math.round(((nota1 + nota2) / 2) * 10) / 10;
    return { estadoAcreditacion: 'acreditada', notaFinal: Math.round(avg) };
  }

  // 2. Si acreditó en Intensificación de Diciembre (AA con nota >= 4)
  if (intDicEstado === 'AA' && intDicNota !== null && intDicNota >= 4) {
    return { estadoAcreditacion: 'acreditada', notaFinal: intDicNota };
  }

  // 3. Si acreditó en Intensificación de Febrero-Marzo (AA con nota >= 4)
  if (intFebEstado === 'AA' && intFebNota !== null && intFebNota >= 4) {
    return { estadoAcreditacion: 'acreditada', notaFinal: intFebNota };
  }

  // 4. Si ya tuvo cierre de Febrero-Marzo sin acreditar -> Pendiente de acreditación
  if (intFebEstado === 'CCA' || intFebEstado === 'CSA') {
    return { estadoAcreditacion: 'pendiente', notaFinal: null };
  }

  // 5. Si al menos un cuatrimestre está desaprobado (< 7) -> Intensificación
  if ((nota1 !== null && nota1 < 7) || (nota2 !== null && nota2 < 7)) {
    return { estadoAcreditacion: 'intensificacion', notaFinal: null };
  }

  return { estadoAcreditacion: 'en_curso', notaFinal: null };
}

/**
 * Evalúa la situación global de trayectoria del estudiante según Res. 1650/24 PBA:
 * - 0 pendientes -> Acreditación completa
 * - 1 a 4 pendientes -> Intensificación de materias pendientes (promoción directa sin recursar)
 * - 5 o más pendientes -> Requiere definición EDTE (intensifica hasta 4, recursa el resto)
 */
export function evaluateStudentTrajectoryRes1650(grades: StudentGradeRecord[]): {
  acreditadas: number;
  enIntensificacion: number;
  pendientes: number;
  enCurso: number;
  totalPendientesOIntensif: number;
  requiresEDTE: boolean;
  label: string;
} {
  let acreditadas = 0;
  let enIntensificacion = 0;
  let pendientes = 0;
  let enCurso = 0;

  for (const g of grades) {
    if (g.estadoAcreditacion === 'acreditada') acreditadas += 1;
    else if (g.estadoAcreditacion === 'intensificacion') enIntensificacion += 1;
    else if (g.estadoAcreditacion === 'pendiente') pendientes += 1;
    else enCurso += 1;
  }

  const totalPendientesOIntensif = enIntensificacion + pendientes;
  const requiresEDTE = totalPendientesOIntensif >= 5;

  let label = 'En curso';
  if (grades.length > 0 && totalPendientesOIntensif === 0 && enCurso === 0) {
    label = 'Trayectoria Acreditada';
  } else if (requiresEDTE) {
    label = `Requiere definición EDTE (${totalPendientesOIntensif} materias)`;
  } else if (totalPendientesOIntensif > 0) {
    label = `En Intensificación (${totalPendientesOIntensif} de 4 máx.)`;
  }

  return {
    acreditadas,
    enIntensificacion,
    pendientes,
    enCurso,
    totalPendientesOIntensif,
    requiresEDTE,
    label,
  };
}

// ────────────────────────── REPOSITORIO FIRESTORE ──────────────────────────

export async function listSubjects(yearNumber?: number): Promise<Subject[]> {
  const db = getDb();
  const colRef = collection(db, COLLECTIONS.SUBJECTS);
  const snap = await getDocs(colRef);

  let all: Subject[];
  if (snap.empty) {
    const batch = writeBatch(db);
    DEFAULT_PBA_SUBJECTS.forEach((s) => batch.set(doc(db, COLLECTIONS.SUBJECTS, s.id), s));
    await batch.commit();
    all = DEFAULT_PBA_SUBJECTS;
  } else {
    all = snap.docs.map((d) => d.data() as Subject);
  }

  const filtered = yearNumber ? all.filter((s) => s.yearNumber === yearNumber) : all;
  return filtered.sort((a, b) => a.yearNumber - b.yearNumber || a.name.localeCompare(b.name, 'es'));
}

export async function saveSubject(subject: Omit<Subject, 'id'> & { id?: string }): Promise<Subject> {
  const db = getDb();
  const slug = subject.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 24);
  const id = subject.id || `y${subject.yearNumber}_${slug}_${Date.now().toString(36).slice(-3)}`;
  const record: Subject = {
    id,
    yearNumber: subject.yearNumber,
    name: subject.name.trim(),
    area: subject.area.trim() || 'General',
    active: subject.active,
  };
  await setDoc(doc(db, COLLECTIONS.SUBJECTS, id), record, { merge: true });
  return record;
}

export async function listGrades(filters: {
  academicYearId: string;
  courseId?: string;
  studentDni?: string;
}): Promise<StudentGradeRecord[]> {
  const db = getDb();
  const colRef = collection(db, COLLECTIONS.GRADES);
  const constraints = [where('academicYearId', '==', filters.academicYearId)];
  if (filters.studentDni) {
    constraints.push(where('studentDni', '==', normalizeDni(filters.studentDni)));
  } else if (filters.courseId) {
    constraints.push(where('courseId', '==', filters.courseId));
  }

  try {
    const snap = await getDocs(query(colRef, ...constraints));
    return snap.docs.map((d) => d.data() as StudentGradeRecord);
  } catch {
    // Fallback si falta índice compuesto
    const snap = await getDocs(
      query(colRef, where('academicYearId', '==', filters.academicYearId))
    );
    let rows = snap.docs.map((d) => d.data() as StudentGradeRecord);
    if (filters.studentDni) {
      const clean = normalizeDni(filters.studentDni);
      rows = rows.filter((r) => r.studentDni === clean);
    }
    if (filters.courseId) {
      rows = rows.filter((r) => r.courseId === filters.courseId);
    }
    return rows;
  }
}

export async function saveGradeRecord(
  input: Omit<StudentGradeRecord, 'id' | 'estadoAcreditacion' | 'notaFinal' | 'updatedAt'>
): Promise<StudentGradeRecord> {
  const db = getDb();
  const cleanDni = normalizeDni(input.studentDni);
  const id = `${input.academicYearId}_${cleanDni}_${input.subjectId}`;
  const evalRes = evaluateRes1650Accreditation(input);
  const record: StudentGradeRecord = {
    ...input,
    id,
    studentDni: cleanDni,
    estadoAcreditacion: evalRes.estadoAcreditacion,
    notaFinal: evalRes.notaFinal,
    updatedAt: getArgentinaNowISO(),
  };
  await setDoc(doc(db, COLLECTIONS.GRADES, id), record, { merge: true });
  return record;
}

export async function listIntensificationPlans(
  academicYearId: string
): Promise<IntensificationPlan[]> {
  const db = getDb();
  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.INTENSIFICATION_PLANS),
      where('academicYearId', '==', academicYearId)
    )
  );
  return snap.docs
    .map((d) => d.data() as IntensificationPlan)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveIntensificationPlan(
  input: Omit<IntensificationPlan, 'id' | 'updatedAt'> & { id?: string }
): Promise<IntensificationPlan> {
  const db = getDb();
  const cleanDni = normalizeDni(input.studentDni);
  const id =
    input.id ||
    `int_${input.academicYearId}_${cleanDni}_${input.subjectId}_${input.period}`;
  const record: IntensificationPlan = {
    ...input,
    id,
    studentDni: cleanDni,
    updatedAt: getArgentinaNowISO(),
  };
  await setDoc(doc(db, COLLECTIONS.INTENSIFICATION_PLANS, id), record, { merge: true });
  return record;
}
