import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/database/collections';
import { DEFAULT_SCHOOL_SETTINGS } from '@/lib/database/defaults';
import { getDb } from '@/lib/database/firebase';
import { getArgentinaNowISO, normalizeDni } from '@/lib/utils/formatters';
import type { Permission, RoleId, SchoolSettings, SgaeUser } from '@/types/domain';

// ────────────────────────── CONFIGURACIÓN INSTITUCIONAL ──────────────────────────

export async function getSchoolSettings(): Promise<SchoolSettings> {
  const db = getDb();
  const ref = doc(db, COLLECTIONS.SETTINGS, 'institution');
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, DEFAULT_SCHOOL_SETTINGS);
    return DEFAULT_SCHOOL_SETTINGS;
  }
  const data = snap.data() as Partial<SchoolSettings>;
  const merged: SchoolSettings = { ...DEFAULT_SCHOOL_SETTINGS, ...data };

  // Migrar automáticamente los valores placeholder iniciales a los datos oficiales de la E.E.S. N° 28
  const needsOfficialUpgrade =
    merged.email === 'ees28lanus@abc.gob.ar' || merged.cue === '0600028-00';
  if (needsOfficialUpgrade) {
    const upgraded: SchoolSettings = {
      ...merged,
      email:
        merged.email === 'ees28lanus@abc.gob.ar'
          ? 'secundaria28lanus@abc.gob.ar'
          : merged.email,
      cue: merged.cue === '0600028-00' ? '0617791-00' : merged.cue,
      address:
        merged.address === 'Distrito de Lanús, Provincia de Buenos Aires'
          ? 'Ituzaingó 1762 – Lanús Este'
          : merged.address,
      phone: merged.phone || '4225-2086',
      updatedAt: getArgentinaNowISO(),
    };
    await setDoc(ref, upgraded, { merge: true });
    return upgraded;
  }

  return merged;
}

export async function saveSchoolSettings(
  patch: Partial<SchoolSettings>,
  updatedBy: string
): Promise<SchoolSettings> {
  const db = getDb();
  const current = await getSchoolSettings();
  const next: SchoolSettings = {
    ...current,
    ...patch,
    updatedAt: getArgentinaNowISO(),
    updatedBy,
  };
  await setDoc(doc(db, COLLECTIONS.SETTINGS, 'institution'), next, { merge: true });
  return next;
}

// ────────────────────────── USUARIOS Y PERMISOS SGAE ──────────────────────────

export async function listSgaeUsers(): Promise<SgaeUser[]> {
  const db = getDb();
  const snap = await getDocs(collection(db, COLLECTIONS.SGAE_USERS));
  return snap.docs
    .map((d) => d.data() as SgaeUser)
    .sort((a, b) => a.apellido.localeCompare(b.apellido, 'es'));
}

export async function listEfBaseUsers(): Promise<
  { dni: string; apellido: string; nombre: string; correo: string; rol: string }[]
> {
  const db = getDb();
  const snap = await getDocs(collection(db, COLLECTIONS.EF_USERS));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      dni: normalizeDni(data.dni || d.id),
      apellido: String(data.apellido || ''),
      nombre: String(data.nombre || ''),
      correo: String(data.correo || ''),
      rol: String(data.rol || ''),
    };
  });
}

