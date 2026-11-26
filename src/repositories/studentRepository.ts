import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/database/collections';
import { getDb } from '@/lib/database/firebase';
import {
  buildLegacyFullName,
  getArgentinaNowISO,
  normalizeDni,
  parseLegacyName,
} from '@/lib/utils/formatters';
import type { Student, StudentStatus } from '@/types/domain';

/**
 * Adapta un documento físico de `alumnos/{dni}` (incluyendo registros heredados
 * de HOST28_EF que solo tienen `dni`, `nombre`, `cursoOrigen`, `turno`, `cursoEF`)
 * al modelo canónico `Student` de SGAE sin perder ningún campo de EF.
 */
export function adaptFirestoreToStudent(docId: string, raw: Record<string, unknown>): Student {
  const dni = normalizeDni((raw.dni as string) || docId);
  const legacyNombre = String(raw.nombre ?? '').trim();
  const parsed = parseLegacyName(legacyNombre);
  const apellido = String(raw.apellido ?? '').trim() || parsed.apellido;
  const nombres = String(raw.nombres ?? '').trim() || parsed.nombres;
  const nombre = legacyNombre || buildLegacyFullName(apellido, nombres);

  const fechaDeBaja = (raw.fechaDeBaja as string | null | undefined) ?? null;
  const inferredStatus: StudentStatus =
    (raw.estadoInstitucional as StudentStatus) ||
    (fechaDeBaja ? 'desvinculado' : 'activo');

  const now = getArgentinaNowISO();
  return {
    id: String(raw.id || `stu_${dni}`),
    dni,
    apellido,
    nombres,
    nombre,
    fechaNacimiento: (raw.fechaNacimiento as string) || '',
    anioIngreso: Number(raw.anioIngreso) || new Date().getFullYear(),
    estadoInstitucional: inferredStatus,
    observaciones: String(raw.observaciones ?? ''),
    fechaEgreso: (raw.fechaEgreso as string | null) ?? null,
    fechaPase: (raw.fechaPase as string | null) ?? null,
    motivoBaja: (raw.motivoBaja as string | null) ?? null,
    cursoOrigen: (raw.cursoOrigen as string) || undefined,
    turno: (raw.turno as string) || undefined,
    cursoEF: (raw.cursoEF as string) || undefined,
    noCursaEF: Boolean(raw.noCursaEF),
    recursaCursos: Array.isArray(raw.recursaCursos)
      ? (raw.recursaCursos as string[])
      : [],
    fechaDeBaja,
    createdAt: String(raw.createdAt || now),
    updatedAt: String(raw.updatedAt || now),
  };
}

