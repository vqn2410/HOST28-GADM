import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpenCheck,
  ClipboardCheck,
  FileSpreadsheet,
  Flame,
  Download,
  Printer,
  Save,
  Plus,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Dumbbell,
  CalendarDays,
  BarChart3,
  CalendarCheck,
  CalendarClock,
  LayoutGrid,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { listStudents } from '@/repositories/studentRepository';
import { listCourses, listEnrollments } from '@/repositories/academicRepository';
import {
  evaluateRes1650Accreditation,
  evaluateStudentTrajectoryRes1650,
  listGrades,
  listIntensificationPlans,
  listSubjects,
  saveGradeRecord,
  saveIntensificationPlan,
  saveSubject,
} from '@/repositories/gradesRepository';
import { listTeacherAssignments } from '@/repositories/attendanceRepository';
import { logAudit } from '@/repositories/auditRepository';
import { downloadBulletinPdf, printBulletinPdf } from '@/templates/pdf/bulletinPdfGenerator';
import { exportRowsToExcel } from '@/services/exportService';
import { formatDniDisplay } from '@/lib/utils/formatters';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FieldLabel,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui/Primitives';
import { TrajectoryStatsTab } from '@/features/grades/components/TrajectoryStatsTab';
import { LandscapeGradesGrid } from '@/features/grades/components/LandscapeGradesGrid';
import { AttendanceTab } from '@/features/grades/components/AttendanceTab';
import { TeacherAssignmentsTab } from '@/features/grades/components/TeacherAssignmentsTab';
import type {
  IntensificationPeriod,
  IntensificationResult,
  PreliminaryValuation,
  StudentGradeRecord,
} from '@/types/domain';

type GradesTab =
  | 'planilla'
  | 'estadisticas'
  | 'asistencia'
  | 'boletines'
  | 'intensificacion'
  | 'docentes'
  | 'materias';

interface EditableRow {
  val1: PreliminaryValuation;
  nota1: string;
  val2: PreliminaryValuation;
  nota2: string;
  intDicEstado: IntensificationResult;
  intDicNota: string;
  intFebEstado: IntensificationResult;
  intFebNota: string;
  observaciones: string;
}

const PERIOD_LABELS: Record<IntensificationPeriod, string> = {
  diciembre: 'Diciembre',
  febrero_marzo: 'Febrero / Marzo',
  mayo: 'Mayo (Pendientes)',
  julio: 'Julio (Pendientes)',
  octubre: 'Octubre (Pendientes)',
};

function parseNullableGrade(val: string, min = 1, max = 10): number | null {
  const trimmed = val.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (Number.isNaN(n) || n < min || n > max) return null;
  return Math.round(n);
}

/**
 * Sistema de Calificaciones, Boletines RITE e Intensificación de la Enseñanza
 * basado en la Resolución N.º 1650/24 DGCyE (Provincia de Buenos Aires).
 * Se abre en una nueva pestaña desde el navbar del SGAE.
 */
