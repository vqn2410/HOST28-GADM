import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { listCourses, listEnrollments } from '@/repositories/academicRepository';
import { listStudents } from '@/repositories/studentRepository';
import { AttendanceTab } from '@/features/grades/components/AttendanceTab';
import { PageHeader } from '@/components/ui/Primitives';

export const PreceptorAttendancePage: React.FC = () => {
  const { user } = useAuth();
  const { selectedYearId } = useAcademicYear();
  const [selectedCourseId, setSelectedCourseId] = useState('');

  const coursesQuery = useQuery({
    queryKey: ['courses', selectedYearId],
    queryFn: () => listCourses(selectedYearId),
  });
  const studentsQuery = useQuery({ queryKey: ['students'], queryFn: listStudents });
  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', selectedYearId],
    queryFn: () => listEnrollments(selectedYearId),
  });

  const courses = useMemo(
    () => (coursesQuery.data ?? []).filter((c) => c.status === 'activo'),
    [coursesQuery.data]
  );

  useEffect(() => {
    if (!selectedCourseId && courses.length > 0) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId]);

  const rosterStudents = useMemo(() => {
    if (!selectedCourseId) return [];
    const activeDnis = new Set(
      (enrollmentsQuery.data ?? [])
        .filter((e) => e.status === 'activa' && e.courseId === selectedCourseId)
        .map((e) => e.studentDni)
    );
    return (studentsQuery.data ?? [])
      .filter((s) => activeDnis.has(s.dni))
      .sort((a, b) => a.apellido.localeCompare(b.apellido, 'es'));
  }, [enrollmentsQuery.data, studentsQuery.data, selectedCourseId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asistencia de Preceptoría (Lunes a Viernes)"
        subtitle={`Control diario, planilla mensual con integración automática de Educación Física (HOST28_EF), días no contabilizados y alertas < 75% · Ciclo ${selectedYearId}.`}
        actions={
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-brand-50 dark:bg-emerald-950/40 text-emerald-brand-700 dark:text-emerald-300 text-xs font-semibold">
            <CalendarCheck size={14} /> Preceptoría · Ciclo {selectedYearId}
          </span>
        }
      />

      <AttendanceTab
        user={user}
        isTeacherOnly={false}
        preceptoriaOnly
        academicYearId={selectedYearId}
        courses={courses}
        selectedCourseId={selectedCourseId}
        onSelectCourse={setSelectedCourseId}
        rosterStudents={rosterStudents}
      />
    </div>
  );
};
