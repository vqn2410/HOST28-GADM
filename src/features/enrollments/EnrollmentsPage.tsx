import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus,
  RefreshCw,
  Download,
  ArrowRightLeft,
  UserX,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FieldLabel,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui/Primitives';
import { EnrollmentStatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { listStudents } from '@/repositories/studentRepository';
import {
  closeEnrollment,
  enrollStudent,
  listCourses,
  listEnrollments,
  syncLegacyEnrollmentsFromStudents,
} from '@/repositories/academicRepository';
import { logAudit } from '@/repositories/auditRepository';
import { exportRowsToExcel } from '@/services/exportService';
import { formatDateAR, formatDniDisplay } from '@/lib/utils/formatters';
import type { Enrollment, Student } from '@/types/domain';

export const EnrollmentsPage: React.FC = () => {
  const { user, can } = useAuth();
  const { selectedYearId, selectedYear } = useAcademicYear();
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<'enrolled' | 'unassigned'>('enrolled');
  const [courseFilter, setCourseFilter] = useState('todos');
  const [shiftFilter, setShiftFilter] = useState('todos');
  const [search, setSearch] = useState('');

  // Modal matricular / cambiar curso
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedStudentDni, setSelectedStudentDni] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [assignObs, setAssignObs] = useState('');

  // Modal baja / pase / egreso
  const [closeTarget, setCloseTarget] = useState<{
    enrollment: Enrollment;
    studentName: string;
  } | null>(null);
  const [closeStatus, setCloseStatus] = useState<'baja' | 'pase' | 'egresado'>('baja');
  const [closeReason, setCloseReason] = useState('');

  const studentsQuery = useQuery({ queryKey: ['students'], queryFn: listStudents });
  const coursesQuery = useQuery({
    queryKey: ['courses', selectedYearId],
    queryFn: () => listCourses(selectedYearId),
  });
  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', selectedYearId],
    queryFn: () => listEnrollments(selectedYearId),
  });

  const students = studentsQuery.data ?? [];
  const courses = coursesQuery.data ?? [];
  const enrollments = enrollmentsQuery.data ?? [];

  const studentMap = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach((s) => m.set(s.dni, s));
    return m;
  }, [students]);

  const activeEnrollments = useMemo(
    () => enrollments.filter((e) => e.status === 'activa'),
    [enrollments]
  );

  const activeDniSet = useMemo(
    () => new Set(activeEnrollments.map((e) => e.studentDni)),
    [activeEnrollments]
  );

  const unassignedStudents = useMemo(
    () =>
      students.filter(
        (s) => s.estadoInstitucional === 'activo' && !activeDniSet.has(s.dni)
      ),
    [students, activeDniSet]
  );

  const filteredEnrollments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeEnrollments
      .filter((e) => {
        if (courseFilter !== 'todos' && e.courseId !== courseFilter) return false;
        if (shiftFilter !== 'todos' && e.shiftName !== shiftFilter) return false;
        if (q) {
          const st = studentMap.get(e.studentDni);
          const text = `${st?.apellido ?? ''} ${st?.nombres ?? ''} ${e.studentDni}`.toLowerCase();
          if (!text.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const stA = studentMap.get(a.studentDni)?.nombre ?? a.studentDni;
        const stB = studentMap.get(b.studentDni)?.nombre ?? b.studentDni;
        return stA.localeCompare(stB, 'es');
      });
  }, [activeEnrollments, courseFilter, shiftFilter, search, studentMap]);

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const st = studentMap.get(selectedStudentDni);
      const course = courses.find((c) => c.id === selectedCourseId);
      if (!st || !course) throw new Error('Seleccioná estudiante y curso.');
      await enrollStudent({
        student: st,
        academicYearId: selectedYearId,
        course,
        observations: assignObs,
        performedByDni: user.dni,
        performedByName: `${user.apellido}, ${user.nombre}`,
        isCurrentDefaultYear: selectedYear?.isDefault ?? true,
      });
      await logAudit({
        userDni: user.dni,
        userName: `${user.apellido}, ${user.nombre}`,
        userRole: user.roleId,
        operation: 'enrollment_create',
        entity: 'sgae_enrollments',
        entityId: `${selectedYearId}_${st.dni}`,
        newSummary: { course: course.label, shift: course.shiftName },
      });
    },
    onSuccess: () => {
      toast.success('Matrícula asignada correctamente.');
      setAssignModalOpen(false);
      setSelectedStudentDni('');
      setSelectedCourseId('');
      setAssignObs('');
      void queryClient.invalidateQueries({ queryKey: ['enrollments', selectedYearId] });
      void queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al matricular'),
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!user || !closeTarget) return;
      await closeEnrollment({
        enrollment: closeTarget.enrollment,
        studentName: closeTarget.studentName,
        newStatus: closeStatus,
        reason: closeReason,
        performedByDni: user.dni,
        performedByName: `${user.apellido}, ${user.nombre}`,
      });
      await logAudit({
        userDni: user.dni,
        userName: `${user.apellido}, ${user.nombre}`,
        userRole: user.roleId,
        operation: 'enrollment_status_change',
        entity: 'sgae_enrollments',
        entityId: closeTarget.enrollment.id,
        newSummary: { status: closeStatus },
        reason: closeReason,
      });
    },
    onSuccess: () => {
      toast.success('Movimiento de cierre registrado.');
      setCloseTarget(null);
      setCloseReason('');
      void queryClient.invalidateQueries({ queryKey: ['enrollments', selectedYearId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al registrar cierre'),
  });

  const syncLegacyMutation = useMutation({
    mutationFn: async () => {
      if (!user) return 0;
      return syncLegacyEnrollmentsFromStudents(
        selectedYearId,
        students,
        courses,
        user.dni,
        `${user.apellido}, ${user.nombre}`
      );
    },
    onSuccess: (count) => {
      if (count > 0) {
        toast.success(`Se sincronizaron ${count} matrículas desde la base compartida HOST28_EF.`);
        void queryClient.invalidateQueries({ queryKey: ['enrollments', selectedYearId] });
      } else {
        toast.info('Todos los estudiantes con curso en HOST28_EF ya están sincronizados.');
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al sincronizar'),
  });

  const handleExport = () => {
    const rows = filteredEnrollments.map((e, i) => {
      const st = studentMap.get(e.studentDni);
      return {
        ORDEN: i + 1,
        APELLIDO: st?.apellido ?? '',
        NOMBRES: st?.nombres ?? '',
        DNI: e.studentDni,
        CICLO: e.academicYearId,
        ANIO: `${e.yearNumber}°`,
        DIVISION: e.division,
        TURNO: e.shiftName,
        FECHA_ALTA: e.startDate,
      };
    });
    exportRowsToExcel(rows, `Matricula_${selectedYearId}`, `matricula_${selectedYearId}.xlsx`);
    toast.success('Matrícula exportada a Excel.');
  };

  return (
    <div>
      <PageHeader
        title={`Matrícula Anual — Ciclo ${selectedYearId}`}
        subtitle="Asignación de estudiantes a cursos, divisiones y turnos. Evita matrículas activas duplicadas en el mismo ciclo."
        actions={
          <>
            {can('enrollments:manage') && selectedYear?.status !== 'cerrado' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncLegacyMutation.mutate()}
                loading={syncLegacyMutation.isPending}
                title="Importa matrículas iniciales desde los alumnos existentes en HOST28_EF sin duplicar"
              >
                <RefreshCw size={15} />
                Sincronizar desde HOST28 EF
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download size={15} />
              Exportar Excel
            </Button>
            {can('enrollments:manage') && selectedYear?.status !== 'cerrado' && (
              <Button size="sm" onClick={() => setAssignModalOpen(true)}>
                <UserPlus size={15} />
                Matricular estudiante
              </Button>
            )}
          </>
        }
      />

      {/* Mode Switch + Filters */}
      <Card className="p-4 mb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'enrolled' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setViewMode('enrolled')}
            >
              Matriculados ({activeEnrollments.length})
            </Button>
            <Button
              variant={viewMode === 'unassigned' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setViewMode('unassigned')}
            >
              Sin asignación en {selectedYearId} ({unassignedStudents.length})
            </Button>
          </div>
          <Link
            to="/matricula/migracion"
            className="text-xs font-semibold text-brand-600 dark:text-brand-300 hover:underline"
          >
            Ir al Asistente de Migración Anual →
          </Link>
        </div>

        {viewMode === 'enrolled' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-border-subtle">
            <div className="md:col-span-5 relative">
              <Search size={15} className="absolute left-3 top-3 text-ink-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar estudiante en la matrícula..."
                className="pl-9"
              />
            </div>
            <div className="md:col-span-4">
              <Select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
                <option value="todos">Todos los cursos</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} — Turno {c.shiftName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-3">
              <Select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)}>
                <option value="todos">Todos los turnos</option>
                <option value="Mañana">Mañana</option>
                <option value="Tarde">Tarde</option>
                <option value="Vespertino">Vespertino</option>
                <option value="Noche">Noche</option>
              </Select>
            </div>
          </div>
        )}
      </Card>

      {/* Content */}
      <Card className="overflow-hidden">
        {viewMode === 'enrolled' ? (
          filteredEnrollments.length === 0 ? (
            <EmptyState
              title="Sin matrículas para mostrar"
              description="Podés matricular estudiantes individualmente o sincronizar los alumnos existentes desde HOST28 Educación Física."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-surface-subtle/70 text-xs uppercase text-ink-muted border-b border-border-subtle">
                  <tr>
                    <th className="px-4 py-3">Estudiante</th>
                    <th className="px-4 py-3">DNI</th>
                    <th className="px-4 py-3">Curso y División</th>
                    <th className="px-4 py-3">Turno</th>
                    <th className="px-4 py-3">Fecha alta</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredEnrollments.map((enr) => {
                    const st = studentMap.get(enr.studentDni);
                    const fullName = st ? `${st.apellido}, ${st.nombres}` : enr.studentDni;
                    return (
                      <tr key={enr.id} className="hover:bg-surface-subtle/40">
                        <td className="px-4 py-3 font-semibold">
                          <Link
                            to={`/estudiantes/${enr.studentDni}`}
                            className="hover:text-brand-600 dark:hover:text-brand-300"
                          >
                            {fullName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {formatDniDisplay(enr.studentDni)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="brand">{enr.courseLabel}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs">{enr.shiftName}</td>
                        <td className="px-4 py-3 text-xs text-ink-secondary">
                          {formatDateAR(enr.startDate)}
                        </td>
                        <td className="px-4 py-3">
                          <EnrollmentStatusBadge status={enr.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {can('enrollments:manage') && selectedYear?.status !== 'cerrado' && (
                            <div className="inline-flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Cambiar curso / turno"
                                onClick={() => {
                                  setSelectedStudentDni(enr.studentDni);
                                  setSelectedCourseId(enr.courseId);
                                  setAssignModalOpen(true);
                                }}
                              >
                                <ArrowRightLeft size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Registrar baja / pase / egreso"
                                onClick={() => setCloseTarget({ enrollment: enr, studentName: fullName })}
                              >
                                <UserX size={14} className="text-red-500" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : unassignedStudents.length === 0 ? (
          <EmptyState
            title="Todos los estudiantes activos están matriculados"
            description={`No quedan estudiantes activos sin asignación en el ciclo ${selectedYearId}.`}
          />
        ) : (
          <div className="divide-y divide-border-subtle">
            {unassignedStudents.map((st) => (
              <div key={st.dni} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-sm text-ink-primary">
                    {st.apellido}, {st.nombres}
                  </p>
                  <p className="text-xs text-ink-muted font-mono">
                    DNI {formatDniDisplay(st.dni)} · Ingreso {st.anioIngreso}
                    {st.cursoOrigen ? ` · Último curso EF: ${st.cursoOrigen}` : ''}
                  </p>
                </div>
                {can('enrollments:manage') && selectedYear?.status !== 'cerrado' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedStudentDni(st.dni);
                      setAssignModalOpen(true);
                    }}
                  >
                    Asignar curso
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal Matricular / Cambiar Curso */}
      <Modal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={`Asignar matrícula — Ciclo ${selectedYearId}`}
        subtitle="Si el estudiante ya tiene una matrícula activa en este ciclo, se registrará automáticamente el movimiento de cambio."
      >
        <div className="space-y-4">
          <div>
            <FieldLabel required>Estudiante</FieldLabel>
            <Select
              value={selectedStudentDni}
              onChange={(e) => setSelectedStudentDni(e.target.value)}
            >
              <option value="">Seleccionar estudiante...</option>
              {students
                .filter((s) => s.estadoInstitucional !== 'archivado')
                .map((s) => (
                  <option key={s.dni} value={s.dni}>
                    {s.apellido}, {s.nombres} — DNI {s.dni}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <FieldLabel required>Curso y división</FieldLabel>
            <Select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
            >
              <option value="">Seleccionar curso...</option>
              {courses
                .filter((c) => c.status === 'activo')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} — Turno {c.shiftName}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <FieldLabel>Observaciones / Motivo</FieldLabel>
            <Textarea
              value={assignObs}
              onChange={(e) => setAssignObs(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setAssignModalOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => assignMutation.mutate()}
            loading={assignMutation.isPending}
            disabled={!selectedStudentDni || !selectedCourseId}
          >
            Confirmar matrícula
          </Button>
        </div>
      </Modal>

      {/* Modal Baja / Pase / Egreso */}
      <Modal
        open={Boolean(closeTarget)}
        onClose={() => setCloseTarget(null)}
        title="Registrar baja, pase o egreso"
        subtitle={closeTarget?.studentName}
      >
        <div className="space-y-4">
          <div>
            <FieldLabel required>Tipo de cierre</FieldLabel>
            <Select
              value={closeStatus}
              onChange={(e) =>
                setCloseStatus(e.target.value as 'baja' | 'pase' | 'egresado')
              }
            >
              <option value="baja">Baja / Desvinculación</option>
              <option value="pase">Pase a otra institución</option>
              <option value="egresado">Egreso</option>
            </Select>
          </div>
          <div>
            <FieldLabel>Motivo / Observaciones</FieldLabel>
            <Textarea
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              placeholder="Ej. Pase otorgado a E.E.S. N° ..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setCloseTarget(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => closeMutation.mutate()}
            loading={closeMutation.isPending}
          >
            Confirmar cierre
          </Button>
        </div>
      </Modal>
    </div>
  );
};
