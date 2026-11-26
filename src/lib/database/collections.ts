/**
 * Colecciones de Firebase Firestore (proyecto compartido `partesees28`).
 * - `alumnos` y `usuarios` son compartidas con HOST28_EF (solo extensión aditiva).
 * - Todas las colecciones propias de SGAE llevan el prefijo `sgae_` para aislamiento limpio.
 */
export const COLLECTIONS = {
  // Compartidas con HOST28_EF
  STUDENTS: 'alumnos',
  EF_USERS: 'usuarios',

  // Exclusivas de SGAE
  ACADEMIC_YEARS: 'sgae_academic_years',
  SHIFTS: 'sgae_shifts',
  COURSES: 'sgae_courses',
  ENROLLMENTS: 'sgae_enrollments',
  ENROLLMENT_MOVEMENTS: 'sgae_enrollment_movements',
  CERTIFICATES: 'sgae_certificates',
  CERTIFICATE_TEMPLATES: 'sgae_certificate_templates',
  CERTIFICATE_COUNTERS: 'sgae_certificate_counters',
  SETTINGS: 'sgae_settings',
  SGAE_USERS: 'sgae_users',
  AUDIT_LOGS: 'sgae_audit_logs',
} as const;
