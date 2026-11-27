export type StudentStatus =
  | 'activo'
  | 'egresado'
  | 'pase'
  | 'desvinculado'
  | 'archivado'
  | string;

export interface Student {
  /** Identificador interno permanente (immutable UUID o `stu_${dni}` en registros heredados) */
  id: string;
  /** DNI normalizado (solo dígitos, clave única y Document ID en `alumnos/{dni}`) */
  dni: string;
  apellido: string;
  nombres: string;
  /** Formato heredado de HOST28_EF: "Apellido, Nombre" — mantenido sincronizado */
  nombre: string;
  fechaNacimiento?: string; // YYYY-MM-DD
  anioIngreso: number;
  estadoInstitucional: StudentStatus;
  observaciones?: string;
  fechaEgreso?: string | null;
  fechaPase?: string | null;
  motivoBaja?: string | null;
  /** Campos de compatibilidad con HOST28_EF (preservados sin ruptura) */
  cursoOrigen?: string;
  turno?: string;
  cursoEF?: string;
  noCursaEF?: boolean;
  recursaCursos?: string[];
  fechaDeBaja?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AcademicYearStatus = 'planificacion' | 'activo' | 'cerrado';

export interface AcademicYear {
  id: string; // e.g. "2026"
  year: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: AcademicYearStatus;
  isDefault: boolean;
  createdAt: string;
  createdBy: string;
}

export interface Shift {
  id: string;
  name: string; // Mañana, Tarde, Vespertino, Noche, etc.
  code: string; // M, T, V, N
  startTime?: string;
  endTime?: string;
  active: boolean;
}

export type CourseStatus = 'activo' | 'inactivo';

export interface Course {
  id: string;
  academicYearId: string;
  yearNumber: number; // 1..7
  division: string; // "1ª", "2ª", "A", etc.
  /** Etiqueta compatible con HOST28_EF (ej. "1°1°", "3°2°") */
  legacyCode: string;
  /** Etiqueta formal (ej. "1° 1ª") */
  label: string;
  shiftId: string;
  shiftName: string;
  orientation?: string;
  capacity?: number | null;
  status: CourseStatus;
  createdAt: string;
}

export type EnrollmentStatus = 'activa' | 'cambio_curso' | 'baja' | 'pase' | 'egresado';

export interface Enrollment {
  id: string;
  studentId: string;
  studentDni: string;
  academicYearId: string;
  courseId: string;
  /** Derivados del curso principal para lectura rápida y trazabilidad histórica */
  yearNumber: number;
  division: string;
  courseLabel: string;
  courseLegacyCode: string;
  shiftId: string;
  shiftName: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null;
  status: EnrollmentStatus;
  observations?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type MovementType =
  | 'alta'
  | 'cambio_curso'
  | 'cambio_division'
  | 'cambio_turno'
  | 'baja'
  | 'pase'
  | 'egreso'
  | 'migracion_anual';

export interface EnrollmentMovement {
  id: string;
  studentId: string;
  studentDni: string;
  studentFullName: string;
  academicYearId: string;
  enrollmentId: string;
  type: MovementType;
  fromCourseId?: string | null;
  fromCourseLabel?: string | null;
  fromShiftName?: string | null;
  toCourseId?: string | null;
  toCourseLabel?: string | null;
  toShiftName?: string | null;
  effectiveDate: string; // YYYY-MM-DD
  reason?: string;
  performedBy: string;
  performedByName: string;
  createdAt: string;
}

export type CertificateTypeCode =
  | 'alumno_regular'
  | 'salario_familiar'
  | 'constancia_general'
  | string;

export type CertificateStatus = 'emitido' | 'anulado' | 'reemplazado';

export interface CertificateTemplate {
  id: string;
  code: CertificateTypeCode;
  name: string;
  title: string;
  body: string;
  footerNote?: string;
  version: number;
  active: boolean;
  isSystem?: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface CertificateSnapshot {
  apellido: string;
  nombres: string;
  apellidoNombre: string;
  dni: string;
  anio: string;
  division: string;
  turno: string;
  cicloLectivo: string;
  fechaEmision: string;
  destinatario: string;
  motivo: string;
  textoPersonalizado: string;
  observaciones: string;
  autoridadFirmante: string;
  nombreInstitucion: string;
  numeroEscuela: string;
  distrito: string;
  provincia: string;
  lugarEmision: string;
  cue: string;
  cueAnexo?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  renderedTitle: string;
  renderedBody: string;
  templateVersion: number;
}

export interface Certificate {
  id: string;
  certificateNumber: string; // e.g. "2026-000001"
  typeCode: CertificateTypeCode;
  typeName: string;
  studentId: string;
  studentDni: string;
  enrollmentId: string;
  academicYearId: string;
  issueDate: string; // YYYY-MM-DD (editable por el emisor)
  generatedAt: string; // ISO timestamp real en America/Argentina/Buenos_Aires
  token: string; // Token único criptográficamente seguro
  validationUrl: string;
  status: CertificateStatus;
  signatureType: 'olografa';
  templateId: string;
  templateVersion: number;
  issuedByDni: string;
  issuedByName: string;
  pdfStoragePath?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  replacedByCertificateId?: string | null;
  replacedByCertificateNumber?: string | null;
  replacesCertificateId?: string | null;
  idempotencyKey?: string | null;
  snapshot: CertificateSnapshot;
}

export interface SchoolSettings {
  institutionName: string;
  schoolNumber: string;
  cue: string;
  cueAnexo: string;
  educationRegion: string;
  district: string;
  province: string;
  locality: string;
  issuePlace: string;
  educationLevel: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
  secondaryLogoUrl: string;
  primaryColor: string;
  accentColor: string;
  directorName: string;
  secretaryName: string;
  authorizedSigners: string[];
  letterheadHeader: string;
  numberingFormat: string;
  validationDisclaimer: string;
  customStudentStatuses: string[];
  updatedAt: string;
  updatedBy: string;
}

export type RoleId =
  | 'admin'
  | 'conduccion'
  | 'secretaria'
  | 'preceptoria'
  | 'docente'
  | 'consulta';

export type Permission =
  | 'students:read'
  | 'students:create'
  | 'students:edit'
  | 'students:import'
  | 'students:export'
  | 'enrollments:manage'
  | 'academic_years:manage'
  | 'certificates:issue'
  | 'certificates:issue_bulk'
  | 'certificates:cancel'
  | 'templates:manage'
  | 'settings:manage'
  | 'users:manage'
  | 'audit:read';

export interface SgaeUser {
  dni: string;
  apellido: string;
  nombre: string;
  correo: string;
  roleId: RoleId;
  customPermissions?: Permission[];
  active: boolean;
  /** Contraseña solo para compatibilidad si se crea usuario nuevo en `usuarios/{dni}` */
  efRole?: string;
  createdAt: string;
  updatedAt: string;
}

export type AuditOperation =
  | 'student_create'
  | 'student_update'
  | 'student_archive'
  | 'student_import'
  | 'enrollment_create'
  | 'enrollment_change_course'
  | 'enrollment_change_shift'
  | 'enrollment_status_change'
  | 'annual_migration'
  | 'academic_year_create'
  | 'academic_year_update'
  | 'course_create'
  | 'course_update'
  | 'certificate_issue'
  | 'certificate_issue_custom_date'
  | 'certificate_issue_bulk'
  | 'certificate_cancel'
  | 'certificate_replace'
  | 'template_update'
  | 'settings_update'
  | 'user_permissions_update'
  | 'user_create'
  | 'grade_update'
  | 'intensification_update';

// ────────────────────────── RESOLUCIÓN 1650/24 PBA ──────────────────────────

/** Valoración preliminar RITE: TEA (Avanzada), TEP (En Proceso), TED (Discontinua) */
export type PreliminaryValuation = 'TEA' | 'TEP' | 'TED' | '';

/** Estado en instancias de intensificación: AA (Aprobó y Acreditó), CCA (Continúa con Avances), CSA (Continúa sin Avances) */
export type IntensificationResult = 'AA' | 'CCA' | 'CSA' | '';

export type AccreditationStatus = 'en_curso' | 'acreditada' | 'intensificacion' | 'pendiente';

export type IntensificationPeriod =
  | 'diciembre'
  | 'febrero_marzo'
  | 'mayo'
  | 'julio'
  | 'octubre';

export interface Subject {
  id: string;
  yearNumber: number; // 1..6
  name: string;
  area: string;
  active: boolean;
}

export interface StudentGradeRecord {
  id: string; // `${academicYearId}_${studentDni}_${subjectId}`
  academicYearId: string;
  studentDni: string;
  courseId: string;
  subjectId: string;
  subjectName: string;
  val1: PreliminaryValuation;
  nota1: number | null; // 1..10 (acredita >= 7)
  val2: PreliminaryValuation;
  nota2: number | null; // 1..10 (acredita >= 7)
  intDicEstado: IntensificationResult;
  intDicNota: number | null; // 4..10 para acreditar
  intFebEstado: IntensificationResult;
  intFebNota: number | null; // 4..10 para acreditar
  notaFinal: number | null;
  estadoAcreditacion: AccreditationStatus;
  observaciones?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface IntensificationPlan {
  id: string;
  academicYearId: string;
  studentDni: string;
  studentName: string;
  courseLabel: string;
  subjectId: string;
  subjectName: string;
  period: IntensificationPeriod;
  modality: 'intensificacion' | 'profundizacion' | 'recursada_edte';
  contenidosPrioritarios: string;
  result: IntensificationResult;
  calificacion: number | null; // 4..10 si AA
  docenteResponsable?: string;
  observaciones?: string;
  updatedAt: string;
  updatedBy: string;
}

// ────────────────────────── ASIGNACIONES DOCENTES Y ASISTENCIA ──────────────────────────

/** Días hábiles: 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes */
export interface TeacherAssignment {
  id: string;
  academicYearId: string;
  teacherDni: string;
  teacherName: string;
  courseId: string;
  courseLabel: string;
  subjectId: string;
  subjectName: string;
  daysOfWeek: number[]; // [1..5]
  schedule: string; // ej. "08:00 - 10:00"
  updatedAt: string;
}

export type AttendanceMark = 'P' | 'A' | 'T' | 'J'; // Presente, Ausente, Tarde (0.5), Justificada

export interface SubjectAttendanceRecord {
  id: string; // `${academicYearId}_${courseId}_${subjectId}_${date}`
  academicYearId: string;
  courseId: string;
  subjectId: string;
  subjectName: string;
  date: string; // YYYY-MM-DD
  schedule?: string;
  teacherDni: string;
  teacherName: string;
  marks: Record<string, AttendanceMark>; // dni -> mark
  observations?: string;
  updatedAt: string;
}

export interface DailyAttendanceRecord {
  id: string; // `${academicYearId}_${courseId}_${date}`
  academicYearId: string;
  courseId: string;
  courseLabel: string;
  date: string; // YYYY-MM-DD (Lunes a Viernes)
  takenByDni: string;
  takenByName: string;
  marks: Record<string, AttendanceMark>; // dni -> mark
  observations?: string;
  updatedAt: string;
}

export type NonComputableCause =
  | 'Jornada Institucional'
  | 'Paro / Medida de fuerza'
  | 'Causas climáticas'
  | 'Feriado / Asueto escolar'
  | 'Suspensión por edificio / servicios'
  | 'Otra causa';

export interface NonComputableDay {
  id: string;
  academicYearId: string;
  date: string; // YYYY-MM-DD
  cause: NonComputableCause;
  detail?: string;
  scope: 'all' | string; // 'all' o courseId específico
  createdBy: string;
  createdAt: string;
}

/** Parte leído desde la colección compartida `partes` de HOST28_EF (solo lectura) */
export interface EfParteRecord {
  id: string;
  fecha: string; // YYYY-MM-DD
  curso: string; // ej. "1°1°"
  turno?: string;
  huboClase?: string; // "Sí" | "No"
  motivoSuspension?: string;
  asistencia?: Record<string, string>; // dni -> "Presente" | "Ausente"
}

export interface AuditLog {
  id: string;
  userDni: string;
  userName: string;
  userRole: RoleId;
  timestamp: string;
  operation: AuditOperation;
  entity: string;
  entityId: string;
  changedFields?: string[];
  previousSummary?: Record<string, unknown> | null;
  newSummary?: Record<string, unknown> | null;
  reason?: string;
}

export type ValidationState =
  | 'verified'
  | 'cancelled'
  | 'replaced'
  | 'not_found'
  | 'error';

export interface PublicValidationResponse {
  state: ValidationState;
  verifiedDniMatch?: boolean;
  message?: string;
  certificate?: {
    certificateNumber: string;
    token: string;
    typeName: string;
    status: CertificateStatus;
    signatureType: 'olografa';
    issueDate: string;
    issuePlace: string;
    academicYear: string;
    year: string;
    division: string;
    shift: string;
    institutionName: string;
    schoolNumber: string;
    logoUrl?: string;
    studentDisplay: string; // Minimizado por defecto; completo tras verificar DNI
    dniMasked: string; // ej. "**.*45.678"
    dniFull?: string; // Solo si verifiedDniMatch === true
    cancellationReason?: string | null;
    replacedByCertificateNumber?: string | null;
    disclaimer: string;
  };
}
