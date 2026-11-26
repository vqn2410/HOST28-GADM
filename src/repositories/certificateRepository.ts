import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  where,
} from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/database/collections';
import {
  DEFAULT_CERTIFICATE_TEMPLATES,
  DEFAULT_VALIDATION_DISCLAIMER,
} from '@/lib/database/defaults';
import { getDb } from '@/lib/database/firebase';
import {
  buildValidationUrl,
  formatDateLongAR,
  formatDniDisplay,
  generateSecureToken,
  getArgentinaNowISO,
  maskDni,
  maskStudentName,
  normalizeDni,
  renderTemplate,
} from '@/lib/utils/formatters';
import type {
  Certificate,
  CertificateSnapshot,
  CertificateTemplate,
  Enrollment,
  PublicValidationResponse,
  SchoolSettings,
  Student,
} from '@/types/domain';

// ────────────────────────── PLANTILLAS VERSIONADAS ──────────────────────────

export async function listTemplates(): Promise<CertificateTemplate[]> {
  const db = getDb();
  const snap = await getDocs(collection(db, COLLECTIONS.CERTIFICATE_TEMPLATES));
  if (snap.empty) {
    for (const tpl of DEFAULT_CERTIFICATE_TEMPLATES) {
      await setDoc(doc(db, COLLECTIONS.CERTIFICATE_TEMPLATES, tpl.id), tpl);
    }
    return DEFAULT_CERTIFICATE_TEMPLATES;
  }

  const existing = snap.docs.map((d) => d.data() as CertificateTemplate);
  const existingIds = new Set(existing.map((t) => t.id));

  // Incorporar automáticamente nuevas plantillas del sistema que no existían aún en Firestore
  for (const defTpl of DEFAULT_CERTIFICATE_TEMPLATES) {
    if (!existingIds.has(defTpl.id)) {
      await setDoc(doc(db, COLLECTIONS.CERTIFICATE_TEMPLATES, defTpl.id), defTpl);
      existing.push(defTpl);
    }
  }

  return existing;
}

export async function saveTemplate(
  tpl: Omit<CertificateTemplate, 'version' | 'updatedAt'> & { version?: number }
): Promise<CertificateTemplate> {
  const db = getDb();
  const ref = doc(db, COLLECTIONS.CERTIFICATE_TEMPLATES, tpl.id);
  const existing = await getDoc(ref);
  const nextVersion = existing.exists()
    ? Number(existing.data().version || 1) + 1
    : 1;

  const record: CertificateTemplate = {
    ...tpl,
    version: nextVersion,
    updatedAt: getArgentinaNowISO(),
  };
  await setDoc(ref, record, { merge: true });
  return record;
}

// ────────────────────────── NUMERACIÓN ATÓMICA ──────────────────────────

/**
 * Secuencia inicial por año de emisión (la próxima emisión suma +1).
 * Para 2026, el primer certificado emitido arranca en `2026-023451`.
 */
export const INITIAL_CERTIFICATE_SEQUENCE_BY_YEAR: Record<string, number> = {
  '2026': 23450,
};

export function computeNextSequence(issueYear: string, currentSequence: number): number {
  const floor = INITIAL_CERTIFICATE_SEQUENCE_BY_YEAR[issueYear] ?? 0;
  return Math.max(currentSequence, floor) + 1;
}

export function formatCertificateNumber(issueYear: string, sequence: number): string {
  return `${issueYear}-${String(sequence).padStart(6, '0')}`;
}

/**
 * Genera numeración correlativa atómica por año de emisión (`2026-023451`, `2026-023452`, ...).
 */
export async function nextCertificateNumber(issueYear: string): Promise<string> {
  const db = getDb();
  const counterRef = doc(db, COLLECTIONS.CERTIFICATE_COUNTERS, issueYear);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data().lastSequence || 0) : 0;
    const next = computeNextSequence(issueYear, current);
    tx.set(
      counterRef,
      {
        year: issueYear,
        lastSequence: next,
        updatedAt: getArgentinaNowISO(),
      },
      { merge: true }
    );
    return next;
  });
  return formatCertificateNumber(issueYear, seq);
}

// ────────────────────────── EMISIÓN DE CERTIFICADOS ──────────────────────────

export interface IssueCertificateInput {
  template: CertificateTemplate;
  student: Student;
  enrollment: Enrollment;
  settings: SchoolSettings;
  issueDate: string; // YYYY-MM-DD
  cicloLectivoDestino?: string; // ej. "2027" para constancia v2 de inscripción
  destinatario: string;
  motivo: string;
  textoPersonalizado: string;
  observaciones: string;
  autoridadFirmante: string;
  issuedByDni: string;
  issuedByName: string;
  replacesCertificateId?: string | null;
  idempotencyKey?: string | null;
}

