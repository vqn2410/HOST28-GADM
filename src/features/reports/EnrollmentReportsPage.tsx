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
import { Button, Card, PageHeader } from '@/components/ui/Primitives';

export const EnrollmentReportsPage: React.FC = () => {
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

  const summary = useMemo(() => {
    const students = studentsQuery.data ?? [];
    const activeEnr = (enrollmentsQuery.data ?? []).filter((e) => e.status === 'activa');
    const movs = movementsQuery.data ?? [];
    const courses = coursesQuery.data ?? [];

    const byCourse = courses.map((c) => ({
      curso: c.label,
      anio: `${c.yearNumber}°`,
      division: c.division,
      turno: c.shiftName,
      matriculados: activeEnr.filter((e) => e.courseId === c.id).length,
    }));

    const byYear = [1, 2, 3, 4, 5, 6, 7]
      .map((y) => ({
        anio: `${y}° año`,
        matriculados: activeEnr.filter((e) => e.yearNumber === y).length,
      }))
      .filter((r) => r.matriculados > 0 || Number(r.anio[0]) <= 6);

    const shiftMap = new Map<string, number>();
    activeEnr.forEach((e) => shiftMap.set(e.shiftName, (shiftMap.get(e.shiftName) || 0) + 1));
    const byShift = Array.from(shiftMap.entries()).map(([turno, matriculados]) => ({
      turno,
      matriculados,
    }));

    return {
      totalStudents: students.length,
      activeCount: activeEnr.length,
      altas: movs.filter((m) => m.type === 'alta' || m.type === 'migracion_anual').length,
      bajas: movs.filter((m) => m.type === 'baja').length,
      pases: students.filter((s) => s.estadoInstitucional === 'pase').length,
      egresados: students.filter((s) => s.estadoInstitucional === 'egresado').length,
      desvinculados: students.filter((s) => s.estadoInstitucional === 'desvinculado').length,
      byCourse,
      byYear,
      byShift,
    };
  }, [studentsQuery.data, coursesQuery.data, enrollmentsQuery.data, movementsQuery.data]);

  const exportExcel = () =>
    exportRowsToExcel(
      summary.byCourse,
      `Matricula_${selectedYearId}`,
      `reporte_matricula_${selectedYearId}.xlsx`
    );

  const exportCsv = () =>
    exportRowsToCsv(summary.byCourse, `reporte_matricula_${selectedYearId}.csv`);

  const exportPdf = () =>
    exportTableToPdf({
      title: `Reporte de Matrícula por Curso — Ciclo ${selectedYearId}`,
      subtitle: `Matrícula activa total: ${summary.activeCount} estudiantes`,
      academicYear: selectedYearId,
      settings,
      headers: ['Curso', 'Año', 'División', 'Turno', 'Matriculados'],
      rows: summary.byCourse.map((r) => [
        r.curso,
        r.anio,
        r.division,
        r.turno,
        String(r.matriculados),
      ]),
      filename: `reporte_matricula_${selectedYearId}.pdf`,
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Reportes de Matrícula — Ciclo ${selectedYearId}`}
        subtitle="Estadísticas consolidadas de matrícula general, por año de cursada, por turno y por curso."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportExcel}>
              <FileSpreadsheet size={15} /> XLSX
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download size={15} /> CSV
            </Button>
            <Button size="sm" onClick={exportPdf}>
              <FileText size={15} /> PDF Institucional
            </Button>
          </>
        }
      />

      {/* Matrícula General */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Base general', value: summary.totalStudents },
          { label: 'Matrícula activa', value: summary.activeCount },
          { label: 'Altas ciclo', value: summary.altas },
          { label: 'Bajas ciclo', value: summary.bajas },
          { label: 'Pases', value: summary.pases },
          { label: 'Egresados', value: summary.egresados },
          { label: 'Desvinculados', value: summary.desvinculados },
        ].map((item) => (
          <Card key={item.label} className="p-4">
            <p className="text-[11px] uppercase font-semibold text-ink-muted">{item.label}</p>
            <p className="text-2xl font-bold font-display mt-1">{item.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border-subtle font-bold text-sm">
            Matrícula por Año de Cursada
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-subtle text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-2.5">Año</th>
                <th className="px-4 py-2.5 text-right">Matriculados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {summary.byYear.map((r) => (
                <tr key={r.anio}>
                  <td className="px-4 py-2.5 font-medium">{r.anio}</td>
                  <td className="px-4 py-2.5 text-right font-bold">{r.matriculados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border-subtle font-bold text-sm">
            Matrícula por Turno
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-subtle text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-2.5">Turno</th>
                <th className="px-4 py-2.5 text-right">Matriculados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {summary.byShift.map((r) => (
                <tr key={r.turno}>
                  <td className="px-4 py-2.5 font-medium">{r.turno}</td>
                  <td className="px-4 py-2.5 text-right font-bold">{r.matriculados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border-subtle font-bold text-sm">
          Matrícula por Curso y División
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-subtle text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-4 py-2.5">Curso</th>
              <th className="px-4 py-2.5">Turno</th>
              <th className="px-4 py-2.5 text-right">Matriculados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {summary.byCourse.map((r) => (
              <tr key={`${r.curso}_${r.turno}`}>
                <td className="px-4 py-2.5 font-semibold">{r.curso}</td>
                <td className="px-4 py-2.5">{r.turno}</td>
                <td className="px-4 py-2.5 text-right font-bold">{r.matriculados}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};
