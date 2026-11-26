import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FieldLabel,
  PageHeader,
  Select,
} from '@/components/ui/Primitives';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { listStudents } from '@/repositories/studentRepository';
import {
  enrollStudent,
  listCourses,
  listEnrollments,
} from '@/repositories/academicRepository';
import { logAudit } from '@/repositories/auditRepository';
import { formatDniDisplay } from '@/lib/utils/formatters';
import type { Student } from '@/types/domain';

export const MigrationPage: React.FC = () => {
  const { user } = useAuth();
  const { academicYears, selectedYearId } = useAcademicYear();
  const queryClient = useQueryClient();

  const [sourceYearId, setSourceYearId] = useState(selectedYearId);
  const [targetYearId, setTargetYearId] = useState(() => {
    const next = academicYears.find((y) => y.id !== selectedYearId);
    return next?.id || selectedYearId;
  });
  const [sourceCourseId, setSourceCourseId] = useState('');
  const [defaultTargetCourseId, setDefaultTargetCourseId] = useState('');
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({});
  const [individualCourseMap, setIndividualCourseMap] = useState<Record<string, string>>({});
  const [isMigrating, setIsMigrating] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

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

  const studentMap = useMemo(() => {
    const m = new Map<string, Student>();
    (studentsQuery.data ?? []).forEach((s) => m.set(s.dni, s));
    return m;
  }, [studentsQuery.data]);

  const sourceCourses = sourceCoursesQuery.data ?? [];
  const targetCourses = (targetCoursesQuery.data ?? []).filter((c) => c.status === 'activo');

  // Excluir estudiantes egresados o con pase
  const roster = useMemo(() => {
    if (!sourceCourseId) return [];
    return (sourceEnrollmentsQuery.data ?? [])
      .filter((e) => e.courseId === sourceCourseId && e.status === 'activa')
      .map((e) => ({ enrollment: e, student: studentMap.get(e.studentDni) }))
      .filter(
        (item): item is { enrollment: typeof item.enrollment; student: Student } =>
          Boolean(item.student) &&
          item.student!.estadoInstitucional !== 'egresado' &&
          item.student!.estadoInstitucional !== 'pase' &&
          item.student!.estadoInstitucional !== 'archivado'
      )
      .sort((a, b) => a.student.apellido.localeCompare(b.student.apellido, 'es'));
  }, [sourceCourseId, sourceEnrollmentsQuery.data, studentMap]);

  const selectedItems = roster.filter((r) => selectedMap[r.student.dni]);

  const handleConfirmMigration = async () => {
    if (!user) return;
    if (sourceYearId === targetYearId) {
      toast.error('El ciclo de origen y el ciclo de destino deben ser diferentes.');
      return;
    }
    if (selectedItems.length === 0) {
      toast.error('Seleccioná al menos un estudiante para migrar.');
      return;
    }

    setIsMigrating(true);
    let ok = 0;
    let failed = 0;

    for (const item of selectedItems) {
      const courseId = individualCourseMap[item.student.dni] || defaultTargetCourseId;
      const targetCourse = targetCourses.find((c) => c.id === courseId);
      if (!targetCourse) {
        failed += 1;
        continue;
      }
      try {
        await enrollStudent({
          student: item.student,
          academicYearId: targetYearId,
          course: targetCourse,
          observations: `Migración anual desde ${item.enrollment.courseLabel} (${sourceYearId})`,
          performedByDni: user.dni,
          performedByName: `${user.apellido}, ${user.nombre}`,
          movementType: 'migracion_anual',
          isCurrentDefaultYear: academicYears.find((y) => y.id === targetYearId)?.isDefault ?? false,
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
      entity: 'sgae_enrollments',
      entityId: `${sourceYearId}_to_${targetYearId}`,
      newSummary: { migrated: ok, failed },
    });

    setIsMigrating(false);
    setResultMsg(
      `Migración completada: ${ok} nuevas matrículas generadas en ciclo ${targetYearId}${
        failed > 0 ? ` (${failed} omitidas o ya existentes)` : ''
      }. Los registros históricos de ${sourceYearId} permanecieron intactos.`
    );
    toast.success(`Se migraron ${ok} estudiantes al ciclo ${targetYearId}.`);
    void queryClient.invalidateQueries({ queryKey: ['enrollments', targetYearId] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asistente de Migración Anual"
        subtitle="Promové, mantené en el mismo año o reasigná división/turno hacia un nuevo ciclo lectivo sin duplicar estudiantes ni alterar el historial."
      />

      {/* Step 1: Select Years & Source Course */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <FieldLabel required>1. Ciclo origen</FieldLabel>
            <Select
              value={sourceYearId}
              onChange={(e) => {
                setSourceYearId(e.target.value);
                setSourceCourseId('');
                setSelectedMap({});
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
            <FieldLabel required>2. Ciclo destino</FieldLabel>
            <Select
              value={targetYearId}
              onChange={(e) => {
                setTargetYearId(e.target.value);
                setDefaultTargetCourseId('');
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
                setSelectedMap({});
                setIndividualCourseMap({});
              }}
            >
              <option value="">Seleccionar curso...</option>
              {sourceCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} — {c.shiftName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel required>4. Curso destino general</FieldLabel>
            <Select
              value={defaultTargetCourseId}
              onChange={(e) => setDefaultTargetCourseId(e.target.value)}
            >
              <option value="">Seleccionar destino...</option>
              {targetCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} — {c.shiftName}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {resultMsg && (
        <div className="p-4 rounded-2xl bg-emerald-brand-50 dark:bg-emerald-950/40 border border-emerald-brand-500/30 text-sm text-emerald-brand-700 dark:text-emerald-200 flex items-center gap-3">
          <CheckCircle2 size={18} className="shrink-0" />
          <span>{resultMsg}</span>
        </div>
      )}

      {/* Step 2: Roster & Individual Overrides */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b border-border-subtle flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-brand-500" />
            <h2 className="text-base font-bold text-ink-primary">
              Nómina elegible ({roster.length})
            </h2>
            <Badge variant="brand">{selectedItems.length} seleccionados</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const next: Record<string, boolean> = {};
                roster.forEach((r) => (next[r.student.dni] = true));
                setSelectedMap(next);
              }}
              disabled={roster.length === 0}
            >
              Seleccionar todos
            </Button>
            <Button
              variant="emerald"
              size="sm"
              onClick={handleConfirmMigration}
              loading={isMigrating}
              disabled={selectedItems.length === 0 || (!defaultTargetCourseId && Object.keys(individualCourseMap).length === 0)}
            >
              Confirmar migración ({selectedItems.length})
              <ArrowRight size={15} />
            </Button>
          </div>
        </div>

        {!sourceCourseId ? (
          <EmptyState
            title="Seleccioná un curso de origen"
            description="Se mostrarán automáticamente los estudiantes activos excluyendo egresados y pases. Podés asignar destinos individuales (promoción, permanencia o cambio de turno)."
          />
        ) : roster.length === 0 ? (
          <EmptyState
            title="Sin estudiantes elegibles en este curso"
            description="No hay estudiantes activos matriculados en el curso seleccionado."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-surface-subtle/70 text-xs uppercase text-ink-muted border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3 w-10">Inc.</th>
                  <th className="px-4 py-3">Estudiante</th>
                  <th className="px-4 py-3">DNI</th>
                  <th className="px-4 py-3">Curso origen ({sourceYearId})</th>
                  <th className="px-4 py-3">Asignación destino ({targetYearId})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {roster.map(({ student, enrollment }) => (
                  <tr key={student.dni}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={!!selectedMap[student.dni]}
                        onChange={(e) =>
                          setSelectedMap((p) => ({ ...p, [student.dni]: e.target.checked }))
                        }
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {student.apellido}, {student.nombres}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {formatDniDisplay(student.dni)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {enrollment.courseLabel} ({enrollment.shiftName})
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={individualCourseMap[student.dni] || defaultTargetCourseId}
                        onChange={(e) =>
                          setIndividualCourseMap((p) => ({
                            ...p,
                            [student.dni]: e.target.value,
                          }))
                        }
                        className="h-8 text-xs"
                      >
                        <option value="">Seleccionar curso destino...</option>
                        {targetCourses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label} — {c.shiftName}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