export const CalificacionesAppPage: React.FC = () => {
  const { user } = useAuth();
  const { academicYears, selectedYearId, setSelectedYearId, settings } = useAcademicYear();
  const queryClient = useQueryClient();

  const isTeacherOnly = user?.roleId === 'docente';

  const [activeTab, setActiveTab] = useState<GradesTab>('planilla');
  const [planillaView, setPlanillaView] = useState<'individual' | 'apaisada'>('individual');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedStudentDni, setSelectedStudentDni] = useState('');
  const [drafts, setDrafts] = useState<Record<string, EditableRow>>({});
  const [savingAll, setSavingAll] = useState(false);

  // Modal de plan de intensificación
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planForm, setPlanForm] = useState<{
    studentDni: string;
    studentName: string;
    courseLabel: string;
    subjectId: string;
    subjectName: string;
    period: IntensificationPeriod;
    modality: 'intensificacion' | 'profundizacion' | 'recursada_edte';
    contenidosPrioritarios: string;
    result: IntensificationResult;
    calificacion: string;
    docenteResponsable: string;
    observaciones: string;
  }>({
    studentDni: '',
    studentName: '',
    courseLabel: '',
    subjectId: '',
    subjectName: '',
    period: 'diciembre',
    modality: 'intensificacion',
    contenidosPrioritarios: '',
    result: '',
    calificacion: '',
    docenteResponsable: '',
    observaciones: '',
  });
  const [savingPlan, setSavingPlan] = useState(false);

  // Modal nueva materia
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [newSubject, setNewSubject] = useState({ yearNumber: 1, name: '', area: '' });
  const [savingSubject, setSavingSubject] = useState(false);

  const studentsQuery = useQuery({ queryKey: ['students'], queryFn: listStudents });
  const coursesQuery = useQuery({
    queryKey: ['courses', selectedYearId],
    queryFn: () => listCourses(selectedYearId),
  });
  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', selectedYearId],
    queryFn: () => listEnrollments(selectedYearId),
  });
  const subjectsQuery = useQuery({ queryKey: ['subjects'], queryFn: () => listSubjects() });
  const gradesQuery = useQuery({
    queryKey: ['grades', selectedYearId],
    queryFn: () => listGrades({ academicYearId: selectedYearId }),
  });
  const plansQuery = useQuery({
    queryKey: ['intensification-plans', selectedYearId],
    queryFn: () => listIntensificationPlans(selectedYearId),
  });
  const assignmentsQuery = useQuery({
    queryKey: ['teacher-assignments', selectedYearId],
    queryFn: () => listTeacherAssignments(selectedYearId),
  });

  const allAssignments = assignmentsQuery.data ?? [];
  const myAssignments = useMemo(
    () => (isTeacherOnly && user ? allAssignments.filter((a) => a.teacherDni === user.dni) : allAssignments),
    [allAssignments, isTeacherOnly, user]
  );

  // Docentes ven únicamente sus cursos y materias asignadas
  const allCourses = coursesQuery.data ?? [];
  const courses = useMemo(() => {
    if (!isTeacherOnly) return allCourses;
    const allowedCourseIds = new Set(myAssignments.map((a) => a.courseId));
    return allCourses.filter((c) => allowedCourseIds.has(c.id));
  }, [allCourses, isTeacherOnly, myAssignments]);

  const effectiveCourseId =
    courses.some((c) => c.id === selectedCourseId)
      ? selectedCourseId
      : courses[0]?.id || '';
  const currentCourse = courses.find((c) => c.id === effectiveCourseId) ?? null;

  const courseSubjects = useMemo(() => {
    if (!currentCourse) return [];
    const base = (subjectsQuery.data ?? []).filter(
      (s) => s.active && s.yearNumber === currentCourse.yearNumber
    );
    if (!isTeacherOnly) return base;
    const allowedSubjIds = new Set(
      myAssignments.filter((a) => a.courseId === currentCourse.id).map((a) => a.subjectId)
    );
    return base.filter((s) => allowedSubjIds.has(s.id));
  }, [subjectsQuery.data, currentCourse, isTeacherOnly, myAssignments]);

  const effectiveSubjectId =
    courseSubjects.some((s) => s.id === selectedSubjectId)
      ? selectedSubjectId
      : courseSubjects[0]?.id || '';
  const currentSubject = courseSubjects.find((s) => s.id === effectiveSubjectId) ?? null;

  const studentsByDni = useMemo(
    () => new Map((studentsQuery.data ?? []).map((s) => [s.dni, s])),
    [studentsQuery.data]
  );

  const courseRoster = useMemo(() => {
    if (!effectiveCourseId) return [];
    return (enrollmentsQuery.data ?? [])
      .filter((e) => e.status === 'activa' && e.courseId === effectiveCourseId)
      .map((e) => ({ enrollment: e, student: studentsByDni.get(e.studentDni) }))
      .filter(
        (x): x is { enrollment: typeof x.enrollment; student: NonNullable<typeof x.student> } =>
          Boolean(x.student)
      )
      .sort((a, b) => a.student.apellido.localeCompare(b.student.apellido, 'es'));
  }, [enrollmentsQuery.data, effectiveCourseId, studentsByDni]);

  const gradesMap = useMemo(() => {
    const map = new Map<string, StudentGradeRecord>();
    (gradesQuery.data ?? []).forEach((g) => map.set(`${g.studentDni}_${g.subjectId}`, g));
    return map;
  }, [gradesQuery.data]);

  const getRowValues = (studentDni: string, subjectId: string): EditableRow => {
    const key = `${studentDni}_${subjectId}`;
    if (drafts[key]) return drafts[key];
    const existing = gradesMap.get(key);
    return {
      val1: existing?.val1 ?? '',
      nota1: existing?.nota1 !== null && existing?.nota1 !== undefined ? String(existing.nota1) : '',
      val2: existing?.val2 ?? '',
      nota2: existing?.nota2 !== null && existing?.nota2 !== undefined ? String(existing.nota2) : '',
      intDicEstado: existing?.intDicEstado ?? '',
      intDicNota:
        existing?.intDicNota !== null && existing?.intDicNota !== undefined
          ? String(existing.intDicNota)
          : '',
      intFebEstado: existing?.intFebEstado ?? '',
      intFebNota:
        existing?.intFebNota !== null && existing?.intFebNota !== undefined
          ? String(existing.intFebNota)
          : '',
      observaciones: existing?.observaciones ?? '',
    };
  };

  const updateDraft = (studentDni: string, subjectId: string, patch: Partial<EditableRow>) => {
    const key = `${studentDni}_${subjectId}`;
    const current = getRowValues(studentDni, subjectId);
    setDrafts((prev) => ({ ...prev, [key]: { ...current, ...patch } }));
  };

  const handleSaveCourseSubjectGrades = async () => {
    if (!currentCourse || !currentSubject) return;
    setSavingAll(true);
    try {
      const updatedBy = user ? `${user.apellido}, ${user.nombre}` : 'Docente/Preceptoría';
      for (const { student } of courseRoster) {
        const key = `${student.dni}_${currentSubject.id}`;
        if (!drafts[key]) continue;
        const row = drafts[key];
        await saveGradeRecord({
          academicYearId: selectedYearId,
          studentDni: student.dni,
          courseId: currentCourse.id,
          subjectId: currentSubject.id,
          subjectName: currentSubject.name,
          val1: row.val1,
          nota1: parseNullableGrade(row.nota1, 1, 10),
          val2: row.val2,
          nota2: parseNullableGrade(row.nota2, 1, 10),
          intDicEstado: row.intDicEstado,
          intDicNota: parseNullableGrade(row.intDicNota, 1, 10),
          intFebEstado: row.intFebEstado,
          intFebNota: parseNullableGrade(row.intFebNota, 1, 10),
          observaciones: row.observaciones,
          updatedBy,
        });
      }
      if (user) {
        await logAudit({
          userDni: user.dni,
          userName: `${user.apellido}, ${user.nombre}`,
          userRole: user.roleId,
          operation: 'grade_update',
          entity: 'sgae_grades',
          entityId: `${selectedYearId}_${currentCourse.id}_${currentSubject.id}`,
          newSummary: { course: currentCourse.label, subject: currentSubject.name },
        });
      }
      setDrafts({});
      await queryClient.invalidateQueries({ queryKey: ['grades', selectedYearId] });
      toast.success(`Calificaciones de ${currentSubject.name} (${currentCourse.label}) guardadas.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar calificaciones.');
    } finally {
      setSavingAll(false);
    }
  };

  const handleExportPlanillaExcel = () => {
    if (!currentCourse || !currentSubject) return;
    const rows = courseRoster.map(({ student }) => {
      const row = getRowValues(student.dni, currentSubject.id);
      const evalRes = evaluateRes1650Accreditation({
        nota1: parseNullableGrade(row.nota1),
        nota2: parseNullableGrade(row.nota2),
        intDicEstado: row.intDicEstado,
        intDicNota: parseNullableGrade(row.intDicNota),
        intFebEstado: row.intFebEstado,
        intFebNota: parseNullableGrade(row.intFebNota),
      });
      return {
        Estudiante: `${student.apellido}, ${student.nombres}`,
        DNI: student.dni,
        Curso: currentCourse.label,
        Materia: currentSubject.name,
        Val_1C: row.val1,
        Nota_1C: row.nota1,
        Val_2C: row.val2,
        Nota_2C: row.nota2,
        Int_Dic: row.intDicEstado,
        Nota_Dic: row.intDicNota,
        Int_Feb: row.intFebEstado,
        Nota_Feb: row.intFebNota,
        Nota_Final: evalRes.notaFinal ?? '',
        Condicion_Res1650: evalRes.estadoAcreditacion,
      };
    });
    exportRowsToExcel(
      rows,
      'Planilla_1650',
      `planilla_${currentCourse.legacyCode}_${currentSubject.name}_${selectedYearId}.xlsx`
    );
  };

  // Boletín seleccionado
  const activeBulletinItem = useMemo(() => {
    if (courseRoster.length === 0) return null;
    return (
      courseRoster.find((x) => x.student.dni === selectedStudentDni) ?? courseRoster[0]
    );
  }, [courseRoster, selectedStudentDni]);

  const bulletinGrades = useMemo(() => {
    if (!activeBulletinItem) return [];
    return (gradesQuery.data ?? []).filter(
      (g) => g.studentDni === activeBulletinItem.student.dni
    );
  }, [gradesQuery.data, activeBulletinItem]);

  const bulletinTrajectory = useMemo(
    () => evaluateStudentTrajectoryRes1650(bulletinGrades),
    [bulletinGrades]
  );

  // Alumnos con materias en intensificación o pendientes (Res. 1650/24)
  const intensificationItems = useMemo(() => {
    const enrollByDni = new Map(
      (enrollmentsQuery.data ?? [])
        .filter((e) => e.status === 'activa')
        .map((e) => [e.studentDni, e])
    );
    return (gradesQuery.data ?? [])
      .filter(
        (g) => g.estadoAcreditacion === 'intensificacion' || g.estadoAcreditacion === 'pendiente'
      )
      .map((g) => ({
        grade: g,
        student: studentsByDni.get(g.studentDni),
        enrollment: enrollByDni.get(g.studentDni),
      }))
      .filter((x) => Boolean(x.student));
  }, [gradesQuery.data, enrollmentsQuery.data, studentsByDni]);

  const openPlanModalForGrade = (item: {
    grade: StudentGradeRecord;
    student?: { apellido: string; nombres: string };
    enrollment?: { courseLabel: string };
  }) => {
    setPlanForm({
      studentDni: item.grade.studentDni,
      studentName: item.student
        ? `${item.student.apellido}, ${item.student.nombres}`
        : item.grade.studentDni,
      courseLabel: item.enrollment?.courseLabel || '—',
      subjectId: item.grade.subjectId,
      subjectName: item.grade.subjectName,
      period: 'diciembre',
      modality: 'intensificacion',
      contenidosPrioritarios: '',
      result: item.grade.intDicEstado || '',
      calificacion: item.grade.intDicNota ? String(item.grade.intDicNota) : '',
      docenteResponsable: '',
      observaciones: '',
    });
    setPlanModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPlan(true);
    try {
      const updatedBy = user ? `${user.apellido}, ${user.nombre}` : 'Preceptoría/Conducción';
      const notaNum = parseNullableGrade(planForm.calificacion, 4, 10);
      await saveIntensificationPlan({
        academicYearId: selectedYearId,
        studentDni: planForm.studentDni,
        studentName: planForm.studentName,
        courseLabel: planForm.courseLabel,
        subjectId: planForm.subjectId,
        subjectName: planForm.subjectName,
        period: planForm.period,
        modality: planForm.modality,
        contenidosPrioritarios: planForm.contenidosPrioritarios,
        result: planForm.result,
        calificacion: notaNum,
        docenteResponsable: planForm.docenteResponsable,
        observaciones: planForm.observaciones,
        updatedBy,
      });

      // Si se cargó resultado de Diciembre o Febrero-Marzo, sincronizar automáticamente en la planilla de calificaciones
      const existingGrade = gradesMap.get(`${planForm.studentDni}_${planForm.subjectId}`);
      if (existingGrade && (planForm.period === 'diciembre' || planForm.period === 'febrero_marzo')) {
        await saveGradeRecord({
          academicYearId: existingGrade.academicYearId,
          studentDni: existingGrade.studentDni,
          courseId: existingGrade.courseId,
          subjectId: existingGrade.subjectId,
          subjectName: existingGrade.subjectName,
          val1: existingGrade.val1,
          nota1: existingGrade.nota1,
          val2: existingGrade.val2,
          nota2: existingGrade.nota2,
          intDicEstado:
            planForm.period === 'diciembre' ? planForm.result : existingGrade.intDicEstado,
          intDicNota:
            planForm.period === 'diciembre' ? notaNum : existingGrade.intDicNota,
          intFebEstado:
            planForm.period === 'febrero_marzo' ? planForm.result : existingGrade.intFebEstado,
          intFebNota:
            planForm.period === 'febrero_marzo' ? notaNum : existingGrade.intFebNota,
          observaciones: existingGrade.observaciones,
          updatedBy,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ['intensification-plans', selectedYearId] });
      await queryClient.invalidateQueries({ queryKey: ['grades', selectedYearId] });
      toast.success('Registro de intensificación guardado.');
      setPlanModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar intensificación.');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleSaveNewSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSubject(true);
    try {
      await saveSubject({
        yearNumber: newSubject.yearNumber,
        name: newSubject.name,
        area: newSubject.area || 'General',
        active: true,
      });
      await queryClient.invalidateQueries({ queryKey: ['subjects'] });
      toast.success(`Materia "${newSubject.name}" agregada a ${newSubject.yearNumber}° año.`);
      setNewSubject({ yearNumber: 1, name: '', area: '' });
      setSubjectModalOpen(false);
    } finally {
      setSavingSubject(false);
    }
  };

  const pendingChangesCount = Object.keys(drafts).length;

  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col">
      {/* Encabezado dedicado del Módulo Calificaciones Res. 1650/24 */}
      <header className="institutional-banner text-white py-5 px-4 sm:px-6 shadow-md">
        <div className="max-w-7xl mx-auto relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-white p-1.5 shadow-md shrink-0">
              <img
                src={settings.logoUrl || '/logo.png'}
                alt="Logo E.E.S. N° 28"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-blue-200 font-semibold">
                E.E.S. N° {settings.schoolNumber} "Gustavo Cerati" · Resolución N.º 1650/24 PBA
              </p>
              <h1 className="text-lg sm:text-2xl font-extrabold font-display tracking-tight">
                Calificaciones, Boletines RITE e Intensificación
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Selector de Ciclo Lectivo */}
            <div className="flex items-center gap-1.5 bg-white/15 border border-white/20 rounded-xl px-2.5 py-1.5">
              <CalendarDays size={14} />
              <select
                value={selectedYearId}
                onChange={(e) => setSelectedYearId(e.target.value)}
                className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
              >
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id} className="text-slate-900">
                    Ciclo {y.year}
                  </option>
                ))}
              </select>
            </div>

            <a
              href="https://host-28-ef.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-brand-500/90 hover:bg-emerald-brand-600 text-xs font-semibold text-white transition-colors"
            >
              <Dumbbell size={14} /> Educación Física <ExternalLink size={12} />
            </a>

            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold text-white transition-colors"
            >
              <ArrowLeft size={14} /> Volver al SGAE
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Pestañas internas */}
        <div className="flex flex-wrap gap-2 border-b border-border-subtle pb-3 no-print">
          {[
            { id: 'planilla', label: 'Planilla de Calificaciones', icon: <ClipboardCheck size={15} />, show: true },
            { id: 'asistencia', label: 'Asistencia (Materia / Preceptoría / EF)', icon: <CalendarCheck size={15} />, show: true },
            { id: 'estadisticas', label: 'Estadísticas y Porcentajes', icon: <BarChart3 size={15} />, show: true },
            { id: 'boletines', label: 'Boletines RITE (PDF)', icon: <BookOpenCheck size={15} />, show: !isTeacherOnly },
            {
              id: 'intensificacion',
              label: `Intensificación (${intensificationItems.length})`,
              icon: <Flame size={15} />,
              show: true,
            },
            { id: 'docentes', label: 'Asignación Docente', icon: <CalendarClock size={15} />, show: !isTeacherOnly },
            { id: 'materias', label: 'Materias PBA', icon: <Plus size={15} />, show: !isTeacherOnly },
          ]
            .filter((t) => t.show)
            .map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as GradesTab)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-brand-500 text-white shadow-xs'
                    : 'bg-surface-card border border-border-subtle text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
        </div>

        {isTeacherOnly && courses.length === 0 && (
          <Card className="p-8">
            <EmptyState
              title="Sin materias ni cursos asignados todavía"
              description="Solicitá a Dirección o Preceptoría que te asigne tus cursos, materias y horarios en la pestaña Asignación Docente."
            />
          </Card>
        )}

        {/* ═══════════════ TAB 1: PLANILLA DE CALIFICACIONES ═══════════════ */}
        {activeTab === 'planilla' && (
          <div className="space-y-5">
            {!isTeacherOnly && (
              <div className="inline-flex p-1 rounded-xl bg-surface-subtle border border-border-subtle gap-1 no-print">
                <button
                  type="button"
                  onClick={() => setPlanillaView('individual')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    planillaView === 'individual'
                      ? 'bg-brand-500 text-white'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  <ClipboardCheck size={14} /> Por materia individual
                </button>
                <button
                  type="button"
                  onClick={() => setPlanillaView('apaisada')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    planillaView === 'apaisada'
                      ? 'bg-brand-500 text-white'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  <LayoutGrid size={14} /> Planilla apaisada (Todas las materias)
                </button>
              </div>
            )}

            {planillaView === 'apaisada' && !isTeacherOnly && currentCourse ? (
              <div className="space-y-4">
                <Card className="p-4 w-full sm:w-80 no-print">
                  <FieldLabel>Curso</FieldLabel>
                  <Select
                    value={effectiveCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} — Turno {c.shiftName}
                      </option>
                    ))}
                  </Select>
                </Card>
                <LandscapeGradesGrid
                  course={currentCourse}
                  rosterStudents={courseRoster.map((r) => r.student)}
                  subjects={courseSubjects}
                  grades={gradesQuery.data ?? []}
                  academicYearId={selectedYearId}
                />
              </div>
            ) : (
              <>
            <Card className="p-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                <div>
                  <FieldLabel>Curso y División</FieldLabel>
                  <Select
                    value={effectiveCourseId}
                    onChange={(e) => {
                      setSelectedCourseId(e.target.value);
                      setDrafts({});
                    }}
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} — Turno {c.shiftName}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Materia ({currentCourse?.yearNumber ?? 1}° año)</FieldLabel>
                  <Select
                    value={effectiveSubjectId}
                    onChange={(e) => {
                      setSelectedSubjectId(e.target.value);
                      setDrafts({});
                    }}
                  >
                    {courseSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.area})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleExportPlanillaExcel}>
                  <FileSpreadsheet size={14} /> Exportar Excel
                </Button>
                <Button
                  size="sm"
                  variant="emerald"
                  loading={savingAll}
                  disabled={pendingChangesCount === 0}
                  onClick={handleSaveCourseSubjectGrades}
                >
                  <Save size={14} /> Guardar cambios ({pendingChangesCount})
                </Button>
              </div>
            </Card>

            {/* Referencia normativa Res. 1650/24 */}
            <div className="p-3.5 rounded-xl bg-brand-50/70 dark:bg-brand-900/25 border border-brand-200 dark:border-brand-800 text-xs text-ink-secondary flex flex-wrap gap-x-6 gap-y-1">
              <span>
                <strong>Valoración Preliminar:</strong> TEA (Avanzada) · TEP (En Proceso) · TED (Discontinua)
              </span>
              <span>
                <strong>Acreditación Cuatrimestral:</strong> 7 a 10 en ambos cuatrimestres
              </span>
              <span>
                <strong>Intensificación:</strong> AA (Aprobó y Acreditó ≥4) · CCA (Con Avances) · CSA (Sin Avances)
              </span>
            </div>

            <Card className="overflow-hidden">
              {courseRoster.length === 0 ? (
                <EmptyState
                  title="Sin estudiantes matriculados en este curso"
                  description="Seleccioná otro curso o verificá la matrícula del ciclo lectivo."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-surface-subtle text-ink-muted uppercase">
                      <tr>
                        <th className="px-3 py-3 min-w-[180px]">Estudiante</th>
                        <th className="px-2 py-3 text-center">1° Val.</th>
                        <th className="px-2 py-3 text-center">1° Cuat.</th>
                        <th className="px-2 py-3 text-center">2° Val.</th>
                        <th className="px-2 py-3 text-center">2° Cuat.</th>
                        <th className="px-2 py-3 text-center">Int. Dic.</th>
                        <th className="px-2 py-3 text-center">Int. Feb.</th>
                        <th className="px-2 py-3 text-center">Final</th>
                        <th className="px-3 py-3">Condición 1650/24</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {courseRoster.map(({ student }) => {
                        const row = getRowValues(student.dni, effectiveSubjectId);
                        const evalRes = evaluateRes1650Accreditation({
                          nota1: parseNullableGrade(row.nota1),
                          nota2: parseNullableGrade(row.nota2),
                          intDicEstado: row.intDicEstado,
                          intDicNota: parseNullableGrade(row.intDicNota),
                          intFebEstado: row.intFebEstado,
                          intFebNota: parseNullableGrade(row.intFebNota),
                        });
                        return (
                          <tr key={student.dni} className="hover:bg-surface-subtle/40">
                            <td className="px-3 py-2.5">
                              <span className="font-semibold text-ink-primary block">
                                {student.apellido}, {student.nombres}
                              </span>
                              <span className="text-[11px] font-mono text-ink-muted">
                                DNI {formatDniDisplay(student.dni)}
                              </span>
                            </td>
                            <td className="px-1.5 py-2">
                              <select
                                value={row.val1}
                                onChange={(e) =>
                                  updateDraft(student.dni, effectiveSubjectId, {
                                    val1: e.target.value as PreliminaryValuation,
                                  })
                                }
                                className="h-8 px-1.5 rounded-lg border border-border-strong bg-surface-card text-xs"
                              >
                                <option value="">—</option>
                                <option value="TEA">TEA</option>
                                <option value="TEP">TEP</option>
                                <option value="TED">TED</option>
                              </select>
                            </td>
                            <td className="px-1.5 py-2 text-center">
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={row.nota1}
                                onChange={(e) =>
                                  updateDraft(student.dni, effectiveSubjectId, {
                                    nota1: e.target.value,
                                  })
                                }
                                placeholder="1-10"
                                className="w-14 h-8 text-center rounded-lg border border-border-strong bg-surface-card text-xs font-mono font-semibold"
                              />
                            </td>
                            <td className="px-1.5 py-2">
                              <select
                                value={row.val2}
                                onChange={(e) =>
                                  updateDraft(student.dni, effectiveSubjectId, {
                                    val2: e.target.value as PreliminaryValuation,
                                  })
                                }
                                className="h-8 px-1.5 rounded-lg border border-border-strong bg-surface-card text-xs"
                              >
                                <option value="">—</option>
                                <option value="TEA">TEA</option>
                                <option value="TEP">TEP</option>
                                <option value="TED">TED</option>
                              </select>
                            </td>
                            <td className="px-1.5 py-2 text-center">
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={row.nota2}
                                onChange={(e) =>
                                  updateDraft(student.dni, effectiveSubjectId, {
                                    nota2: e.target.value,
                                  })
                                }
                                placeholder="1-10"
                                className="w-14 h-8 text-center rounded-lg border border-border-strong bg-surface-card text-xs font-mono font-semibold"
                              />
                            </td>
                            <td className="px-1.5 py-2">
                              <div className="flex items-center justify-center gap-1">
                                <select
                                  value={row.intDicEstado}
                                  onChange={(e) =>
                                    updateDraft(student.dni, effectiveSubjectId, {
                                      intDicEstado: e.target.value as IntensificationResult,
                                    })
                                  }
                                  className="h-8 px-1 rounded-lg border border-border-strong bg-surface-card text-[11px]"
                                >
                                  <option value="">—</option>
                                  <option value="AA">AA</option>
                                  <option value="CCA">CCA</option>
                                  <option value="CSA">CSA</option>
                                </select>
                                <input
                                  type="number"
                                  min={4}
                                  max={10}
                                  value={row.intDicNota}
                                  onChange={(e) =>
                                    updateDraft(student.dni, effectiveSubjectId, {
                                      intDicNota: e.target.value,
                                    })
                                  }
                                  placeholder="≥4"
                                  className="w-11 h-8 text-center rounded-lg border border-border-strong bg-surface-card text-xs font-mono"
                                />
                              </div>
                            </td>
                            <td className="px-1.5 py-2">
                              <div className="flex items-center justify-center gap-1">
                                <select
                                  value={row.intFebEstado}
                                  onChange={(e) =>
                                    updateDraft(student.dni, effectiveSubjectId, {
                                      intFebEstado: e.target.value as IntensificationResult,
                                    })
                                  }
                                  className="h-8 px-1 rounded-lg border border-border-strong bg-surface-card text-[11px]"
                                >
                                  <option value="">—</option>
                                  <option value="AA">AA</option>
                                  <option value="CCA">CCA</option>
                                  <option value="CSA">CSA</option>
                                </select>
                                <input
                                  type="number"
                                  min={4}
                                  max={10}
                                  value={row.intFebNota}
                                  onChange={(e) =>
                                    updateDraft(student.dni, effectiveSubjectId, {
                                      intFebNota: e.target.value,
                                    })
                                  }
                                  placeholder="≥4"
                                  className="w-11 h-8 text-center rounded-lg border border-border-strong bg-surface-card text-xs font-mono"
                                />
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center font-mono font-bold text-sm">
                              {evalRes.notaFinal ?? '—'}
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                variant={
                                  evalRes.estadoAcreditacion === 'acreditada'
                                    ? 'success'
                                    : evalRes.estadoAcreditacion === 'intensificacion'
                                      ? 'warning'
                                      : evalRes.estadoAcreditacion === 'pendiente'
                                        ? 'danger'
                                        : 'neutral'
                                }
                              >
                                {evalRes.estadoAcreditacion === 'acreditada'
                                  ? 'Acreditada'
                                  : evalRes.estadoAcreditacion === 'intensificacion'
                                    ? 'Intensifica'
                                    : evalRes.estadoAcreditacion === 'pendiente'
                                      ? 'Pendiente'
                                      : 'En curso'}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
              </>
            )}
          </div>
        )}

        {/* ═══════════════ TAB: ASISTENCIA (DOCENTES / PRECEPTORÍA / EF) ═══════════════ */}
        {activeTab === 'asistencia' && (
          <AttendanceTab
            user={user}
            isTeacherOnly={isTeacherOnly}
            academicYearId={selectedYearId}
            courses={courses}
            selectedCourseId={effectiveCourseId}
            onSelectCourse={setSelectedCourseId}
            courseSubjects={courseSubjects}
            selectedSubjectId={effectiveSubjectId}
            onSelectSubject={setSelectedSubjectId}
            rosterStudents={courseRoster.map((r) => r.student)}
            assignments={myAssignments}
          />
        )}

        {/* ═══════════════ TAB: ESTADÍSTICAS Y PORCENTAJES ═══════════════ */}
        {activeTab === 'estadisticas' && (
          <TrajectoryStatsTab
            courses={courses}
            selectedCourseId={effectiveCourseId}
            onSelectCourse={setSelectedCourseId}
            rosterStudents={courseRoster.map((r) => r.student)}
            courseSubjects={courseSubjects}
            allGrades={gradesQuery.data ?? []}
            academicYearId={selectedYearId}
          />
        )}

        {/* ═══════════════ TAB: ASIGNACIÓN DOCENTE ═══════════════ */}
        {activeTab === 'docentes' && !isTeacherOnly && (
          <TeacherAssignmentsTab
            academicYearId={selectedYearId}
            courses={allCourses}
            subjects={subjectsQuery.data ?? []}
            assignments={allAssignments}
          />
        )}

        {/* ═══════════════ TAB 2: BOLETINES RITE (PDF) ═══════════════ */}
        {activeTab === 'boletines' && (
          <div className="space-y-5">
            <Card className="p-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                <div>
                  <FieldLabel>Curso</FieldLabel>
                  <Select
                    value={effectiveCourseId}
                    onChange={(e) => {
                      setSelectedCourseId(e.target.value);
                      setSelectedStudentDni('');
                    }}
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} — Turno {c.shiftName}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Estudiante</FieldLabel>
                  <Select
                    value={activeBulletinItem?.student.dni || ''}
                    onChange={(e) => setSelectedStudentDni(e.target.value)}
                  >
                    {courseRoster.map(({ student }) => (
                      <option key={student.dni} value={student.dni}>
                        {student.apellido}, {student.nombres} (DNI {formatDniDisplay(student.dni)})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {activeBulletinItem && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void printBulletinPdf({
                        student: activeBulletinItem.student,
                        enrollment: activeBulletinItem.enrollment,
                        subjects: courseSubjects,
                        grades: bulletinGrades,
                        settings,
                      })
                    }
                  >
                    <Printer size={14} /> Imprimir Boletín
                  </Button>
                  <Button
                    variant="emerald"
                    size="sm"
                    onClick={() =>
                      void downloadBulletinPdf({
                        student: activeBulletinItem.student,
                        enrollment: activeBulletinItem.enrollment,
                        subjects: courseSubjects,
                        grades: bulletinGrades,
                        settings,
                      })
                    }
                  >
                    <Download size={14} /> Descargar Boletín RITE (PDF)
                  </Button>
                </div>
              )}
            </Card>

            {activeBulletinItem ? (
              <Card className="p-5 sm:p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border-subtle">
                  <div>
                    <h2 className="text-lg font-bold font-display text-ink-primary">
                      {activeBulletinItem.student.apellido}, {activeBulletinItem.student.nombres}
                    </h2>
                    <p className="text-xs text-ink-muted">
                      DNI {formatDniDisplay(activeBulletinItem.student.dni)} ·{' '}
                      {activeBulletinItem.enrollment.courseLabel} · Turno{' '}
                      {activeBulletinItem.enrollment.shiftName} · Ciclo {selectedYearId}
                    </p>
                  </div>
                  <Badge
                    variant={
                      bulletinTrajectory.requiresEDTE
                        ? 'danger'
                        : bulletinTrajectory.totalPendientesOIntensif > 0
                          ? 'warning'
                          : 'success'
                    }
                  >
                    {bulletinTrajectory.requiresEDTE ? (
                      <AlertTriangle size={12} />
                    ) : (
                      <CheckCircle2 size={12} />
                    )}
                    {bulletinTrajectory.label}
                  </Badge>
                </div>

                {/* Tarjetas verticales en mobile, tabla en desktop */}
                <div className="md:hidden divide-y divide-border-subtle">
                  {courseSubjects.map((subj) => {
                    const g = bulletinGrades.find((x) => x.subjectId === subj.id);
                    return (
                      <div key={subj.id} className="py-3 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-ink-primary">{subj.name}</span>
                          <Badge
                            variant={
                              g?.estadoAcreditacion === 'acreditada'
                                ? 'success'
                                : g?.estadoAcreditacion === 'intensificacion'
                                  ? 'warning'
                                  : g?.estadoAcreditacion === 'pendiente'
                                    ? 'danger'
                                    : 'neutral'
                            }
                          >
                            {g?.estadoAcreditacion || 'en curso'}
                          </Badge>
                        </div>
                        <p className="text-ink-secondary">
                          1° Cuat: <strong>{g?.val1 || '—'}</strong> ({g?.nota1 ?? '—'}) · 2° Cuat:{' '}
                          <strong>{g?.val2 || '—'}</strong> ({g?.nota2 ?? '—'}) · Final:{' '}
                          <strong>{g?.notaFinal ?? '—'}</strong>
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-subtle text-ink-muted uppercase">
                      <tr>
                        <th className="px-3 py-2.5">Materia</th>
                        <th className="px-2 py-2.5 text-center">1° Val.</th>
                        <th className="px-2 py-2.5 text-center">1° Cuat.</th>
                        <th className="px-2 py-2.5 text-center">2° Val.</th>
                        <th className="px-2 py-2.5 text-center">2° Cuat.</th>
                        <th className="px-2 py-2.5 text-center">Int. Dic.</th>
                        <th className="px-2 py-2.5 text-center">Int. Feb.</th>
                        <th className="px-2 py-2.5 text-center">Final</th>
                        <th className="px-3 py-2.5">Condición</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {courseSubjects.map((subj) => {
                        const g = bulletinGrades.find((x) => x.subjectId === subj.id);
                        return (
                          <tr key={subj.id}>
                            <td className="px-3 py-2.5 font-semibold">{subj.name}</td>
                            <td className="px-2 py-2.5 text-center">{g?.val1 || '—'}</td>
                            <td className="px-2 py-2.5 text-center font-mono">
                              {g?.nota1 ?? '—'}
                            </td>
                            <td className="px-2 py-2.5 text-center">{g?.val2 || '—'}</td>
                            <td className="px-2 py-2.5 text-center font-mono">
                              {g?.nota2 ?? '—'}
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              {g?.intDicEstado
                                ? `${g.intDicEstado}${g.intDicNota ? ` (${g.intDicNota})` : ''}`
                                : '—'}
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              {g?.intFebEstado
                                ? `${g.intFebEstado}${g.intFebNota ? ` (${g.intFebNota})` : ''}`
                                : '—'}
                            </td>
                            <td className="px-2 py-2.5 text-center font-mono font-bold">
                              {g?.notaFinal ?? '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              <Badge
                                variant={
                                  g?.estadoAcreditacion === 'acreditada'
                                    ? 'success'
                                    : g?.estadoAcreditacion === 'intensificacion'
                                      ? 'warning'
                                      : g?.estadoAcreditacion === 'pendiente'
                                        ? 'danger'
                                        : 'neutral'
                                }
                              >
                                {g?.estadoAcreditacion === 'acreditada'
                                  ? 'Acreditada'
                                  : g?.estadoAcreditacion === 'intensificacion'
                                    ? 'Intensifica'
                                    : g?.estadoAcreditacion === 'pendiente'
                                      ? 'Pendiente'
                                      : 'En curso'}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <Card className="p-8">
                <EmptyState
                  title="Sin estudiantes en el curso seleccionado"
                  description="Elegí un curso con matrícula activa para emitir boletines RITE."
                />
              </Card>
            )}
          </div>
        )}

        {/* ═══════════════ TAB 3: INTENSIFICACIÓN DE LA ENSEÑANZA ═══════════════ */}
        {activeTab === 'intensificacion' && (
          <div className="space-y-6">
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-border-subtle flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-sm flex items-center gap-2">
                    <Flame size={16} className="text-amber-500" />
                    Estudiantes en Intensificación / Pendientes de Acreditación (Res. 1650/24)
                  </h2>
                  <p className="text-xs text-ink-muted">
                    Detección automática de materias con calificación menor a 7 en alguno de los cuatrimestres.
                  </p>
                </div>
                <Badge variant="warning">{intensificationItems.length} materias a intensificar</Badge>
              </div>

              {intensificationItems.length === 0 ? (
                <EmptyState
                  title="Sin materias en intensificación registradas"
                  description="Cuando cargues calificaciones menores a 7 en la Planilla de Calificaciones, aparecerán automáticamente aquí para su seguimiento."
                />
              ) : (
                <div className="divide-y divide-border-subtle">
                  {intensificationItems.map((item) => (
                    <div
                      key={item.grade.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="font-bold text-sm text-ink-primary">
                          {item.student?.apellido}, {item.student?.nombres}{' '}
                          <span className="font-mono font-normal text-xs text-ink-muted">
                            (DNI {formatDniDisplay(item.grade.studentDni)})
                          </span>
                        </p>
                        <p className="text-ink-secondary mt-0.5">
                          <strong>{item.grade.subjectName}</strong> ·{' '}
                          {item.enrollment?.courseLabel || '—'} · 1° Cuat: {item.grade.nota1 ?? '—'} ·
                          2° Cuat: {item.grade.nota2 ?? '—'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => openPlanModalForGrade(item)}
                      >
                        Registrar instancia de intensificación
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Planes de intensificación registrados */}
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-border-subtle font-bold text-sm">
                Seguimiento de Instancias de Intensificación Registradas ({plansQuery.data?.length ?? 0})
              </div>
              {(plansQuery.data ?? []).length === 0 ? (
                <p className="p-6 text-xs text-ink-muted text-center">
                  Todavía no hay instancias de intensificación cargadas en el ciclo {selectedYearId}.
                </p>
              ) : (
                <div className="divide-y divide-border-subtle">
                  {(plansQuery.data ?? []).map((p) => (
                    <div
                      key={p.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-bold text-ink-primary">
                          {p.studentName} — {p.subjectName} ({p.courseLabel})
                        </p>
                        <p className="text-ink-secondary">
                          Período: <strong>{PERIOD_LABELS[p.period]}</strong> · Modalidad:{' '}
                          {p.modality.replace(/_/g, ' ')}
                          {p.docenteResponsable ? ` · Docente: ${p.docenteResponsable}` : ''}
                        </p>
                        {p.contenidosPrioritarios && (
                          <p className="text-ink-muted mt-0.5">
                            Contenidos: {p.contenidosPrioritarios}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={
                          p.result === 'AA'
                            ? 'success'
                            : p.result === 'CCA'
                              ? 'warning'
                              : p.result === 'CSA'
                                ? 'danger'
                                : 'neutral'
                        }
                      >
                        {p.result || 'En seguimiento'}
                        {p.calificacion ? ` (${p.calificacion})` : ''}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ═══════════════ TAB 4: MATERIAS POR AÑO ═══════════════ */}
        {activeTab === 'materias' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink-secondary">
                Diseño curricular de Secundaria PBA precargado (1° a 6° año). Podés agregar materias
                específicas de la orientación.
              </p>
              <Button size="sm" onClick={() => setSubjectModalOpen(true)}>
                <Plus size={14} /> Agregar materia
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((yr) => {
                const list = (subjectsQuery.data ?? []).filter((s) => s.yearNumber === yr);
                return (
                  <Card key={yr} className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                      <h3 className="font-bold font-display text-base">{yr}° Año</h3>
                      <Badge variant="brand">{list.length} materias</Badge>
                    </div>
                    <ul className="space-y-1 text-xs text-ink-secondary">
                      {list.map((s) => (
                        <li key={s.id} className="flex items-center justify-between">
                          <span className="font-medium text-ink-primary">{s.name}</span>
                          <span className="text-[11px] text-ink-muted">{s.area}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Modal Instancia de Intensificación */}
      <Modal
        open={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        title="Instancia de Intensificación (Res. 1650/24)"
        subtitle={`${planForm.studentName} · ${planForm.subjectName} (${planForm.courseLabel})`}
      >
        <form onSubmit={handleSavePlan} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Período</FieldLabel>
              <Select
                value={planForm.period}
                onChange={(e) =>
                  setPlanForm({ ...planForm, period: e.target.value as IntensificationPeriod })
                }
              >
                {Object.entries(PERIOD_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel required>Modalidad</FieldLabel>
              <Select
                value={planForm.modality}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    modality: e.target.value as 'intensificacion' | 'profundizacion' | 'recursada_edte',
                  })
                }
              >
                <option value="intensificacion">Intensificación</option>
                <option value="profundizacion">Profundización</option>
                <option value="recursada_edte">Recursada (Definición EDTE)</option>
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel>Contenidos prioritarios a acreditar</FieldLabel>
            <Textarea
              value={planForm.contenidosPrioritarios}
              onChange={(e) =>
                setPlanForm({ ...planForm, contenidosPrioritarios: e.target.value })
              }
              placeholder="Ej. Ecuaciones de primer grado, funciones lineales..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <FieldLabel>Resultado (Res. 1650/24)</FieldLabel>
              <Select
                value={planForm.result}
                onChange={(e) =>
                  setPlanForm({ ...planForm, result: e.target.value as IntensificationResult })
                }
              >
                <option value="">En seguimiento</option>
                <option value="AA">AA — Aprobó y Acreditó</option>
                <option value="CCA">CCA — Continúa con Avances</option>
                <option value="CSA">CSA — Continúa sin Avances</option>
              </Select>
            </div>
            <div>
              <FieldLabel>Calificación (4 a 10)</FieldLabel>
              <Input
                type="number"
                min={4}
                max={10}
                value={planForm.calificacion}
                onChange={(e) => setPlanForm({ ...planForm, calificacion: e.target.value })}
                placeholder="Solo si acredita"
              />
            </div>
            <div>
              <FieldLabel>Docente responsable</FieldLabel>
              <Input
                value={planForm.docenteResponsable}
                onChange={(e) => setPlanForm({ ...planForm, docenteResponsable: e.target.value })}
                placeholder="Apellido y nombre"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setPlanModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="emerald" loading={savingPlan}>
              Guardar instancia
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Nueva Materia */}
      <Modal
        open={subjectModalOpen}
        onClose={() => setSubjectModalOpen(false)}
        title="Agregar materia al Diseño Curricular"
      >
        <form onSubmit={handleSaveNewSubject} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Año</FieldLabel>
              <Select
                value={newSubject.yearNumber}
                onChange={(e) =>
                  setNewSubject({ ...newSubject, yearNumber: Number(e.target.value) })
                }
              >
                {[1, 2, 3, 4, 5, 6].map((y) => (
                  <option key={y} value={y}>
                    {y}° año
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel>Área</FieldLabel>
              <Input
                value={newSubject.area}
                onChange={(e) => setNewSubject({ ...newSubject, area: e.target.value })}
                placeholder="Ej. Arte / Orientación"
              />
            </div>
          </div>
          <div>
            <FieldLabel required>Nombre de la materia</FieldLabel>
            <Input
              value={newSubject.name}
              onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
              placeholder="Ej. Producción Musical / Proyecto de Investigación"
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setSubjectModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={savingSubject}>
              Agregar materia
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
