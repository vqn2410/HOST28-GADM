import React from 'react';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { exportRowsToExcel } from '@/services/exportService';
import { formatDniDisplay } from '@/lib/utils/formatters';
import { Badge, Button, Card, EmptyState } from '@/components/ui/Primitives';
import type { Course, Student, StudentGradeRecord, Subject } from '@/types/domain';

interface LandscapeGradesGridProps {
  course: Course;
  rosterStudents: Student[];
  subjects: Subject[];
  grades: StudentGradeRecord[];
  academicYearId: string;
}

/**
 * Planilla apaisada con todas las materias del curso para Preceptoría / Conducción.
 */
export const LandscapeGradesGrid: React.FC<LandscapeGradesGridProps> = ({
  course,
  rosterStudents,
  subjects,
  grades,
  academicYearId,
}) => {
  const gradeMap = new Map<string, StudentGradeRecord>();
  grades.forEach((g) => gradeMap.set(`${g.studentDni}_${g.subjectId}`, g));

  const handleExportExcel = () => {
    const rows = rosterStudents.map((st, idx) => {
      const row: Record<string, string | number> = {
        Orden: idx + 1,
        Estudiante: `${st.apellido}, ${st.nombres}`,
        DNI: st.dni,
      };
      let riskCount = 0;
      subjects.forEach((subj) => {
        const g = gradeMap.get(`${st.dni}_${subj.id}`);
        if (!g) {
          row[subj.name] = '—';
        } else {
          const isRisk =
            g.estadoAcreditacion !== 'acreditada' &&
            (g.val1 === 'TEP' ||
              g.val1 === 'TED' ||
              g.val2 === 'TEP' ||
              g.val2 === 'TED' ||
              (g.nota1 !== null && g.nota1 <= 6) ||
              (g.nota2 !== null && g.nota2 <= 6));
          if (isRisk) riskCount += 1;
          const parts = [
            g.nota1 !== null ? `1C:${g.nota1}` : g.val1 || '',
            g.nota2 !== null ? `2C:${g.nota2}` : g.val2 || '',
            g.notaFinal !== null ? `F:${g.notaFinal}` : '',
          ].filter(Boolean);
          row[subj.name] = parts.join(' / ') || '—';
        }
      });
      row['Mat_TEP_TED_1a6'] = riskCount;
      return row;
    });
    exportRowsToExcel(
      rows,
      `Apaisada_${course.legacyCode}`,
      `planilla_apaisada_${course.legacyCode}_${academicYearId}.xlsx`
    );
  };

  if (rosterStudents.length === 0) {
    return (
      <Card className="p-8">
        <EmptyState
          title="Sin estudiantes en este curso"
          description="Seleccioná un curso con matrícula activa para ver la planilla apaisada."
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-border-subtle flex flex-wrap items-center justify-between gap-2 no-print">
        <div>
          <h3 className="font-bold text-sm text-ink-primary">
            Planilla Apaisada — {course.label} ({course.shiftName}) · Ciclo {academicYearId}
          </h3>
          <p className="text-xs text-ink-muted">
            Vista consolidada de todas las materias ({subjects.length} espacios curriculares ·{' '}
            {rosterStudents.length} estudiantes).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer size={14} /> Imprimir
          </Button>
          <Button variant="emerald" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet size={14} /> Exportar Excel
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead className="bg-surface-subtle text-ink-muted uppercase">
            <tr>
              <th className="px-3 py-2.5 sticky left-0 bg-surface-subtle z-10 min-w-[180px] border-r border-border-subtle">
                Estudiante
              </th>
              {subjects.map((s) => (
                <th
                  key={s.id}
                  className="px-2 py-2.5 text-center min-w-[92px] border-r border-border-subtle"
                >
                  <span className="block leading-tight">{s.name}</span>
                </th>
              ))}
              <th className="px-2.5 py-2.5 text-center min-w-[76px]">TEP/TED/1-6</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rosterStudents.map((st) => {
              let riskCount = 0;
              return (
                <tr key={st.dni} className="hover:bg-surface-subtle/30">
                  <td className="px-3 py-2 sticky left-0 bg-surface-card z-10 border-r border-border-subtle">
                    <span className="font-bold text-ink-primary block truncate max-w-[175px]">
                      {st.apellido}, {st.nombres}
                    </span>
                    <span className="text-[10px] font-mono text-ink-muted">
                      {formatDniDisplay(st.dni)}
                    </span>
                  </td>
                  {subjects.map((subj) => {
                    const g = gradeMap.get(`${st.dni}_${subj.id}`);
                    const isRisk =
                      g &&
                      g.estadoAcreditacion !== 'acreditada' &&
                      (g.val1 === 'TEP' ||
                        g.val1 === 'TED' ||
                        g.val2 === 'TEP' ||
                        g.val2 === 'TED' ||
                        (g.nota1 !== null && g.nota1 <= 6) ||
                        (g.nota2 !== null && g.nota2 <= 6));
                    if (isRisk) riskCount += 1;

                    const cellBg =
                      g?.estadoAcreditacion === 'acreditada'
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                        : isRisk
                          ? 'bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                          : 'text-ink-muted';

                    return (
                      <td
                        key={subj.id}
                        className={`px-1.5 py-2 text-center border-r border-border-subtle font-mono ${cellBg}`}
                      >
                        {g ? (
                          <div className="leading-tight">
                            <div>
                              {(g.nota1 ?? g.val1) || '—'} / {(g.nota2 ?? g.val2) || '—'}
                            </div>
                            {g.notaFinal !== null && (
                              <div className="font-bold text-[10px]">F: {g.notaFinal}</div>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center">
                    <Badge
                      variant={
                        riskCount === 0
                          ? 'success'
                          : riskCount <= 2
                            ? 'info'
                            : riskCount <= 4
                              ? 'warning'
                              : 'danger'
                      }
                    >
                      {riskCount}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
