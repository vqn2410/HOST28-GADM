import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { listStudents } from '@/repositories/studentRepository';
import { enrollStudent, listCourses, listEnrollments } from '@/repositories/academicRepository';
import { logAudit } from '@/repositories/auditRepository';
import { formatDniDisplay } from '@/lib/utils/formatters';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FieldLabel,
  PageHeader,
  Select,
} from '@/components/ui/Primitives';

export const EnrollmentMigrationPage: React.FC = () => {
  const { user } = useAuth();
  const { academicYears, selectedYearId } = useAcademicYear();
  const queryClient = useQueryClient();

  const [sourceYearId, setSourceYearId] = useState(selectedYearId);
  const [targetYearId, setTargetYearId] = useState(() => {
    const other = academicYears.find((y) => y.id !== selectedYearId);
    return other?.id || selectedYearId;
  });
  const [sourceCourseId, setSourceCourseId] = useState('');
  const [bulkTargetCourseId, setBulkTargetCourseId] = useState('');
  const [selectedDnis, setSelectedDnis] = useState<Record<string, boolean>>({});
  const [perStudentTarget, setPerStudentTarget] = useState<Record<string, string>>({});
  const [migrating, setMigrating] = useState(false);

  const studentsQuery = useQuery({ queryKey: ['students'], queryFn: listStudents });
  const sourceCoursesQuery = useQuery({
    queryKey: ['courses', sourceYearId],
    queryFn: () => listCourses(sourceYearId),
  });
  const targetCoursesQuery = useQuery({
    queryKey: ['courses', targetYearId],
    queryFn: () => listCourses(targetYearId),
  });
  const sourceEnrollmentsQuery = useQuery({
    queryKey: ['enrollments', sourceYearId],
    queryFn: () => listEnrollments(sourceYearId),
  });

  const studentsByDni = useMemo(
    () => new Map((studentsQuery.data ?? []).map((s) => [s.dni, s])),
    [studentsQuery.data]
  );

  const sourceRoster = useMemo(() => {
    if (!sourceCourseId) return [];
    return (sourceEnrollmentsQuery.data ?? [])
      .filter((e) => e.status === 'activa' && e.courseId === sourceCourseId)
      .map((e) => ({ enrollment: e, student: studentsByDni.get(e.studentDni) }))
      .filter(
        (item): item is { enrollment: typeof item.enrollment; student: NonNullable<typeof item.student> } =>
          item.student !== undefined &&
          item.student.estadoInstitucional !== 'egresado' &&
          item.student.estadoInstitucional !== 'pase' &&
          item.student.estadoInstitucional !== 'archivado'
      )
      .sort((a, b) => a.student.apellido.localeCompare(b.student.apellido, 'es'));
  }, [sourceEnrollmentsQuery.data, sourceCourseId, studentsByDni]);

  const applyBulkTargetCourse = (courseId: string) => {
    setBulkTargetCourseId(courseId);
    const next: Record<string, string> = { ...perStudentTarget };
    sourceRoster.forEach(({ student }) => {
      if (selectedDnis[student.dni]) {
        next[student.dni] = courseId;
      }
    });
    setPerStudentTarget(next);
  };

  const handleConfirmMigration = async () => {
    if (!user) return;
    if (sourceYearId === targetYearId) {
      toast.error('El ciclo de destino debe ser diferente al ciclo de origen.');
      return;
    }
    const chosen = sourceRoster.filter(({ student }) => selectedDnis[student.dni]);
    if (chosen.length === 0) {
      toast.error('Seleccioná al menos un estudiante para migrar.');
      return;
    }

    const targetCourses = targetCoursesQuery.data ?? [];
    const targetYearObj = academicYears.find((y) => y.id === targetYearId);
    setMigrating(true);
    let ok = 0;
    let failed = 0;

    for (const { student } of chosen) {
      const destCourseId = perStudentTarget[student.dni] || bulkTargetCourseId;
      const destCourse = targetCourses.find((c) => c.id === destCourseId);
      if (!destCourse) {
        failed += 1;
        continue;
      }
      try {
        await enrollStudent({
          student,
          academicYearId: targetYearId,
          course: destCourse,
          observations: `Migración anual desde ciclo ${sourceYearId}`,
          performedByDni: user.dni,
          performedByName: `${user.apellido}, ${user.nombre}`,
          movementType: 'migracion_anual',
          isCurrentDefaultYear: targetYearObj?.isDefault ?? false,
        });
        ok += 1;
      } catch {
        failed += 1;
      }
    }

    await logAudit({
      userDni: user.dni,
      userName: `${user.apellido}, ${user.nombre}`,
      userRole: user.roleId,
      operation: 'annual_migration',
      entity: 'enrollments',
      entityId: `${sourceYearId}_to_${targetYearId}`,
      newSummary: { migrated: ok, skippedOrFailed: failed, sourceCourseId },
    });

    await queryClient.invalidateQueries({ queryKey: ['enrollments', targetYearId] });
    setMigrating(false);
    toast.success(`Migración completada: ${ok} estudiantes matriculados en ${targetYearId}${failed ? ` (${failed} omitidos/ya matriculados)` : ''}.`);
  };

  const selectedCount = sourceRoster.filter(({ student }) => selectedDnis[student.dni]).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asistente de Migración Anual"
        subtitle="Generá nuevas matrículas para el ciclo lectivo siguiente sin modificar ni eliminar registros históricos ni duplicar estudiantes."
      />

      {/* Paso 1 y 2: Ciclos y curso origen */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <FieldLabel required>1. Ciclo lectivo de origen</FieldLabel>
            <Select
              value={sourceYearId}
              onChange={(e) => {
                setSourceYearId(e.target.value);
                setSourceCourseId('');
                setSelectedDnis({});
              }}
            >
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  Ciclo {y.year}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <FieldLabel required>2. Ciclo lectivo de destino</FieldLabel>
            <Select
              value={targetYearId}
              onChange={(e) => {
                setTargetYearId(e.target.value);
                setBulkTargetCourseId('');
                setPerStudentTarget({});
              }}
            >
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  Ciclo {y.year} ({y.status})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <FieldLabel required>3. Curso de origen</FieldLabel>
            <Select
              value={sourceCourseId}
              onChange={(e) => {
                setSourceCourseId(e.target.value);
                setSelectedDnis({});
              }}
            >
              <option value="">— Seleccionar curso —</option>
              {(sourceCoursesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} — Turno {c.shiftName}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Paso 3: Nómina y asignaciones individuales o masivas */}
      {sourceCourseId && (
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-border-subtle flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-ink-primary flex items-center gap-2">
                <Users size={18} className="text-brand-500" />
                Nómina elegible ({sourceRoster.length} estudiantes)
              </h2>
              <p className="text-xs text-ink-secondary">
                Se excluyen automáticamente egresados, pases y archivados. Podés asignar promoción,
                permanencia o cambio de división/turno por estudiante.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={bulkTargetCourseId}
                onChange={(e) => applyBulkTargetCourse(e.target.value)}
                className="w-60 h-9 text-xs"
              >
                <option value="">Asignar curso destino a seleccionados...</option>
                {(targetCoursesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} — Turno {c.shiftName}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="emerald"
                loading={migrating}
                disabled={selectedCount === 0}
                onClick={handleConfirmMigration}
              >
                <CheckCircle2 size={15} /> Confirmar migración ({selectedCount})
              </Button>
            </div>
          </div>

          {sourceRoster.length === 0 ? (
            <EmptyState
              title="Sin estudiantes elegibles en este curso"
              description="Verificá que el curso de origen tenga matrículas activas."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-subtle text-xs uppercase text-ink-muted">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos"
                        checked={
                          sourceRoster.length > 0 &&
                          sourceRoster.every(({ student }) => Boolean(selectedDnis[student.dni]))
                        }
                        onChange={(e) => {
                          const next: Record<string, boolean> = {};
                          if (e.target.checked) {
                            sourceRoster.forEach(({ student }) => (next[student.dni] = true));
                          }
                          setSelectedDnis(next);
                        }}
                      />
                    </th>
                    <th className="px-4 py-3">Estudiante</th>
                    <th className="px-4 py-3">Curso origen ({sourceYearId})</th>
                    <th className="px-4 py-3">Curso destino ({targetYearId})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {sourceRoster.map(({ student, enrollment }) => (
                    <tr key={student.dni}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedDnis[student.dni])}
                          onChange={(e) =>
                            setSelectedDnis((prev) => ({
                              ...prev,
                              [student.dni]: e.target.checked,
                            }))
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">
                          {student.apellido}, {student.nombres}
                        </span>
                        <span className="block text-xs text-ink-muted font-mono">
                          DNI {formatDniDisplay(student.dni)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="neutral">
                          {enrollment.courseLabel} ({enrollment.shiftName})
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ArrowRight size={14} className="text-ink-muted shrink-0" />
                          <Select
                            value={perStudentTarget[student.dni] || bulkTargetCourseId || ''}
                            onChange={(e) =>
                              setPerStudentTarget((prev) => ({
                                ...prev,
                                [student.dni]: e.target.value,
                              }))
                            }
                            className="h-9 text-xs max-w-xs"
                          >
                            <option value="">— Seleccionar curso destino —</option>
                            {(targetCoursesQuery.data ?? []).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label} — Turno {c.shiftName}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
