import type { Permission, RoleId, SgaeUser } from '@/types/domain';

export interface RoleDefinition {
  id: RoleId;
  name: string;
  description: string;
  permissions: Permission[];
}

export const ALL_PERMISSIONS: { id: Permission; label: string; group: string }[] = [
  { id: 'students:read', label: 'Consultar estudiantes', group: 'Estudiantes' },
  { id: 'students:create', label: 'Crear estudiantes', group: 'Estudiantes' },
  { id: 'students:edit', label: 'Editar estudiantes', group: 'Estudiantes' },
  { id: 'students:import', label: 'Importar estudiantes', group: 'Estudiantes' },
  { id: 'students:export', label: 'Exportar estudiantes', group: 'Estudiantes' },
  { id: 'enrollments:manage', label: 'Administrar matrícula', group: 'Gestión Académica' },
  { id: 'academic_years:manage', label: 'Administrar ciclos lectivos y cursos', group: 'Gestión Académica' },
  { id: 'certificates:issue', label: 'Emitir certificados', group: 'Documentación' },
  { id: 'certificates:issue_bulk', label: 'Emitir certificados masivamente', group: 'Documentación' },
  { id: 'certificates:cancel', label: 'Anular / reemplazar certificados', group: 'Documentación' },
  { id: 'templates:manage', label: 'Configurar plantillas documentales', group: 'Configuración' },
  { id: 'settings:manage', label: 'Configurar datos institucionales', group: 'Configuración' },
  { id: 'users:manage', label: 'Administrar usuarios y permisos', group: 'Configuración' },
  { id: 'audit:read', label: 'Consultar auditoría', group: 'Configuración' },
];

export const ROLE_DEFINITIONS: Record<RoleId, RoleDefinition> = {
  admin: {
    id: 'admin',
    name: 'Administrador',
    description: 'Control total del sistema, configuración institucional, usuarios y auditoría.',
    permissions: ALL_PERMISSIONS.map((p) => p.id),
  },
  conduccion: {
    id: 'conduccion',
    name: 'Equipo de Conducción',
    description: 'Dirección y Vicedirección: gestión integral, emisión, anulación, reportes y auditoría.',
    permissions: [
      'students:read',
      'students:create',
      'students:edit',
      'students:import',
      'students:export',
      'enrollments:manage',
      'academic_years:manage',
      'certificates:issue',
      'certificates:issue_bulk',
      'certificates:cancel',
      'templates:manage',
      'settings:manage',
      'users:manage',
      'audit:read',
    ],
  },
  secretaria: {
    id: 'secretaria',
    name: 'Secretaría',
    description: 'Administración de matrícula, legajos base, certificados individuales y masivos y reportes.',
    permissions: [
      'students:read',
      'students:create',
      'students:edit',
      'students:import',
      'students:export',
      'enrollments:manage',
      'academic_years:manage',
      'certificates:issue',
      'certificates:issue_bulk',
      'certificates:cancel',
      'templates:manage',
    ],
  },
  preceptoria: {
    id: 'preceptoria',
    name: 'Preceptoría',
    description: 'Consulta y actualización de estudiantes, matrícula, asistencias, boletines y constancias.',
    permissions: [
      'students:read',
      'students:create',
      'students:edit',
      'students:export',
      'enrollments:manage',
      'certificates:issue',
    ],
  },
  docente: {
    id: 'docente',
    name: 'Docente',
    description: 'Acceso acotado a sus materias y cursos asignados: calificaciones Res. 1650/24 y asistencia por materia.',
    permissions: ['students:read'],
  },
  consulta: {
    id: 'consulta',
    name: 'Consulta',
    description: 'Solo lectura de estudiantes, matrícula, historial documental y reportes.',
    permissions: ['students:read', 'students:export'],
  },
};

export function getEffectivePermissions(user: SgaeUser | null): Permission[] {
  if (!user || !user.active) return [];
  if (user.customPermissions && user.customPermissions.length > 0) {
    return user.customPermissions;
  }
  return ROLE_DEFINITIONS[user.roleId]?.permissions ?? [];
}

export function hasPermission(user: SgaeUser | null, permission: Permission): boolean {
  return getEffectivePermissions(user).includes(permission);
}

export function hasAnyPermission(user: SgaeUser | null, permissions: Permission[]): boolean {
  const effective = getEffectivePermissions(user);
  return permissions.some((p) => effective.includes(p));
}