export function buildCertificateSnapshot(
  input: IssueCertificateInput,
  certificateNumber: string,
  token: string,
  validationUrl: string
): CertificateSnapshot {
  const apellidoNombre = `${input.student.apellido}, ${input.student.nombres}`;
  const vars: Record<string, string> = {
    apellido: input.student.apellido,
    nombre: input.student.nombres,
    apellidoNombre,
    dni: formatDniDisplay(input.student.dni),
    anio: `${input.enrollment.yearNumber}°`,
    division: input.enrollment.division,
    turno: input.enrollment.shiftName,
    cicloLectivo: input.enrollment.academicYearId,
    cicloLectivoDestino:
      input.cicloLectivoDestino ||
      String((Number(input.enrollment.academicYearId) || new Date().getFullYear()) + 1),
    fechaEmision: formatDateLongAR(input.issueDate),
    nombreInstitucion: input.settings.institutionName,
    numeroEscuela: input.settings.schoolNumber,
    distrito: input.settings.district,
    provincia: input.settings.province,
    cue: input.settings.cue,
    destinatario: input.destinatario || 'ante quien corresponda',
    motivo: input.motivo || '',
    textoPersonalizado: input.textoPersonalizado || '',
    numeroCertificado: certificateNumber,
    token,
    urlValidacion: validationUrl,
  };

  return {
    apellido: input.student.apellido,
    nombres: input.student.nombres,
    apellidoNombre,
    dni: input.student.dni,
    anio: `${input.enrollment.yearNumber}°`,
    division: input.enrollment.division,
    turno: input.enrollment.shiftName,
    cicloLectivo: input.enrollment.academicYearId,
    fechaEmision: input.issueDate,
    destinatario: vars.destinatario,
    motivo: input.motivo || '',
    textoPersonalizado: input.textoPersonalizado || '',
    observaciones: input.observaciones || '',
    autoridadFirmante: input.autoridadFirmante || '',
    nombreInstitucion: input.settings.institutionName,
    numeroEscuela: input.settings.schoolNumber,
    distrito: input.settings.district,
    provincia: input.settings.province,
    lugarEmision: input.settings.issuePlace,
    cue: input.settings.cue,
    cueAnexo: input.settings.cueAnexo,
    direccion: input.settings.address,
    telefono: input.settings.phone,
    email: input.settings.email,
    renderedTitle: renderTemplate(input.template.title, vars),
    renderedBody: renderTemplate(input.template.body, vars),
    templateVersion: input.template.version,
  };
}

export async function issueCertificate(input: IssueCertificateInput): Promise<Certificate> {
  const db = getDb();

  // Prevención de duplicados accidentales por idempotencyKey
  if (input.idempotencyKey) {
    const dupSnap = await getDocs(
      query(
        collection(db, COLLECTIONS.CERTIFICATES),
        where('idempotencyKey', '==', input.idempotencyKey)
      )
    );
    if (!dupSnap.empty) {
      return dupSnap.docs[0].data() as Certificate;
    }
  }

  const issueYear = input.issueDate.slice(0, 4) || String(new Date().getFullYear());
  const certificateNumber = await nextCertificateNumber(issueYear);
  const token = generateSecureToken(24);
  const validationUrl = buildValidationUrl(token);
  const generatedAt = getArgentinaNowISO();
  const id = `cert_${certificateNumber.replace(/[^0-9]/g, '')}_${Math.random().toString(36).slice(2, 6)}`;

  const snapshot = buildCertificateSnapshot(input, certificateNumber, token, validationUrl);

  const cert: Certificate = {
    id,
    certificateNumber,
    typeCode: input.template.code,
    typeName: input.template.name,
    studentId: input.student.id,
    studentDni: input.student.dni,
    enrollmentId: input.enrollment.id,
    academicYearId: input.enrollment.academicYearId,
    issueDate: input.issueDate,
    generatedAt,
    token,
    validationUrl,
    status: 'emitido',
    signatureType: 'olografa',
    templateId: input.template.id,
    templateVersion: input.template.version,
    issuedByDni: input.issuedByDni,
    issuedByName: input.issuedByName,
    pdfStoragePath: null,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    replacedByCertificateId: null,
    replacedByCertificateNumber: null,
    replacesCertificateId: input.replacesCertificateId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    snapshot,
  };

  await setDoc(doc(db, COLLECTIONS.CERTIFICATES, id), cert);

  // Si reemplaza a otro certificado, marcar el anterior como 'reemplazado'
  if (input.replacesCertificateId) {
    await setDoc(
      doc(db, COLLECTIONS.CERTIFICATES, input.replacesCertificateId),
      {
        status: 'reemplazado',
        replacedByCertificateId: id,
        replacedByCertificateNumber: certificateNumber,
        cancelledAt: generatedAt,
        cancelledBy: input.issuedByName,
      },
      { merge: true }
    );
  }

  return cert;
}