export async function upsertSgaeUser(input: {
  dni: string;
  apellido: string;
  nombre: string;
  correo: string;
  roleId: RoleId;
  customPermissions?: Permission[];
  active: boolean;
  passwordForNewUser?: string;
}): Promise<SgaeUser> {
  const db = getDb();
  const dni = normalizeDni(input.dni);
  const now = getArgentinaNowISO();
  const ref = doc(db, COLLECTIONS.SGAE_USERS, dni);
  const existing = await getDoc(ref);

  const record: SgaeUser = {
    dni,
    apellido: input.apellido.trim(),
    nombre: input.nombre.trim(),
    correo: input.correo.trim(),
    roleId: input.roleId,
    ...(input.customPermissions && input.customPermissions.length > 0
      ? { customPermissions: input.customPermissions }
      : {}),
    active: input.active,
    createdAt: existing.exists() ? (existing.data().createdAt as string) : now,
    updatedAt: now,
  };

  await setDoc(ref, record, { merge: true });

  // Si el usuario no existe aún en `usuarios/{dni}` (HOST28_EF), crear credencial compartida
  // siguiendo la misma convención de HOST28_EF (contraseña inicial = DNI si no se indica otra).
  // Nunca se guarda una segunda contraseña separada en `sgae_users/{dni}`.
  const efRef = doc(db, COLLECTIONS.EF_USERS, dni);
  const efSnap = await getDoc(efRef);
  if (!efSnap.exists()) {
    await setDoc(efRef, {
      dni,
      password: input.passwordForNewUser?.trim() || dni,
      apellido: record.apellido,
      nombre: record.nombre,
      correo: record.correo,
      rol:
        input.roleId === 'admin' || input.roleId === 'conduccion'
          ? 'Equipo de Conducción'
          : input.roleId === 'preceptoria'
            ? 'Preceptor'
            : 'Secretaría',
    });
  }

  return record;
}

/**
 * Autentica un usuario validando sus credenciales contra `usuarios/{dni}` (compartida con HOST28_EF)
 * y verificando su habilitación explícita en `sgae_users/{dni}`.
 * Nunca otorga acceso administrativo automático a Docentes u otros roles de EF.
 */
export async function authenticateSgaeUser(
  dniRaw: string,
  password: string
): Promise<{ success: true; user: SgaeUser } | { success: false; message: string }> {
  const dni = normalizeDni(dniRaw);
  if (!dni || !password) {
    return { success: false, message: 'Ingresá tu DNI y contraseña.' };
  }

  const db = getDb();
  const efSnap = await getDoc(doc(db, COLLECTIONS.EF_USERS, dni));
  if (!efSnap.exists()) {
    return { success: false, message: 'DNI o contraseña incorrectos.' };
  }

  const efUser = efSnap.data();
  if (String(efUser.password ?? '') !== password) {
    return { success: false, message: 'DNI o contraseña incorrectos.' };
  }

  const sgaeRef = doc(db, COLLECTIONS.SGAE_USERS, dni);
  let sgaeSnap;
  try {
    sgaeSnap = await getDoc(sgaeRef);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const msg = err instanceof Error ? err.message : '';
    if (code === 'permission-denied' || msg.includes('Missing or insufficient permissions')) {
      return {
        success: false,
        message:
          'Las colecciones SGAE aún no están habilitadas en las reglas de Firestore del proyecto partesees28. Publicá el archivo firestore.rules en Firebase Console → Firestore Database → Reglas y volvé a intentar.',
      };
    }
    throw err;
  }

  if (sgaeSnap.exists()) {
    const sgaeUser = sgaeSnap.data() as SgaeUser;
    if (!sgaeUser.active) {
      return {
        success: false,
        message: 'Tu cuenta se encuentra deshabilitada en SGAE. Contactá a Dirección.',
      };
    }
    return { success: true, user: sgaeUser };
  }

  // Bootstrap seguro: únicamente si `sgae_users` está completamente vacía Y el usuario
  // pertenece a "Equipo de Conducción" en HOST28_EF, inicializarlo como Administrador.
  const allSgae = await getDocs(collection(db, COLLECTIONS.SGAE_USERS));
  if (allSgae.empty && efUser.rol === 'Equipo de Conducción') {
    const now = getArgentinaNowISO();
    const bootstrapAdmin: SgaeUser = {
      dni,
      apellido: String(efUser.apellido || 'Administrador'),
      nombre: String(efUser.nombre || 'Usuario'),
      correo: String(efUser.correo || ''),
      roleId: 'admin',
      active: true,
      efRole: String(efUser.rol),
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(sgaeRef, bootstrapAdmin);
    return { success: true, user: bootstrapAdmin };
  }

  return {
    success: false,
    message:
      'Tu usuario existe en Educación Física pero no posee permisos administrativos asignados en SGAE. Solicitá la habilitación al Equipo de Conducción.',
  };
}
