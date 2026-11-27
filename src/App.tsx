import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { SkeletonBlock } from '@/components/ui/Primitives';

const LoginPage = lazy(() =>
  import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage }))
);
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const StudentsListPage = lazy(() =>
  import('@/features/students/StudentsListPage').then((m) => ({ default: m.StudentsListPage }))
);
const StudentFormPage = lazy(() =>
  import('@/features/students/StudentFormPage').then((m) => ({ default: m.StudentFormPage }))
);
const StudentImportPage = lazy(() =>
  import('@/features/students/StudentImportPage').then((m) => ({ default: m.StudentImportPage }))
);
const StudentProfilePage = lazy(() =>
  import('@/features/students/StudentProfilePage').then((m) => ({ default: m.StudentProfilePage }))
);
const AcademicYearsPage = lazy(() =>
  import('@/features/academic-years/AcademicYearsPage').then((m) => ({
    default: m.AcademicYearsPage,
  }))
);
const CoursesPage = lazy(() =>
  import('@/features/courses/CoursesPage').then((m) => ({ default: m.CoursesPage }))
);
const ShiftsPage = lazy(() =>
  import('@/features/shifts/ShiftsPage').then((m) => ({ default: m.ShiftsPage }))
);
const EnrollmentsPage = lazy(() =>
  import('@/features/enrollments/EnrollmentsPage').then((m) => ({ default: m.EnrollmentsPage }))
);
const MovementsPage = lazy(() =>
  import('@/features/enrollments/MovementsPage').then((m) => ({ default: m.MovementsPage }))
);
const EnrollmentMigrationPage = lazy(() =>
  import('@/features/enrollment-migration/EnrollmentMigrationPage').then((m) => ({
    default: m.EnrollmentMigrationPage,
  }))
);
const CertificatesHistoryPage = lazy(() =>
  import('@/features/certificates/CertificatesHistoryPage').then((m) => ({
    default: m.CertificatesHistoryPage,
  }))
);
const CertificateIssuePage = lazy(() =>
  import('@/features/certificates/CertificateIssuePage').then((m) => ({
    default: m.CertificateIssuePage,
  }))
);
const CertificateDetailPage = lazy(() =>
  import('@/features/certificates/CertificateDetailPage').then((m) => ({
    default: m.CertificateDetailPage,
  }))
);
const BulkCertificateIssuePage = lazy(() =>
  import('@/features/certificates/BulkCertificateIssuePage').then((m) => ({
    default: m.BulkCertificateIssuePage,
  }))
);
const QuickPreceptoraIssuePage = lazy(() =>
  import('@/features/certificates/QuickPreceptoraIssuePage').then((m) => ({
    default: m.QuickPreceptoraIssuePage,
  }))
);
const PublicValidationPage = lazy(() =>
  import('@/features/certificate-validation/PublicValidationPage').then((m) => ({
    default: m.PublicValidationPage,
  }))
);
const EnrollmentReportsPage = lazy(() =>
  import('@/features/reports/EnrollmentReportsPage').then((m) => ({
    default: m.EnrollmentReportsPage,
  }))
);
const RostersReportPage = lazy(() =>
  import('@/features/reports/RostersReportPage').then((m) => ({ default: m.RostersReportPage }))
);
const InstitutionSettingsPage = lazy(() =>
  import('@/features/settings/InstitutionSettingsPage').then((m) => ({
    default: m.InstitutionSettingsPage,
  }))
);
const TemplatesSettingsPage = lazy(() =>
  import('@/features/settings/TemplatesSettingsPage').then((m) => ({
    default: m.TemplatesSettingsPage,
  }))
);
const UsersManagementPage = lazy(() =>
  import('@/features/users/UsersManagementPage').then((m) => ({
    default: m.UsersManagementPage,
  }))
);
const RolesPermissionsPage = lazy(() =>
  import('@/features/users/RolesPermissionsPage').then((m) => ({
    default: m.RolesPermissionsPage,
  }))
);
const AuditLogsPage = lazy(() =>
  import('@/features/audit/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage }))
);
const CalificacionesAppPage = lazy(() =>
  import('@/features/grades/CalificacionesAppPage').then((m) => ({
    default: m.CalificacionesAppPage,
  }))
);
const PreceptorAttendancePage = lazy(() =>
  import('@/features/attendance/PreceptorAttendancePage').then((m) => ({
    default: m.PreceptorAttendancePage,
  }))
);

const PageFallback = () => (
  <div className="p-6 space-y-4">
    <SkeletonBlock className="h-10 w-64" />
    <SkeletonBlock className="h-64 w-full" />
  </div>
);

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Rutas públicas / acceso rápido sin registro */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/emision" element={<QuickPreceptoraIssuePage />} />
          <Route path="/EMISION" element={<Navigate to="/emision" replace />} />
          <Route path="/validar" element={<PublicValidationPage />} />
          <Route path="/validar/:token" element={<PublicValidationPage />} />

          {/* Módulo Calificaciones, Boletines e Intensificación (Res. 1650/24 PBA — nueva pestaña) */}
          <Route
            path="/calificaciones"
            element={
              <ProtectedRoute>
                <CalificacionesAppPage />
              </ProtectedRoute>
            }
          />

          {/* Rutas administrativas protegidas */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/asistencia" element={<PreceptorAttendancePage />} />

            {/* Estudiantes */}
            <Route
              path="/estudiantes"
              element={
                <ProtectedRoute permission="students:read">
                  <StudentsListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/estudiantes/nuevo"
              element={
                <ProtectedRoute permission="students:create">
                  <StudentFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/estudiantes/importar"
              element={
                <ProtectedRoute permission="students:import">
                  <StudentImportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/estudiantes/:id"
              element={
                <ProtectedRoute permission="students:read">
                  <StudentProfilePage />
                </ProtectedRoute>
              }
            />

            {/* Gestión académica */}
            <Route path="/ciclos-lectivos" element={<AcademicYearsPage />} />
            <Route path="/cursos" element={<CoursesPage />} />
            <Route path="/turnos" element={<ShiftsPage />} />
            <Route path="/matricula" element={<EnrollmentsPage />} />
            <Route path="/matricula/movimientos" element={<MovementsPage />} />
            <Route
              path="/matricula/migracion"
              element={
                <ProtectedRoute permission="enrollments:manage">
                  <EnrollmentMigrationPage />
                </ProtectedRoute>
              }
            />

            {/* Documentación */}
            <Route path="/certificados" element={<CertificatesHistoryPage />} />
            <Route
              path="/certificados/nuevo"
              element={
                <ProtectedRoute permission="certificates:issue">
                  <CertificateIssuePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/certificados/alumno-regular"
              element={
                <ProtectedRoute permission="certificates:issue">
                  <CertificateIssuePage defaultTypeCode="alumno_regular" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/certificados/salario-familiar"
              element={
                <ProtectedRoute permission="certificates:issue">
                  <CertificateIssuePage defaultTypeCode="salario_familiar" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/certificados/constancia-general"
              element={
                <ProtectedRoute permission="certificates:issue">
                  <CertificateIssuePage defaultTypeCode="constancia_general" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/certificados/emision-masiva"
              element={
                <ProtectedRoute permission="certificates:issue_bulk">
                  <BulkCertificateIssuePage />
                </ProtectedRoute>
              }
            />
            <Route path="/certificados/:id" element={<CertificateDetailPage />} />

            {/* Reportes */}
            <Route path="/reportes" element={<Navigate to="/reportes/matricula" replace />} />
            <Route path="/reportes/matricula" element={<EnrollmentReportsPage />} />
            <Route path="/reportes/nominas" element={<RostersReportPage />} />

            {/* Configuración */}
            <Route
              path="/configuracion"
              element={<Navigate to="/configuracion/institucion" replace />}
            />
            <Route
              path="/configuracion/institucion"
              element={
                <ProtectedRoute permission="settings:manage">
                  <InstitutionSettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuracion/plantillas"
              element={
                <ProtectedRoute permission="templates:manage">
                  <TemplatesSettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuracion/usuarios"
              element={
                <ProtectedRoute permission="users:manage">
                  <UsersManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuracion/permisos"
              element={
                <ProtectedRoute permission="users:manage">
                  <RolesPermissionsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuracion/auditoria"
              element={
                <ProtectedRoute permission="audit:read">
                  <AuditLogsPage />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
