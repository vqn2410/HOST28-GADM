import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText, Download } from 'lucide-react';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { listStudents } from '@/repositories/studentRepository';
import { listCourses, listEnrollments } from '@/repositories/academicRepository';
import {
  exportRowsToCsv,
  exportRowsToExcel,
  exportTableToPdf,
} from '@/services/exportService';
import { calculateAge, formatDateAR, formatDniDisplay } from '@/lib/utils/formatters';
import { Badge, Button, Card, EmptyState, PageHeader, Select } from '@/components/ui/Primitives';

export const RostersReportPage: React.FC = () => {
  const { selectedYearId, settings } = useAcademicYear();
  const [courseId, setCourseId] = useState('todos');
  const [shiftFilter, setShiftFilter] = useState('todos');

  const studentsQuery = useQuery({ queryKey: ['students'], queryFn: listStudents });
  const coursesQuery = useQuery({
    queryKey: ['courses', selectedYearId],
    queryFn: () => listCourses(selectedYearId),
  });
  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', selectedYearId],
    queryFn: () => listEnrollments(selectedYearId),
  });

  const roster = useMemo(() => {
    const stMap = new Map((studentsQuery.data ?? []).map((s) => [s.dni, s]));
    return (enrollmentsQuery.data ?? [])
      .filter((e) => {
        if (e.status !== 'activa') return false;
        if (courseId !== 'todos' && e.courseId !== courseId) return false;
        if (shiftFilter !== 'todos' && e.shiftName !== shiftFilter) return false;
        return true;
      })
      .map((e) => ({ enrollment: e, student: stMap.get(e.studentDni) }))
      .filter(
        (x): x is { enrollment: typeof x.enrollment; student: NonNullable<typeof x.student> } =>
          Boolean(x.student)
      )
      .sort((a, b) => {
        if (a.enrollment.yearNumber !== b.enrollment.yearNumber) {
          return a.enrollment.yearNumber - b.enrollment.yearNumber;
        }
        const divCmp = a.enrollment.division.localeCompare(b.enrollment.division, 'es');
        if (divCmp !== 0) return divCmp;
        return a.student.apellido.localeCompare(b.student.apellido, 'es');
      });
  }, [studentsQuery.data, enrollmentsQuery.data, courseId, shiftFilter]);

  const exportRows = roster.map(({ student, enrollment }, idx) => ({
    Orden: idx + 1,
    Apellido: student.apellido,
    Nombre: student.nombres,
    DNI: student.dni,
    Fecha_Nacimiento: formatDateAR(student.fechaNacimiento),
    Edad: calculateAge(student.fechaNacimiento) ?? '',
    Anio_Ingreso: student.anioIngreso,
    Anio_Cursada: `${enrollment.yearNumber}°`,
    Division: enrollment.division,
    Turno: enrollment.shiftName,
  }));

  const selectedCourseObj = (coursesQuery.data ?? []).find((c) => c.id === courseId);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Nóminas de Estudiantes — Ciclo ${selectedYearId}`}
        subtitle="Listados oficiales ordenados alfabéticamente con exportación a Excel, CSV y PDF con membrete."
        badge={<Badge variant="brand">{roster.length} estudiantes</Badge>}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportRowsToExcel(exportRows, 'Nomina', `nomina_${selectedYearId}.xlsx`)
              }
            >
              <FileSpreadsheet size={15} /> XLSX
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportRowsToCsv(exportRows, `nomina_${selectedYearId}.csv`)}
            >
              <Download size={15} /> CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportTableToPdf({
                  title: selectedCourseObj
                    ? `Nómina de Estudiantes — ${selectedCourseObj.label} (${selectedCourseObj.shiftName})`
                    : `Nómina General de Estudiantes — Ciclo ${selectedYearId}`,
                  subtitle: `Total: ${roster.length} estudiantes`,
                  academicYear: selectedYearId,
                  settings,
                  headers: [
                    'N°',
                    'Apellido y Nombre',
                    'DNI',
                    'F. Nac.',
                    'Edad',
                    'Ing.',
                    'Curso',
                    'Turno',
                  ],
                  rows: roster.map(({ student, enrollment }, idx) => [
                    String(idx + 1),
                    `${student.apellido}, ${student.nombres}`,
                    formatDniDisplay(student.dni),
                    formatDateAR(student.fechaNacimiento),
                    String(calculateAge(student.fechaNacimiento) ?? '—'),
                    String(student.anioIngreso),
                    enrollment.courseLabel,
                    enrollment.shiftName,
                  ]),
                  filename: `nomina_${selectedYearId}.pdf`,
                  landscape: true,
                })
              }
            >
              <FileText size={15} /> PDF
            </Button>
          </>
        }
      />

      <Card className="p-4 flex flex-wrap gap-3">
        <Select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="w-60 h-9 text-xs"
        >
          <option value="todos">Todos los cursos</option>
          {(coursesQuery.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} — Turno {c.shiftName}
            </option>
          ))}
        </Select>
        <Select
          value={shiftFilter}
          onChange={(e) => setShiftFilter(e.target.value)}
          className="w-48 h-9 text-xs"
        >
          <option value="todos">Todos los turnos</option>
          <option value="Mañana">Mañana</option>
          <option value="Tarde">Tarde</option>
          <option value="Vespertino">Vespertino</option>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        {roster.length === 0 ? (
          <EmptyState
            title="Nómina vacía"
            description="No hay estudiantes matriculados que coincidan con el filtro seleccionado."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-subtle text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-4 py-3">N°</th>
                  <th className="px-4 py-3">Apellido y Nombre</th>
                  <th className="px-4 py-3">DNI</th>
                  <th className="px-4 py-3">Nacimiento / Edad</th>
                  <th className="px-4 py-3">Ingreso</th>
                  <th className="px-4 py-3">Curso</th>
                  <th className="px-4 py-3">Turno</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {roster.map(({ student, enrollment }, idx) => {
                  const age = calculateAge(student.fechaNacimiento);
                  return (
                    <tr key={enrollment.id}>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-semibold">
                        {student.apellido}, {student.nombres}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {formatDniDisplay(student.dni)}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {formatDateAR(student.fechaNacimiento)}{' '}
                        {age !== null ? `(${age} años)` : ''}
                      </td>
                      <td className="px-4 py-2.5 text-xs">{student.anioIngreso}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold">
                        {enrollment.courseLabel}
                      </td>
                      <td className="px-4 py-2.5 text-xs">{enrollment.shiftName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