export async function listStudents(): Promise<Student[]> {
  const db = getDb();
  const snap = await getDocs(collection(db, COLLECTIONS.STUDENTS));
  const list = snap.docs.map((d) => adaptFirestoreToStudent(d.id, d.data()));
  return list.sort((a, b) => {
    const cmp = a.apellido.localeCompare(b.apellido, 'es', { sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    return a.nombres.localeCompare(b.nombres, 'es', { sensitivity: 'base' });
  });
}

export async function getStudentByDni(dniRaw: string): Promise<Student | null> {
  const dni = normalizeDni(dniRaw);
  if (!dni) return null;
  const db = getDb();
  const snap = await getDoc(doc(db, COLLECTIONS.STUDENTS, dni));
  if (!snap.exists()) return null;
  return adaptFirestoreToStudent(snap.id, snap.data());
}

export interface CreateStudentInput {
  apellido: string;
  nombres: string;
  dni: string;
  fechaNacimiento?: string;
  anioIngreso: number;
  estadoInstitucional: StudentStatus;
  observaciones?: string;
  fechaEgreso?: string | null;
  fechaPase?: string | null;
  motivoBaja?: string | null;
  cursoOrigen?: string;
  turno?: string;
}

export async function createStudent(input: CreateStudentInput): Promise<Student> {
  const db = getDb();
  const dni = normalizeDni(input.dni);
  if (!dni) throw new Error('El DNI es obligatorio y debe contener solo números.');

  const ref = doc(db, COLLECTIONS.STUDENTS, dni);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    throw new Error(`Ya existe un estudiante registrado con DNI ${dni}.`);
  }

  const now = getArgentinaNowISO();
  const apellido = input.apellido.trim();
  const nombres = input.nombres.trim();
  const nombre = buildLegacyFullName(apellido, nombres);

  const payload: Student = {
    id: `stu_${dni}`,
    dni,
    apellido,
    nombres,
    nombre,
    fechaNacimiento: input.fechaNacimiento?.trim() || '',
    anioIngreso: Number(input.anioIngreso) || new Date().getFullYear(),
    estadoInstitucional: input.estadoInstitucional || 'activo',
    observaciones: input.observaciones?.trim() || '',
    fechaEgreso: input.fechaEgreso ?? null,
    fechaPase: input.fechaPase ?? null,
    motivoBaja: input.motivoBaja ?? null,
    // Campos compatibles con HOST28_EF
    cursoOrigen: input.cursoOrigen || '',
    turno: input.turno || '',
    cursoEF: input.cursoOrigen || '',
    noCursaEF: false,
    recursaCursos: [],
    fechaDeBaja: null,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(ref, payload, { merge: true });
  return payload;
}

export async function updateStudent(
  dniRaw: string,
  patch: Partial<CreateStudentInput>
): Promise<Student> {
  const db = getDb();
  const dni = normalizeDni(dniRaw);
  const ref = doc(db, COLLECTIONS.STUDENTS, dni);
  const existingSnap = await getDoc(ref);
  if (!existingSnap.exists()) {
    throw new Error(`No se encontró el estudiante con DNI ${dni}.`);
  }

  const current = adaptFirestoreToStudent(existingSnap.id, existingSnap.data());
  const apellido = patch.apellido !== undefined ? patch.apellido.trim() : current.apellido;
  const nombres = patch.nombres !== undefined ? patch.nombres.trim() : current.nombres;
  const nombre = buildLegacyFullName(apellido, nombres);
  const now = getArgentinaNowISO();

  const updateFields: Record<string, unknown> = {
    id: current.id,
    dni,
    apellido,
    nombres,
    nombre,
    updatedAt: now,
  };

  if (patch.fechaNacimiento !== undefined) updateFields.fechaNacimiento = patch.fechaNacimiento || '';
  if (patch.anioIngreso !== undefined) updateFields.anioIngreso = Number(patch.anioIngreso);
  if (patch.estadoInstitucional !== undefined) {
    updateFields.estadoInstitucional = patch.estadoInstitucional;
    if (patch.estadoInstitucional === 'activo') {
      updateFields.fechaDeBaja = null;
    }
  }
  if (patch.observaciones !== undefined) updateFields.observaciones = patch.observaciones || '';
  if (patch.fechaEgreso !== undefined) updateFields.fechaEgreso = patch.fechaEgreso ?? null;
  if (patch.fechaPase !== undefined) updateFields.fechaPase = patch.fechaPase ?? null;
  if (patch.motivoBaja !== undefined) updateFields.motivoBaja = patch.motivoBaja ?? null;

  // Escritura aditiva `{ merge: true }` — nunca elimina campos propios de HOST28_EF
  await setDoc(ref, updateFields, { merge: true });
  const updated = await getDoc(ref);
  return adaptFirestoreToStudent(updated.id, updated.data() ?? {});
}

export async function archiveStudent(dniRaw: string, reason?: string): Promise<Student> {
  return updateStudent(dniRaw, {
    estadoInstitucional: 'archivado',
    motivoBaja: reason || 'Registro archivado administrativamente',
  });
}

/**
 * Mantiene sincronizados `cursoOrigen` y `turno` en `alumnos/{dni}` para que
 * HOST28_EF refleje automáticamente la matrícula activa del ciclo vigente,
 * sin sobrescribir `cursoEF` ni `recursaCursos` si ya fueron configurados en EF.
 */
export async function syncStudentActiveEnrollmentToLegacy(
  dniRaw: string,
  courseLegacyCode: string,
  shiftName: string
): Promise<void> {
  const db = getDb();
  const dni = normalizeDni(dniRaw);
  const ref = doc(db, COLLECTIONS.STUDENTS, dni);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  const patch: Record<string, unknown> = {
    cursoOrigen: courseLegacyCode,
    turno: shiftName,
    updatedAt: getArgentinaNowISO(),
  };
  if (!data.cursoEF) {
    patch.cursoEF = courseLegacyCode;
  }
  await setDoc(ref, patch, { merge: true });
}
