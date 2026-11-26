import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText, Download } from 'lucide-react';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { listStudents } from '@/repositories/studentRepository';
import { listCourses, listEnrollments, listMovements } from '@/repositories/academicRepository';
import {
  exportRowsToCsv,
  exportRowsToExcel,
  exportTableToPdf,
} from '@/services/exportService';
import { Badge, Button, Card, PageHeader, StatCard } from '@/components/ui/Primitives';
import { Users, GraduationCap, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export const EnrollmentReportPage: React.FC = () => {
  const { selectedYearId, settings } = useAcademicYear();

  const studentsQuery = useQuery({ queryKey: ['students'], queryFn: listStudents });
  const coursesQuery = useQuery({
    queryKey: ['courses', selectedYearId],
    queryFn: () => listCourses(selectedYearId),
  });
  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', selectedYearId],
    queryFn: () => listEnrollments(selectedYearId),
  });
  const movementsQuery = useQuery({
    queryKey: ['movements', selectedYearId],
    queryFn: () => listMovements({ academicYearId: selectedYearId }),
  });

  const data = useMemo(() => {
    const students = studentsQuery.data ?? [];
    const courses = coursesQuery.data ?? [];
    const enrollments = enrollmentsQuery.data ?? [];
    const movements = movementsQuery.data ?? [];
    const active = enrollments.filter((e) => e.status === 'activa');

    const byCourse = courses.map((c) => ({
      course: c.label,
      year: `${c.yearNumber}°`,
      division: c.division,
      shift: c.shiftName,
      count: active.filter((e) => e.courseId === c.id).length,
      capacity: c.capacity ?? '—',
    }));

    const byYear = [1, 2, 3, 4, 5, 6, 7]
      .map((y) => ({
        year: `${y}° año`,
        count: active.filter((e) => e.yearNumber === y).length,
      }))
      .filter((r) => r.count > 0 || Number(r.year[0]) <= 6);

    const byShiftMap = new Map<string, number>();
    active.forEach((e) => byShiftMap.set(e.shiftName, (byShiftMap.get(e.shiftName) || 0) + 1));

    return {
      totalStudents: students.length,
      activeCount: active.length,
      altas: movements.filter((m) => m.type === 'alta' || m.type === 'migracion_anual').length,
      bajas: movements.filter((m) => m.type === 'baja').length,
      pases: students.filter((s) => s.estadoInstitucional === 'pase').length,
      egresados: students.filter((s) => s.estadoInstitucional === 'egresado').length,
      desvinculados: students.filter((s) => s.estadoInstitucional === 'desvinculado').length,
      byCourse,
      byYear,
      byShift: Array.from(byShiftMap.entries()).map(([shift, count]) => ({ shift, count })),
    };
  }, [studentsQuery.data, coursesQuery.data, enrollmentsQuery.data, movementsQuery.data]);

  const exportRows = data.byCourse.map((r) => ({
    Ciclo_Lectivo: selectedYearId,
    Curso: r.course,
    Anio: r.year,
    Division: r.division,
    Turno: r.shift,
    Matriculados_Activos: r.count,
    Capacidad: r.capacity,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Reportes de Matrícula — Ciclo ${selectedYearId}`}
        subtitle="Indicadores consolidados de matrícula general, por año de cursada, por turno y por curso."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportRowsToExcel(
                  exportRows,
                  'Matricula',
                  `reporte_matricula_${selectedYearId}.xlsx`
                )
              }
            >
              <FileSpreadsheet size={15} /> XLSX
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportRowsToCsv(exportRows, `reporte_matricula_${selectedYearId}.csv`)
              }
            >
              <Download size={15} /> CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportTableToPdf({
                  title: `Reporte de Matrícula por Curso — Ciclo ${selectedYearId}`,
                  subtitle: `Matrícula activa total: ${data.activeCount} estudiantes`,
                  academicYear: selectedYearId,
                  settings,
                  headers: ['Curso', 'Año', 'División', 'Turno', 'Activos', 'Capacidad'],
                  rows: data.byCourse.map((r) => [
                    r.course,
                    r.year,
                    r.division,
                    r.shift,
                    String(r.count),
                    String(r.capacity),
                  ]),
                  filename: `reporte_matricula_${selectedYearId}.pdf`,
                })
              }
            >
              <FileText size={15} /> PDF
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total base general"
          value={data.totalStudents}
          icon={<Users size={20} />}
          accent="brand"
        />
        <StatCard
          label="Matrícula activa"
          value={data.activeCount}
          icon={<GraduationCap size={20} />}
          accent="emerald"
        />
        <StatCard
          label="Altas del ciclo"
          value={data.altas}
          icon={<ArrowUpRight size={20} />}
          accent="brand"
        />
        <StatCard
          label="Bajas / Pases / Egresados"
          value={`${data.bajas} / ${data.pases} / ${data.egresados}`}
          icon={<ArrowDownRight size={20} />}
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="font-bold text-ink-primary mb-3">Matrícula por Año de Cursada</h2>
          <div className="divide-y divide-border-subtle text-sm">
            {data.byYear.map((r) => (
              <div key={r.year} className="py-2.5 flex justify-between">
                <span>{r.year}</span>
                <Badge variant="brand">{r.count} estudiantes</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-bold text-ink-primary mb-3">Matrícula por Turno</h2>
          <div className="divide-y divide-border-subtle text-sm">
            {data.byShift.length === 0 ? (
              <p className="text-xs text-ink-muted py-4">Sin datos para este ciclo.</p>
            ) : (
              data.byShift.map((r) => (
                <div key={r.shift} className="py-2.5 flex justify-between">
                  <span>Turno {r.shift}</span>
                  <Badge variant="success">{r.count} estudiantes</Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle">
          <h2 className="font-bold text-ink-primary">Detalle de Matrícula por Curso</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-subtle text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-4 py-3">Curso</th>
              <th className="px-4 py-3">Turno</th>
              <th className="px-4 py-3">Matriculados activos</th>
              <th className="px-4 py-3">Capacidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {data.byCourse.map((r) => (
              <tr key={`${r.course}_${r.shift}`}>
                <td className="px-4 py-2.5 font-semibold">{r.course}</td>
                <td className="px-4 py-2.5">{r.shift}</td>
                <td className="px-4 py-2.5 font-bold text-brand-600 dark:text-brand-300">
                  {r.count}
                </td>
                <td className="px-4 py-2.5 text-ink-muted">{r.capacity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};
