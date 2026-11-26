import React from 'react';
import { Badge, type BadgeVariant } from '@/components/ui/Primitives';
import type {
  AcademicYearStatus,
  CertificateStatus,
  EnrollmentStatus,
  StudentStatus,
} from '@/types/domain';

const STUDENT_STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  activo: { label: 'Activo', variant: 'success' },
  egresado: { label: 'Egresado', variant: 'brand' },
  pase: { label: 'Pase', variant: 'info' },
  desvinculado: { label: 'Desvinculado', variant: 'warning' },
  archivado: { label: 'Archivado', variant: 'neutral' },
};

export const StudentStatusBadge: React.FC<{ status: StudentStatus }> = ({ status }) => {
  const cfg = STUDENT_STATUS_MAP[status] ?? { label: status, variant: 'neutral' as BadgeVariant };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
};

const YEAR_STATUS_MAP: Record<AcademicYearStatus, { label: string; variant: BadgeVariant }> = {
  activo: { label: 'Activo', variant: 'success' },
  planificacion: { label: 'En planificación', variant: 'info' },
  cerrado: { label: 'Cerrado', variant: 'neutral' },
};

export const AcademicYearStatusBadge: React.FC<{ status: AcademicYearStatus }> = ({ status }) => {
  const cfg = YEAR_STATUS_MAP[status] ?? { label: status, variant: 'neutral' as BadgeVariant };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
};

const ENROLLMENT_STATUS_MAP: Record<EnrollmentStatus, { label: string; variant: BadgeVariant }> = {
  activa: { label: 'Activa', variant: 'success' },
  cambio_curso: { label: 'Cambio de curso', variant: 'info' },
  baja: { label: 'Baja', variant: 'danger' },
  pase: { label: 'Pase', variant: 'warning' },
  egresado: { label: 'Egresado', variant: 'brand' },
};

export const EnrollmentStatusBadge: React.FC<{ status: EnrollmentStatus }> = ({ status }) => {
  const cfg = ENROLLMENT_STATUS_MAP[status] ?? { label: status, variant: 'neutral' as BadgeVariant };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
};

const CERT_STATUS_MAP: Record<CertificateStatus, { label: string; variant: BadgeVariant }> = {
  emitido: { label: 'Emitido', variant: 'success' },
  anulado: { label: 'Anulado', variant: 'danger' },
  reemplazado: { label: 'Reemplazado', variant: 'warning' },
};

export const CertificateStatusBadge: React.FC<{ status: CertificateStatus }> = ({ status }) => {
  const cfg = CERT_STATUS_MAP[status] ?? { label: status, variant: 'neutral' as BadgeVariant };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
};