export async function listCertificates(filters?: {
  academicYearId?: string;
  studentDni?: string;
}): Promise<Certificate[]> {
  const db = getDb();
  const colRef = collection(db, COLLECTIONS.CERTIFICATES);
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
    .map((d) => d.data() as Certificate)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export async function getCertificateById(id: string): Promise<Certificate | null> {
  const db = getDb();
  const snap = await getDoc(doc(db, COLLECTIONS.CERTIFICATES, id));
  return snap.exists() ? (snap.data() as Certificate) : null;
}

export async function cancelCertificate(
  certId: string,
  reason: string,
  cancelledByName: string
): Promise<void> {
  const db = getDb();
  await setDoc(
    doc(db, COLLECTIONS.CERTIFICATES, certId),
    {
      status: 'anulado',
      cancellationReason: reason.trim(),
      cancelledAt: getArgentinaNowISO(),
      cancelledBy: cancelledByName,
    },
    { merge: true }
  );
}

// ────────────────────────── VALIDACIÓN PÚBLICA (LEY 25.326) ──────────────────────────

/**
 * Valida un token de certificado sin consultar nunca la colección general `alumnos`.
 * En producción (Vercel) utiliza `/api/certificates/validate`; en desarrollo local
 * sin servidor API realiza consulta puntual por token únicamente sobre `sgae_certificates`.
 */
export async function validateCertificatePublic(
  rawToken: string,
  dniConfirmation?: string
): Promise<PublicValidationResponse> {
  const token = rawToken.trim();
  if (!token || token.length < 8) {
    return { state: 'not_found', message: 'Token de validación inválido o inexistente.' };
  }

  const backendMode = (import.meta.env.VITE_BACKEND_MODE as string) || 'auto';
  if (backendMode !== 'firestore') {
    try {
      const res = await fetch('/api/certificates/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          dni: dniConfirmation ? normalizeDni(dniConfirmation) : undefined,
        }),
      });
      if (res.ok) {
        return (await res.json()) as PublicValidationResponse;
      }
      if (res.status === 404) {
        return { state: 'not_found', message: 'No existe un documento registrado con ese token.' };
      }
      if (res.status === 429) {
        return {
          state: 'error',
          message: 'Demasiadas consultas en poco tiempo. Intentá nuevamente en unos instantes.',
        };
      }
    } catch {
      // En modo `auto` local (vite dev sin /api), continuar con fallback Firestore seguro
      if (backendMode === 'api') {
        return {
          state: 'error',
          message: 'No se pudo conectar con el servicio de validación institucional.',
        };
      }
    }
  }

  try {
    const db = getDb();
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.CERTIFICATES), where('token', '==', token))
    );
    if (snap.empty) {
      return {
        state: 'not_found',
        message: 'No se encontró ningún documento emitido con el token ingresado.',
      };
    }

    const cert = snap.docs[0].data() as Certificate;
    const cleanInputDni = dniConfirmation ? normalizeDni(dniConfirmation) : '';
    const dniMatches = Boolean(cleanInputDni && cleanInputDni === normalizeDni(cert.snapshot.dni));

    const state =
      cert.status === 'anulado'
        ? 'cancelled'
        : cert.status === 'reemplazado'
          ? 'replaced'
          : 'verified';

    return {
      state,
      verifiedDniMatch: dniMatches,
      certificate: {
        certificateNumber: cert.certificateNumber,
        token: cert.token,
        typeName: cert.typeName,
        status: cert.status,
        signatureType: 'olografa',
        issueDate: cert.issueDate,
        issuePlace: cert.snapshot.lugarEmision,
        academicYear: cert.snapshot.cicloLectivo,
        year: cert.snapshot.anio,
        division: cert.snapshot.division,
        shift: cert.snapshot.turno,
        institutionName: cert.snapshot.nombreInstitucion,
        schoolNumber: cert.snapshot.numeroEscuela,
        logoUrl: '/logo.png',
        studentDisplay: dniMatches
          ? cert.snapshot.apellidoNombre
          : maskStudentName(cert.snapshot.apellido, cert.snapshot.nombres),
        dniMasked: maskDni(cert.snapshot.dni),
        dniFull: dniMatches ? formatDniDisplay(cert.snapshot.dni) : undefined,
        cancellationReason: cert.cancellationReason,
        replacedByCertificateNumber: cert.replacedByCertificateNumber,
        disclaimer: DEFAULT_VALIDATION_DISCLAIMER,
      },
    };
  } catch {
    return {
      state: 'error',
      message: 'Error temporal al verificar el documento. Por favor intentá nuevamente.',
    };
  }
}

export async function getCertificateByToken(token: string): Promise<Certificate | null> {
  const db = getDb();
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.CERTIFICATES), where('token', '==', token.trim()))
  );
  if (snap.empty) return null;
  return snap.docs[0].data() as Certificate;
}

export const certificateRepository = {
  listTemplates,
  saveTemplate,
  nextCertificateNumber,
  buildCertificateSnapshot,
  issueCertificate,
  listCertificates,
  getCertificateById,
  getByToken: getCertificateByToken,
  cancelCertificate,
  validateCertificatePublic,
};

