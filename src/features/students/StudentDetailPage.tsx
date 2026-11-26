import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileBadge2,
  Edit3,
  GraduationCap,
  History,
  FileText,
  ArrowRightLeft,
  User,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
  EmptyState,
  FieldLabel,
  Input,
  Modal,
  PageHeader,
  Select,
  SkeletonBlock,
  Textarea,
} from '@/components/ui/Primitives';
import {
  CertificateStatusBadge,
  EnrollmentStatusBadge,
  StudentStatusBadge,
} from '@/components/shared/StatusBadge';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { getStudentByDni, updateStudent } from '@/repositories/studentRepository';
import {
  enrollStudent,
  listCourses,
  listMovements,
  listStudentEnrollments,
} from '@/repositories/academicRepository';
import { listCertificates } from '@/repositories/certificateRepository';
import { logAudit } from '@/repositories/auditRepository';
import { downloadCertificatePdf } from '@/templates/pdf/certificatePdfGenerator';
import {
  calculateAge,
  cn,
  formatDateAR,
  formatDateTimeAR,
  formatDniDisplay,
} from '@/lib/utils/formatters';

type TabId = 'personal' | 'current' | 'trajectory' | 'docs' | 'movements';

export const StudentDetailPage: React.FC = () => {
  const { id: dniParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, can } = useAuth();
  const { selectedYearId, selectedYear, settings } = useAcademicYear();

  const [activeTab, setActiveTab] = useState<TabId>('personal');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [targetCourseId, setTargetCourseId] = useState('');
  const [enrollObs, setEnrollObs] = useState('');

  const studentQuery = useQuery({
    queryKey: ['student', dniParam],
    queryFn: () => getStudentByDni(dniParam || ''),
    enabled: Boolean(dniParam),
  });

  const enrollmentsQuery = useQuery({
    queryKey: ['student-enrollments', dniParam],
    queryFn: () => listStudentEnrollments(dniParam || ''),
    enabled: Boolean(dniParam),
  });

  const certsQuery = useQuery({
    queryKey: ['student-certificates', dniParam],
    queryFn: () => listCertificates({ studentDni: dniParam || '' }),
    enabled: Boolean(dniParam),
  });

  const movementsQuery = useQuery({
    queryKey: ['student-movements', dniParam],
    queryFn: () => listMovements({ studentDni: dniParam || '' }),
    enabled: Boolean(dniParam),
  });

  const coursesQuery = useQuery({
    queryKey: ['courses', selectedYearId],
    queryFn: () => listCourses(selectedYearId),
  });

  const student = studentQuery.data;
  const enrollments = enrollmentsQuery.data ?? [];
  const certs = certsQuery.data ?? [];
  const movements = movementsQuery.data ?? [];
  const activeCourses = (coursesQuery.data ?? []).filter((c) => c.status === 'activo');

  const currentEnrollment = enrollments.find(
    (e) => e.academicYearId === selectedYearId && e.status === 'activa'
  );

  // Edit form state
  const [editForm, setEditForm] = useState({
    apellido: '',
    nombres: '',
    fechaNacimiento: '',
    anioIngreso: 2026,
    estadoInstitucional: 'activo',
    observaciones: '',
    fechaEgreso: '',
    fechaPase: '',
    motivoBaja: '',
  });

  const openEditModal = () => {
    if (!student) return;
    setEditForm({
      apellido: student.apellido,
      nombres: student.nombres,
      fechaNacimiento: student.fechaNacimiento || '',
      anioIngreso: student.anioIngreso,
      estadoInstitucional: student.estadoInstitucional,
      observaciones: student.observaciones || '',
      fechaEgreso: student.fechaEgreso || '',
      fechaPase: student.fechaPase || '',
      motivoBaja: student.motivoBaja || '',
    });
    setEditModalOpen(true);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!student || !user) return;
      await updateStudent(student.dni, {
        ...editForm,
        fechaEgreso: editForm.fechaEgreso || null,
        fechaPase: editForm.fechaPase || null,
        motivoBaja: editForm.motivoBaja || null,
      });
      await logAudit({
        userDni: user.dni,
        userName: `${user.apellido}, ${user.nombre}`,
        userRole: user.roleId,
        operation: 'student_update',
        entity: 'alumnos',
        entityId: student.dni,
        changedFields: Object.keys(editForm),
      });
    },
    onSuccess: () => {
      toast.success('Datos del estudiante actualizados.');
      setEditModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['student', dniParam] });
      void queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al actualizar'),
  });

  const enrollMutation = useMutation({
    mutationFn: async () => {
      if (!student || !user) return;
      const course = activeCourses.find((c) => c.id === targetCourseId);
      if (!course) throw new Error('Seleccioná un curso de destino.');
      await enrollStudent({
        student,
        academicYearId: selectedYearId,
        course,
        observations: enrollObs,
        performedByDni: user.dni,
        performedByName: `${user.apellido}, ${user.nombre}`,
        isCurrentDefaultYear: selectedYear?.isDefault ?? true,
      });
      await logAudit({
        userDni: user.dni,
        userName: `${user.apellido}, ${user.nombre}`,
        userRole: user.roleId,
        operation: currentEnrollment ? 'enrollment_change_course' : 'enrollment_create',
        entity: 'sgae_enrollments',
        entityId: `${selectedYearId}_${student.dni}`,
        newSummary: { course: course.label, shift: course.shiftName },
      });
    },
    onSuccess: () => {
      toast.success('Matrícula registrada correctamente.');
      setEnrollModalOpen(false);
      setTargetCourseId('');
      setEnrollObs('');
      void queryClient.invalidateQueries({ queryKey: ['student-enrollments', dniParam] });
      void queryClient.invalidateQueries({ queryKey: ['student-movements', dniParam] });
      void queryClient.invalidateQueries({ queryKey: ['student', dniParam] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al matricular'),
  });

  if (studentQuery.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-64 w-full" />
      </div>
    );
  }

  if (!student) {
    return (
      <Card className="p-8">
        <EmptyState
          title="Estudiante no encontrado"
          description="El DNI solicitado no existe en la base general."
          action={
            <Button onClick={() => navigate('/estudiantes')}>Volver a Base General</Button>
          }
        />
      </Card>
    );
  }

  const age = calculateAge(student.fechaNacimiento);

  const tabs: { id: TabId; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'personal', label: 'Información personal', icon: <User size={15} /> },
    { id: 'current', label: `Matrícula ${selectedYearId}`, icon: <GraduationCap size={15} /> },
    { id: 'trajectory', label: 'Trayectoria institucional', icon: <History size={15} />, count: enrollments.length },
    { id: 'docs', label: 'Documentación', icon: <FileText size={15} />, count: certs.length },
    { id: 'movements', label: 'Movimientos', icon: <ArrowRightLeft size={15} />, count: movements.length },
  ];

  return (
    <div>
      <PageHeader
        title={`${student.apellido}, ${student.nombres}`}
        subtitle={`DNI ${formatDniDisplay(student.dni)}  •  ID interno: ${student.id}  •  Ingreso ${student.anioIngreso}`}
        badge={<StudentStatusBadge status={student.estadoInstitucional} />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/estudiantes')}>
              <ArrowLeft size={15} />
              Base general
            </Button>
            {can('students:edit') && (
              <Button variant="secondary" size="sm" onClick={openEditModal}>
                <Edit3 size={15} />
                Editar datos
              </Button>
            )}
            {can('certificates:issue') && (
              <Button
                variant="emerald"
                size="sm"
                onClick={() => navigate(`/certificados/alumno-regular?dni=${student.dni}`)}
              >
                <FileBadge2 size={15} />
                Emitir certificado
              </Button>
            )}
          </>
        }
      />

      {/* Tabs navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-5 border-b border-border-subtle">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer',
              activeTab === t.id
                ? 'bg-brand-500 text-white shadow-xs'
                : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary'
            )}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px]',
                  activeTab === t.id ? 'bg-white/20 text-white' : 'bg-surface-subtle text-ink-muted'
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: Información Personal */}
      {activeTab === 'personal' && (
        <Card className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase text-ink-muted">Apellido</p>
              <p className="font-semibold text-ink-primary mt-1">{student.apellido}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-ink-muted">Nombre / Nombres</p>
              <p className="font-semibold text-ink-primary mt-1">{student.nombres}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-ink-muted">DNI</p>
              <p className="font-mono font-semibold text-ink-primary mt-1">
                {formatDniDisplay(student.dni)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-ink-muted">Fecha de nacimiento</p>
              <p className="text-ink-primary mt-1">{formatDateAR(student.fechaNacimiento)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-ink-muted">Edad actual (calculada)</p>
              <p className="text-ink-primary mt-1">{age !== null ? `${age} años` : 'Sin fecha cargada'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-ink-muted">Año de ingreso</p>
              <p className="text-ink-primary mt-1">{student.anioIngreso}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-ink-muted">Estado institucional</p>
              <div className="mt-1">
                <StudentStatusBadge status={student.estadoInstitucional} />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-ink-muted">Sincronización HOST28 EF</p>
              <p className="text-ink-secondary mt-1 text-xs">
                Curso origen: <strong>{student.cursoOrigen || '—'}</strong> · Curso EF:{' '}
                <strong>{student.cursoEF || '—'}</strong>
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-ink-muted">Última modificación</p>
              <p className="text-ink-secondary mt-1 text-xs">{formatDateTimeAR(student.updatedAt)}</p>
            </div>
            {student.observaciones && (
              <div className="sm:col-span-2 lg:col-span-3 pt-3 border-t border-border-subtle">
                <p className="text-xs font-semibold uppercase text-ink-muted">Observaciones</p>
                <p className="text-ink-primary mt-1 whitespace-pre-wrap">{student.observaciones}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* TAB 2: Matrícula Actual */}
      {activeTab === 'current' && (
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-base font-bold text-ink-primary">
                Matrícula del Ciclo Lectivo {selectedYearId}
              </h3>
              <p className="text-xs text-ink-secondary">
                Asignación vigente de curso, división y turno para el ciclo seleccionado.
              </p>
            </div>
            {can('enrollments:manage') && selectedYear?.status !== 'cerrado' && (
              <Button size="sm" onClick={() => setEnrollModalOpen(true)}>
                {currentEnrollment ? 'Cambiar curso / turno' : 'Matricular en este ciclo'}
              </Button>
            )}
          </div>

          {currentEnrollment ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5 p-5 rounded-xl bg-surface-subtle/60 border border-border-subtle text-sm">
              <div>
                <p className="text-xs uppercase text-ink-muted font-semibold">Ciclo lectivo</p>
                <p className="font-bold text-ink-primary mt-1">{currentEnrollment.academicYearId}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-ink-muted font-semibold">Año de cursada</p>
                <p className="font-bold text-ink-primary mt-1">{currentEnrollment.yearNumber}° año</p>
              </div>
              <div>
                <p className="text-xs uppercase text-ink-muted font-semibold">División</p>
                <p className="font-bold text-ink-primary mt-1">{currentEnrollment.division}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-ink-muted font-semibold">Turno</p>
                <p className="font-bold text-ink-primary mt-1">{currentEnrollment.shiftName}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-ink-muted font-semibold">Estado</p>
                <div className="mt-1">
                  <EnrollmentStatusBadge status={currentEnrollment.status} />
                </div>
              </div>
              <div>
                <p className="text-xs uppercase text-ink-muted font-semibold">Fecha de asignación</p>
                <p className="font-medium text-ink-primary mt-1">
                  {formatDateAR(currentEnrollment.startDate)}
                </p>
              </div>
            </div>
          ) : (
            <EmptyState
              title={`Sin matrícula activa en ${selectedYearId}`}
              description="Este estudiante todavía no fue matriculado en un curso para el ciclo lectivo seleccionado."
              action={
                can('enrollments:manage') && selectedYear?.status !== 'cerrado' ? (
                  <Button onClick={() => setEnrollModalOpen(true)}>Asignar curso ahora</Button>
                ) : undefined
              }
            />
          )}
        </Card>
      )}

      {/* TAB 3: Trayectoria Institucional */}
      {activeTab === 'trajectory' && (
        <Card className="overflow-hidden">
          {enrollments.length === 0 ? (
            <EmptyState
              title="Sin historial de matriculación"
              description="Aún no se registraron matrículas para este estudiante."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-surface-subtle/70 text-xs uppercase text-ink-muted border-b border-border-subtle">
                  <tr>
                    <th className="px-4 py-3">Ciclo lectivo</th>
                    <th className="px-4 py-3">Año</th>
                    <th className="px-4 py-3">División</th>
                    <th className="px-4 py-3">Turno</th>
                    <th className="px-4 py-3">Vigencia</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {enrollments.map((enr) => (
                    <tr key={enr.id}>
                      <td className="px-4 py-3 font-bold">{enr.academicYearId}</td>
                      <td className="px-4 py-3">{enr.yearNumber}°</td>
                      <td className="px-4 py-3">{enr.division}</td>
                      <td className="px-4 py-3">{enr.shiftName}</td>
                      <td className="px-4 py-3 text-xs text-ink-secondary">
                        {formatDateAR(enr.startDate)}
                        {enr.endDate ? ` → ${formatDateAR(enr.endDate)}` : ' → Vigente'}
                      </td>
                      <td className="px-4 py-3">
                        <EnrollmentStatusBadge status={enr.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 4: Documentación */}
      {activeTab === 'docs' && (
        <Card className="overflow-hidden">
          {certs.length === 0 ? (
            <EmptyState
              title="Sin certificados emitidos"
              description="Todavía no se emitieron constancias ni certificados para este estudiante."
              action={
                can('certificates:issue') ? (
                  <Button
                    variant="emerald"
                    onClick={() => navigate(`/certificados/alumno-regular?dni=${student.dni}`)}
                  >
                    Emitir primer certificado
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-surface-subtle/70 text-xs uppercase text-ink-muted border-b border-border-subtle">
                  <tr>
                    <th className="px-4 py-3">N.º Certificado</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Ciclo / Curso</th>
                    <th className="px-4 py-3">Fecha emisión</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {certs.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-mono text-xs font-bold">
                        <Link
                          to={`/certificados/${c.id}`}
                          className="text-brand-600 dark:text-brand-300 hover:underline"
                        >
                          {c.certificateNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{c.typeName}</td>
                      <td className="px-4 py-3 text-xs">
                        {c.academicYearId} · {c.snapshot.anio} {c.snapshot.division} ({c.snapshot.turno})
                      </td>
                      <td className="px-4 py-3 text-xs">{formatDateAR(c.issueDate)}</td>
                      <td className="px-4 py-3">
                        <CertificateStatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void downloadCertificatePdf(c, settings)}
                        >
                          <Download size={14} />
                          PDF
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 5: Movimientos */}
      {activeTab === 'movements' && (
        <Card className="overflow-hidden">
          {movements.length === 0 ? (
            <EmptyState
              title="Sin movimientos registrados"
              description="Los cambios de curso, división, turno, altas, bajas y pases aparecerán aquí."
            />
          ) : (
            <div className="divide-y divide-border-subtle">
              {movements.map((m) => (
                <div key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                  <div>
                    <p className="font-semibold text-ink-primary capitalize">
                      {m.type.replace(/_/g, ' ')} — Ciclo {m.academicYearId}
                    </p>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      {m.fromCourseLabel ? `Desde ${m.fromCourseLabel} (${m.fromShiftName}) → ` : ''}
                      {m.toCourseLabel ? `Hacia ${m.toCourseLabel} (${m.toShiftName})` : 'Cierre de matrícula'}
                      {m.reason ? ` · ${m.reason}` : ''}
                    </p>
                  </div>
                  <div className="text-xs text-ink-muted text-right">
                    <p>Vigencia: {formatDateAR(m.effectiveDate)}</p>
                    <p>Por: {m.performedByName}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Edit Student Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Editar datos del estudiante"
        subtitle={`DNI ${formatDniDisplay(student.dni)} (identificador permanente)`}
        size="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel required>Apellido</FieldLabel>
            <Input
              value={editForm.apellido}
              onChange={(e) => setEditForm((p) => ({ ...p, apellido: e.target.value }))}
            />
          </div>
          <div>
            <FieldLabel required>Nombres</FieldLabel>
            <Input
              value={editForm.nombres}
              onChange={(e) => setEditForm((p) => ({ ...p, nombres: e.target.value }))}
            />
          </div>
          <div>
            <FieldLabel>Fecha de nacimiento</FieldLabel>
            <Input
              type="date"
              value={editForm.fechaNacimiento}
              onChange={(e) => setEditForm((p) => ({ ...p, fechaNacimiento: e.target.value }))}
            />
          </div>
          <div>
            <FieldLabel required>Año de ingreso</FieldLabel>
            <Input
              type="number"
              value={editForm.anioIngreso}
              onChange={(e) => setEditForm((p) => ({ ...p, anioIngreso: Number(e.target.value) }))}
            />
          </div>
          <div>
            <FieldLabel required>Estado institucional</FieldLabel>
            <Select
              value={editForm.estadoInstitucional}
              onChange={(e) => setEditForm((p) => ({ ...p, estadoInstitucional: e.target.value }))}
            >
              <option value="activo">Activo</option>
              <option value="egresado">Egresado</option>
              <option value="pase">Pase a otra institución</option>
              <option value="desvinculado">Desvinculado</option>
              <option value="archivado">Archivado</option>
            </Select>
          </div>
          <div>
            <FieldLabel>Motivo de baja / pase (opcional)</FieldLabel>
            <Input
              value={editForm.motivoBaja}
              onChange={(e) => setEditForm((p) => ({ ...p, motivoBaja: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>Observaciones</FieldLabel>
            <Textarea
              value={editForm.observaciones}
              onChange={(e) => setEditForm((p) => ({ ...p, observaciones: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setEditModalOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => updateMutation.mutate()} loading={updateMutation.isPending}>
            Guardar cambios
          </Button>
        </div>
      </Modal>

      {/* Enroll / Change Course Modal */}
      <Modal
        open={enrollModalOpen}
        onClose={() => setEnrollModalOpen(false)}
        title={
          currentEnrollment
            ? `Cambiar curso / turno — Ciclo ${selectedYearId}`
            : `Matricular estudiante — Ciclo ${selectedYearId}`
        }
        subtitle="Si el estudiante posee una matrícula activa en este ciclo, se cerrará conservando su historial."
      >
        <div className="space-y-4">
          <div>
            <FieldLabel required>Curso y división de destino</FieldLabel>
            <Select
              value={targetCourseId}
              onChange={(e) => setTargetCourseId(e.target.value)}
            >
              <option value="">Seleccionar curso...</option>
              {activeCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} — Turno {c.shiftName} ({c.legacyCode})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel>Motivo / Observaciones</FieldLabel>
            <Textarea
              value={enrollObs}
              onChange={(e) => setEnrollObs(e.target.value)}
              placeholder="Ej. Cambio de turno solicitado por la familia"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setEnrollModalOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => enrollMutation.mutate()}
            loading={enrollMutation.isPending}
            disabled={!targetCourseId}
          >
            Confirmar asignación
          </Button>
        </div>
      </Modal>
    </div>
  );
};
