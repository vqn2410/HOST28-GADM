import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  User,
  GraduationCap,
  History,
  FileBadge2,
  ArrowRightLeft,
  Save,
  Download,
  Printer,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { getStudentByDni, updateStudent } from '@/repositories/studentRepository';
import { listMovements, listStudentEnrollments } from '@/repositories/academicRepository';
import { listCertificates } from '@/repositories/certificateRepository';
import { logAudit } from '@/repositories/auditRepository';
import { downloadCertificatePdf } from '@/templates/pdf/certificatePdfGenerator';
import {
  calculateAge,
  formatDateAR,
  formatDateTimeAR,
  formatDniDisplay,
} from '@/lib/utils/formatters';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FieldLabel,
  Input,
  PageHeader,
  Select,
  SkeletonBlock,
  Textarea,
} from '@/components/ui/Primitives';

type TabId = 'personal' | 'matricula' | 'trayectoria' | 'documentacion' | 'movimientos';

export const StudentProfilePage: React.FC = () => {
  const { id: dniParam } = useParams<{ id: string }>();
  const { user, can } = useAuth();
  const { selectedYearId, settings } = useAcademicYear();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>('personal');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const student = studentQuery.data;

  const [formState, setFormState] = useState<{
    apellido: string;
    nombres: string;
    fechaNacimiento: string;
    anioIngreso: number;
    estadoInstitucional: string;
    observaciones: string;
    fechaEgreso: string;
    fechaPase: string;
    motivoBaja: string;
  } | null>(null);

  const startEdit = () => {
    if (!student) return;
    setFormState({
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
    setEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || !formState || !user) return;
    setSaving(true);
    try {
      await updateStudent(student.dni, {
        apellido: formState.apellido,
        nombres: formState.nombres,
        fechaNacimiento: formState.fechaNacimiento,
        anioIngreso: Number(formState.anioIngreso),
        estadoInstitucional: formState.estadoInstitucional,
        observaciones: formState.observaciones,
        fechaEgreso: formState.fechaEgreso || null,
        fechaPase: formState.fechaPase || null,
        motivoBaja: formState.motivoBaja || null,
      });

      await logAudit({
        userDni: user.dni,
        userName: `${user.apellido}, ${user.nombre}`,
        userRole: user.roleId,
        operation: 'student_update',
        entity: 'students',
        entityId: student.dni,
        changedFields: ['apellido', 'nombres', 'fechaNacimiento', 'estadoInstitucional', 'observaciones'],
      });

      await queryClient.invalidateQueries({ queryKey: ['student', dniParam] });
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success('Datos del estudiante actualizados.');
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar.');
    } finally {
      setSaving(false);
    }
  };

  if (studentQuery.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-14 w-80" />
        <SkeletonBlock className="h-64 w-full" />
      </div>
    );
  }

  if (!student) {
    return (
      <Card className="p-8">
        <EmptyState
          title="Estudiante no encontrado"
          description="El DNI solicitado no existe en la base general de estudiantes."
          action={
            <Link to="/estudiantes">
              <Button variant="outline">Volver al listado</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const enrollments = enrollmentsQuery.data ?? [];
  const currentEnrollment =
    enrollments.find((e) => e.academicYearId === selectedYearId && e.status === 'activa') ??
    enrollments.find((e) => e.status === 'activa');
  const age = calculateAge(student.fechaNacimiento);

  const tabs: { id: TabId; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'personal', label: 'Información personal', icon: <User size={15} /> },
    { id: 'matricula', label: 'Matrícula actual', icon: <GraduationCap size={15} /> },
    {
      id: 'trayectoria',
      label: 'Trayectoria institucional',
      icon: <History size={15} />,
      count: enrollments.length,
    },
    {
      id: 'documentacion',
      label: 'Documentación',
      icon: <FileBadge2 size={15} />,
      count: certsQuery.data?.length ?? 0,
    },
    {
      id: 'movimientos',
      label: 'Movimientos',
      icon: <ArrowRightLeft size={15} />,
      count: movementsQuery.data?.length ?? 0,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${student.apellido}, ${student.nombres}`}
        subtitle={`DNI ${formatDniDisplay(student.dni)} · ID interno: ${student.id} · Ingreso ${student.anioIngreso}`}
        badge={
          <Badge variant={student.estadoInstitucional === 'activo' ? 'success' : 'warning'}>
            {student.estadoInstitucional.toUpperCase()}
          </Badge>
        }
        actions={
          <>
            {can('certificates:issue') && (
              <Link to={`/certificados/alumno-regular?dni=${student.dni}`}>
                <Button variant="emerald" size="sm">
                  <FileBadge2 size={15} /> Emisión rápida de certificado
                </Button>
              </Link>
            )}
            <Link to="/estudiantes">
              <Button variant="outline" size="sm">
                <ArrowLeft size={15} /> Volver
              </Button>
            </Link>
          </>
        }
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border-subtle pb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === t.id
                ? 'bg-brand-500 text-white shadow-xs'
                : 'bg-surface-card border border-border-subtle text-ink-secondary hover:text-ink-primary'
            }`}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span className="px-1.5 py-0.2 rounded-full bg-black/15 text-[10px]">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Información personal */}
      {activeTab === 'personal' && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-ink-primary">Datos Generales del Estudiante</h2>
            {can('students:edit') && !editing && (
              <Button variant="outline" size="sm" onClick={startEdit}>
                Editar datos
              </Button>
            )}
          </div>

          {editing && formState ? (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Apellido</FieldLabel>
                  <Input
                    value={formState.apellido}
                    onChange={(e) => setFormState({ ...formState, apellido: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <FieldLabel required>Nombres</FieldLabel>
                  <Input
                    value={formState.nombres}
                    onChange={(e) => setFormState({ ...formState, nombres: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Fecha de nacimiento</FieldLabel>
                  <Input
                    type="date"
                    value={formState.fechaNacimiento}
                    onChange={(e) =>
                      setFormState({ ...formState, fechaNacimiento: e.target.value })
                    }
                  />
                </div>
                <div>
                  <FieldLabel required>Año de ingreso</FieldLabel>
                  <Input
                    type="number"
                    value={formState.anioIngreso}
                    onChange={(e) =>
                      setFormState({ ...formState, anioIngreso: Number(e.target.value) })
                    }
                    required
                  />
                </div>
                <div>
                  <FieldLabel required>Estado institucional</FieldLabel>
                  <Select
                    value={formState.estadoInstitucional}
                    onChange={(e) =>
                      setFormState({ ...formState, estadoInstitucional: e.target.value })
                    }
                  >
                    <option value="activo">Activo</option>
                    <option value="egresado">Egresado</option>
                    <option value="pase">Pase a otra institución</option>
                    <option value="desvinculado">Desvinculado</option>
                    <option value="archivado">Archivado</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Fecha de egreso / pase</FieldLabel>
                  <Input
                    type="date"
                    value={formState.fechaEgreso || formState.fechaPase}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        fechaEgreso:
                          formState.estadoInstitucional === 'egresado' ? e.target.value : '',
                        fechaPase:
                          formState.estadoInstitucional === 'pase' ? e.target.value : '',
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <FieldLabel>Motivo de baja / pase</FieldLabel>
                <Input
                  value={formState.motivoBaja}
                  onChange={(e) => setFormState({ ...formState, motivoBaja: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel>Observaciones administrativas</FieldLabel>
                <Textarea
                  value={formState.observaciones}
                  onChange={(e) => setFormState({ ...formState, observaciones: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={saving}>
                  <Save size={15} /> Guardar cambios
                </Button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-sm">
              <div>
                <dt className="text-xs text-ink-muted uppercase font-semibold">Apellido</dt>
                <dd className="font-medium text-ink-primary mt-0.5">{student.apellido}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted uppercase font-semibold">Nombres</dt>
                <dd className="font-medium text-ink-primary mt-0.5">{student.nombres}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted uppercase font-semibold">DNI</dt>
                <dd className="font-mono font-semibold text-ink-primary mt-0.5">
                  {formatDniDisplay(student.dni)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted uppercase font-semibold">
                  Fecha de nacimiento
                </dt>
                <dd className="text-ink-primary mt-0.5">
                  {formatDateAR(student.fechaNacimiento)}{' '}
                  {age !== null && (
                    <span className="text-xs text-emerald-brand-600 font-semibold">
                      ({age} años)
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted uppercase font-semibold">Año de ingreso</dt>
                <dd className="text-ink-primary mt-0.5">{student.anioIngreso}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted uppercase font-semibold">
                  Vinculación HOST28_EF
                </dt>
                <dd className="text-xs text-ink-secondary mt-0.5">
                  Origen: {student.cursoOrigen || '—'} · EF: {student.cursoEF || '—'}
                </dd>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-xs text-ink-muted uppercase font-semibold">Observaciones</dt>
                <dd className="text-ink-secondary mt-0.5">
                  {student.observaciones || 'Sin observaciones registradas.'}
                </dd>
              </div>
            </dl>
          )}
        </Card>
      )}

      {/* Tab: Matrícula actual */}
      {activeTab === 'matricula' && (
        <Card className="p-6">
          {currentEnrollment ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-ink-primary">
                  Matrícula Activa — Ciclo {currentEnrollment.academicYearId}
                </h2>
                <Badge variant="success">{currentEnrollment.status}</Badge>
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-ink-muted">Año de cursada</dt>
                  <dd className="font-bold text-base">{currentEnrollment.yearNumber}° año</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">División</dt>
                  <dd className="font-bold text-base">{currentEnrollment.division}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Turno</dt>
                  <dd className="font-bold text-base">{currentEnrollment.shiftName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Fecha de asignación</dt>
                  <dd>{formatDateAR(currentEnrollment.startDate)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-ink-muted">Observaciones</dt>
                  <dd>{currentEnrollment.observations || '—'}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <EmptyState
              title={`Sin matrícula activa en ${selectedYearId}`}
              description="Este estudiante aún no tiene un curso asignado en el ciclo lectivo seleccionado."
              action={
                <Link to="/matricula">
                  <Button size="sm">Ir a Gestión de Matrícula</Button>
                </Link>
              }
            />
          )}
        </Card>
      )}

      {/* Tab: Trayectoria institucional */}
      {activeTab === 'trayectoria' && (
        <Card className="overflow-hidden">
          {enrollments.length === 0 ? (
            <EmptyState
              title="Sin historial de matriculación"
              description="Cuando el estudiante sea matriculado en uno o más ciclos lectivos, su trayectoria aparecerá aquí."
            />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-subtle text-xs uppercase text-ink-muted">
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
                {enrollments.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 font-bold">{e.academicYearId}</td>
                    <td className="px-4 py-3">{e.yearNumber}°</td>
                    <td className="px-4 py-3">{e.division}</td>
                    <td className="px-4 py-3">{e.shiftName}</td>
                    <td className="px-4 py-3 text-xs text-ink-secondary">
                      {formatDateAR(e.startDate)}
                      {e.endDate ? ` → ${formatDateAR(e.endDate)}` : ' → Vigente'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={e.status === 'activa' ? 'success' : 'neutral'}>
                        {e.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Tab: Documentación */}
      {activeTab === 'documentacion' && (
        <Card className="overflow-hidden">
          {(certsQuery.data ?? []).length === 0 ? (
            <EmptyState
              title="Sin certificados emitidos"
              description="No se registran constancias ni certificados emitidos para este estudiante."
              action={
                can('certificates:issue') ? (
                  <Link to={`/certificados/alumno-regular?dni=${student.dni}`}>
                    <Button size="sm">Emitir primer certificado</Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-subtle text-xs uppercase text-ink-muted">
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
                {(certsQuery.data ?? []).map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-mono font-semibold text-xs">
                      {c.certificateNumber}
                    </td>
                    <td className="px-4 py-3">{c.typeName}</td>
                    <td className="px-4 py-3 text-xs">
                      {c.snapshot.cicloLectivo} · {c.snapshot.anio} {c.snapshot.division} (
                      {c.snapshot.turno})
                    </td>
                    <td className="px-4 py-3 text-xs">{formatDateAR(c.issueDate)}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          c.status === 'emitido'
                            ? 'success'
                            : c.status === 'anulado'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Descargar / Reimprimir PDF"
                          onClick={() => void downloadCertificatePdf(c, settings)}
                        >
                          <Download size={14} />
                        </Button>
                        <Link to={`/certificados/${c.id}`}>
                          <Button variant="ghost" size="sm" title="Ver detalle">
                            <Printer size={14} />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Tab: Movimientos */}
      {activeTab === 'movimientos' && (
        <Card className="overflow-hidden">
          {(movementsQuery.data ?? []).length === 0 ? (
            <EmptyState
              title="Sin movimientos registrados"
              description="Los cambios de curso, división, turno, altas, bajas y pases se registran automáticamente aquí."
            />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-subtle text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Origen → Destino</th>
                  <th className="px-4 py-3">Responsable</th>
                  <th className="px-4 py-3">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {(movementsQuery.data ?? []).map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 text-xs">
                      {formatDateAR(m.effectiveDate)}
                      <span className="block text-[11px] text-ink-muted">
                        {formatDateTimeAR(m.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="brand">{m.type.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {m.fromCourseLabel ? `${m.fromCourseLabel} (${m.fromShiftName})` : '—'} →{' '}
                      <strong>
                        {m.toCourseLabel ? `${m.toCourseLabel} (${m.toShiftName})` : 'Baja/Egreso'}
                      </strong>
                    </td>
                    <td className="px-4 py-3 text-xs">{m.performedByName}</td>
                    <td className="px-4 py-3 text-xs text-ink-secondary">{m.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
};
