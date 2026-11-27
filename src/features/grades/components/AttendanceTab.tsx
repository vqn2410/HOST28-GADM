import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  AlertTriangle,
  CalendarOff,
  Save,
  Trash2,
  Dumbbell,
  ExternalLink,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  adaptEfPartesToAttendanceRecords,
  computeAttendanceStats,
  deleteNonComputableDay,
  getDayOfWeekISO,
  isWeekday,
  listDailyAttendance,
  listEfPartesForYear,
  listNonComputableDays,
  listSubjectAttendance,
  NON_COMPUTABLE_CAUSES,
  saveDailyAttendance,
  saveNonComputableDay,
  saveSubjectAttendance,
  WEEKDAYS,
} from '@/repositories/attendanceRepository';
import { formatDateAR, formatDniDisplay, getArgentinaDateISO } from '@/lib/utils/formatters';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FieldLabel,
  Input,
  Modal,
  Select,
} from '@/components/ui/Primitives';
import type {
  AttendanceMark,
  Course,
  NonComputableCause,
  SgaeUser,
  Student,
  Subject,
  TeacherAssignment,
} from '@/types/domain';

interface AttendanceTabProps {
  user: SgaeUser | null;
  isTeacherOnly: boolean;
  academicYearId: string;
  courses: Course[];
  selectedCourseId: string;
  onSelectCourse: (id: string) => void;
  courseSubjects: Subject[];
  selectedSubjectId: string;
  onSelectSubject: (id: string) => void;
  rosterStudents: Student[];
  assignments: TeacherAssignment[];
}

type PeriodView = 'semanal' | 'mensual' | 'anual';

function getWeekBounds(isoDate: string): { start: string; end: string } {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(dt);
  mon.setDate(dt.getDate() + diffToMon);
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { start: fmt(mon), end: fmt(fri) };
}

export const AttendanceTab: React.FC<AttendanceTabProps> = ({
  user,
  isTeacherOnly,
  academicYearId,
  courses,
  selectedCourseId,
  onSelectCourse,
  courseSubjects,
  selectedSubjectId,
  onSelectSubject,
  rosterStudents,
  assignments,
}) => {
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<'materia' | 'preceptoria'>(
    isTeacherOnly ? 'materia' : 'preceptoria'
  );
  const [selectedDate, setSelectedDate] = useState(getArgentinaDateISO());
  const [periodView, setPeriodView] = useState<PeriodView>('mensual');
  const [onlyBelow75, setOnlyBelow75] = useState(false);
  const [draftMarks, setDraftMarks] = useState<Record<string, AttendanceMark>>({});
  const [saving, setSaving] = useState(false);

  // Modal de Día No Contabilizado
  const [ncdModalOpen, setNcdModalOpen] = useState(false);
  const [ncdCause, setNcdCause] = useState<NonComputableCause>('Jornada Institucional');
  const [ncdDetail, setNcdDetail] = useState('');
  const [ncdScope, setNcdScope] = useState<'all' | 'course'>('all');
  const [savingNcd, setSavingNcd] = useState(false);

  const currentCourse = courses.find((c) => c.id === selectedCourseId) ?? null;
  const currentSubject = courseSubjects.find((s) => s.id === selectedSubjectId) ?? null;
  const isEfSubject = Boolean(
    currentSubject && currentSubject.name.toLowerCase().includes('educación física')
  );

  // Asignación docente para validar día y horario en modo materia
  const activeAssignment = useMemo(() => {
    return assignments.find(
      (a) =>
        a.courseId === selectedCourseId &&
        a.subjectId === selectedSubjectId &&
        (!isTeacherOnly || a.teacherDni === user?.dni)
    );
  }, [assignments, selectedCourseId, selectedSubjectId, isTeacherOnly, user?.dni]);

  const subjectAttQuery = useQuery({
    queryKey: ['subject-attendance', academicYearId, selectedCourseId, selectedSubjectId],
    queryFn: () => listSubjectAttendance(academicYearId, selectedCourseId, selectedSubjectId),
    enabled: Boolean(selectedCourseId && selectedSubjectId),
  });

  const dailyAttQuery = useQuery({
    queryKey: ['daily-attendance', academicYearId, selectedCourseId],
    queryFn: () => listDailyAttendance(academicYearId, selectedCourseId),
    enabled: Boolean(selectedCourseId),
  });

  const nonCompQuery = useQuery({
    queryKey: ['non-computable-days', academicYearId],
    queryFn: () => listNonComputableDays(academicYearId),
  });

  const efPartesQuery = useQuery({
    queryKey: ['ef-partes', academicYearId],
    queryFn: () => listEfPartesForYear(academicYearId),
  });

  // Días no contabilizados aplicables a este curso
  const applicableNonComp = useMemo(
    () =>
      (nonCompQuery.data ?? []).filter(
        (d) => d.scope === 'all' || d.scope === selectedCourseId
      ),
    [nonCompQuery.data, selectedCourseId]
  );

  const nonCompDateSet = useMemo(
    () => new Set(applicableNonComp.map((d) => d.date)),
    [applicableNonComp]
  );

  const nonCompForSelectedDate = applicableNonComp.find((d) => d.date === selectedDate);

  // Filtro por vista Semanal / Mensual / Anual
  const filterByPeriod = (dateStr: string): boolean => {
    if (periodView === 'anual') return dateStr.startsWith(academicYearId);
    if (periodView === 'mensual') return dateStr.slice(0, 7) === selectedDate.slice(0, 7);
    const { start, end } = getWeekBounds(selectedDate);
    return dateStr >= start && dateStr <= end;
  };

  // Registros EF desde HOST28_EF para el curso actual
  const efCourseRecords = useMemo(() => {
    return adaptEfPartesToAttendanceRecords(
      efPartesQuery.data ?? [],
      currentCourse?.legacyCode
    ).filter((r) => filterByPeriod(r.date));
  }, [efPartesQuery.data, currentCourse?.legacyCode, periodView, selectedDate, academicYearId]);

  const studentDnis = useMemo(() => rosterStudents.map((s) => s.dni), [rosterStudents]);

  // Estadísticas EF (traídas de HOST28_EF)
  const efStatsMap = useMemo(
    () => computeAttendanceStats(studentDnis, efCourseRecords, nonCompDateSet),
    [studentDnis, efCourseRecords, nonCompDateSet]
  );

  // Sesiones activas según modo (Materia o Preceptoría) filtradas por período
  const activeRecords = useMemo(() => {
    if (mode === 'materia') {
      if (isEfSubject) return efCourseRecords;
      return (subjectAttQuery.data ?? []).filter((r) => filterByPeriod(r.date));
    }
    return (dailyAttQuery.data ?? []).filter((r) => filterByPeriod(r.date));
  }, [
    mode,
    isEfSubject,
    efCourseRecords,
    subjectAttQuery.data,
    dailyAttQuery.data,
    periodView,
    selectedDate,
    academicYearId,
  ]);

  const statsMap = useMemo(
    () => computeAttendanceStats(studentDnis, activeRecords, nonCompDateSet),
    [studentDnis, activeRecords, nonCompDateSet]
  );

  const below75Students = useMemo(
    () =>
      rosterStudents.filter((s) => {
        const st = statsMap.get(s.dni);
        return Boolean(st?.below75);
      }),
    [rosterStudents, statsMap]
  );

  // Marcas actuales para la fecha seleccionada
  const existingMarksForDate = useMemo(() => {
    const found = activeRecords.find((r) => r.date === selectedDate);
    return found?.marks ?? {};
  }, [activeRecords, selectedDate]);

  const getMark = (dni: string): AttendanceMark => {
    return draftMarks[dni] ?? existingMarksForDate[dni] ?? 'P';
  };

  // Validaciones de fecha
  const dow = getDayOfWeekISO(selectedDate);
  const isSelectedWeekday = isWeekday(selectedDate);
  const teacherDayAllowed =
    !activeAssignment ||
    activeAssignment.daysOfWeek.length === 0 ||
    activeAssignment.daysOfWeek.includes(dow);

  const canTakeAttendanceToday =
    !nonCompForSelectedDate &&
    isSelectedWeekday &&
    !(mode === 'materia' && isEfSubject) &&
    !(mode === 'materia' && isTeacherOnly && !teacherDayAllowed);

  const handleSaveAttendance = async () => {
    if (!currentCourse || !user) return;
    if (!isSelectedWeekday) {
      toast.error('La asistencia solo puede tomarse de Lunes a Viernes.');
      return;
    }
    if (nonCompForSelectedDate) {
      toast.error(`Esta fecha no se contabiliza (${nonCompForSelectedDate.cause}).`);
      return;
    }
    if (mode === 'materia' && isTeacherOnly && !teacherDayAllowed) {
      toast.error('La fecha seleccionada no corresponde a los días asignados de esta materia.');
      return;
    }

    const marks: Record<string, AttendanceMark> = {};
    rosterStudents.forEach((s) => {
      marks[s.dni] = getMark(s.dni);
    });

    setSaving(true);
    try {
      if (mode === 'materia' && currentSubject) {
        await saveSubjectAttendance({
          academicYearId,
          courseId: currentCourse.id,
          subjectId: currentSubject.id,
          subjectName: currentSubject.name,
          date: selectedDate,
          schedule: activeAssignment?.schedule || '',
          teacherDni: user.dni,
          teacherName: `${user.apellido}, ${user.nombre}`,
          marks,
        });
        await queryClient.invalidateQueries({
          queryKey: ['subject-attendance', academicYearId, selectedCourseId, selectedSubjectId],
        });
      } else {
        await saveDailyAttendance({
          academicYearId,
          courseId: currentCourse.id,
          courseLabel: currentCourse.label,
          date: selectedDate,
          takenByDni: user.dni,
          takenByName: `${user.apellido}, ${user.nombre}`,
          marks,
        });
        await queryClient.invalidateQueries({
          queryKey: ['daily-attendance', academicYearId, selectedCourseId],
        });
      }
      setDraftMarks({});
      toast.success(`Asistencia del ${formatDateAR(selectedDate)} guardada correctamente.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar asistencia.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNonComp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingNcd(true);
    try {
      await saveNonComputableDay({
        academicYearId,
        date: selectedDate,
        cause: ncdCause,
        detail: ncdDetail.trim(),
        scope: ncdScope === 'all' ? 'all' : selectedCourseId,
        createdBy: `${user.apellido}, ${user.nombre}`,
      });
      await queryClient.invalidateQueries({ queryKey: ['non-computable-days', academicYearId] });
      toast.success(`Fecha ${formatDateAR(selectedDate)} marcada como no contabilizable (${ncdCause}).`);
      setNcdDetail('');
      setNcdModalOpen(false);
    } finally {
      setSavingNcd(false);
    }
  };

  const handleDeleteNonComp = async (id: string) => {
    await deleteNonComputableDay(id);
    await queryClient.invalidateQueries({ queryKey: ['non-computable-days', academicYearId] });
    toast.success('Día no contabilizable eliminado.');
  };

  const displayedStudents = onlyBelow75 ? below75Students : rosterStudents;

  return (
    <div className="space-y-5">
      {/* Selector de modo y filtros */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!isTeacherOnly ? (
            <div className="inline-flex p-1 rounded-xl bg-surface-subtle border border-border-subtle gap-1">
              <button
                type="button"
                onClick={() => {
                  setMode('preceptoria');
                  setDraftMarks({});
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  mode === 'preceptoria'
                    ? 'bg-brand-500 text-white'
                    : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                Asistencia General (Preceptoría L–V)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('materia');
                  setDraftMarks({});
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  mode === 'materia'
                    ? 'bg-brand-500 text-white'
                    : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                Asistencia por Materia (Docentes)
              </button>
            </div>
          ) : (
            <Badge variant="brand">Asistencia por Materia — Vista Docente</Badge>
          )}

          {/* Selector de vista Semanal / Mensual / Anual */}
          <div className="inline-flex p-1 rounded-xl bg-surface-subtle border border-border-subtle gap-1">
            {(['semanal', 'mensual', 'anual'] as PeriodView[]).map((pv) => (
              <button
                key={pv}
                type="button"
                onClick={() => setPeriodView(pv)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize cursor-pointer ${
                  periodView === pv
                    ? 'bg-emerald-brand-500 text-white'
                    : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {pv}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <FieldLabel>Curso</FieldLabel>
            <Select
              value={selectedCourseId}
              onChange={(e) => {
                onSelectCourse(e.target.value);
                setDraftMarks({});
              }}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} — {c.shiftName}
                </option>
              ))}
            </Select>
          </div>

          {mode === 'materia' && (
            <div>
              <FieldLabel>Materia</FieldLabel>
              <Select
                value={selectedSubjectId}
                onChange={(e) => {
                  onSelectSubject(e.target.value);
                  setDraftMarks({});
                }}
              >
                {courseSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <FieldLabel>Fecha de clase</FieldLabel>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setDraftMarks({});
              }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {!isTeacherOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNcdModalOpen(true)}
                title="Marcar fecha como jornada institucional u otra causa sin contabilizar asistencia"
              >
                <CalendarOff size={14} /> No contabilizar día
              </Button>
            )}
            <Button
              size="sm"
              variant="emerald"
              loading={saving}
              disabled={!canTakeAttendanceToday || rosterStudents.length === 0}
              onClick={handleSaveAttendance}
            >
              <Save size={14} /> Guardar asistencia
            </Button>
          </div>
        </div>

        {/* Avisos contextuales de día/horario, EF y día no contabilizado */}
        {!isSelectedWeekday && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertTriangle size={15} />
            La fecha seleccionada ({formatDateAR(selectedDate)}) corresponde a fin de semana. La
            toma de asistencia está habilitada de Lunes a Viernes.
          </div>
        )}

        {nonCompForSelectedDate && (
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 text-xs text-blue-800 dark:text-blue-200 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <CalendarOff size={15} />
              <strong>Día no contabilizado:</strong> {nonCompForSelectedDate.cause}
              {nonCompForSelectedDate.detail ? ` — ${nonCompForSelectedDate.detail}` : ''} (excluido
              del porcentaje de asistencia).
            </span>
          </div>
        )}

        {mode === 'materia' && activeAssignment && (
          <div className="p-3 rounded-xl bg-surface-subtle border border-border-subtle text-xs flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Clock size={14} className="text-brand-500" />
              <strong>Horario asignado:</strong>{' '}
              {activeAssignment.daysOfWeek
                .map((d) => WEEKDAYS.find((w) => w.value === d)?.label)
                .join(', ')}{' '}
              ({activeAssignment.schedule || 'Sin horario'})
            </span>
            {!teacherDayAllowed && (
              <Badge variant="danger">
                Esta fecha no coincide con los días de cursada de la materia
              </Badge>
            )}
          </div>
        )}

        {mode === 'materia' && isEfSubject && (
          <div className="p-3.5 rounded-xl bg-emerald-brand-50 dark:bg-emerald-950/40 border border-emerald-brand-100 text-xs text-emerald-brand-700 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Dumbbell size={15} />
              <strong>Educación Física sincronizada desde HOST28_EF:</strong> los partes y
              asistencias de Educación Física se cargan en el Host de Educación Física y se reflejan
              aquí automáticamente ({efCourseRecords.length} clases en el período {periodView}).
            </span>
            <a
              href="https://host-28-ef.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-bold underline"
            >
              Abrir HOST28_EF <ExternalLink size={12} />
            </a>
          </div>
        )}
      </Card>

      {/* Resumen del período (Semanal / Mensual / Anual) + Alerta < 75% */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs uppercase font-semibold text-ink-muted">
            Clases contabilizadas ({periodView})
          </p>
          <p className="text-2xl font-bold font-display mt-1">
            {activeRecords.filter((r) => !nonCompDateSet.has(r.date)).length}
          </p>
          <p className="text-xs text-ink-secondary mt-0.5">
            {applicableNonComp.filter((d) => filterByPeriod(d.date)).length} día(s) no contabilizado(s)
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs uppercase font-semibold text-ink-muted">
            Estudiantes bajo el 75% ({periodView})
          </p>
          <p className="text-2xl font-bold font-display text-red-600 mt-1">
            {below75Students.length}
          </p>
          <button
            type="button"
            onClick={() => setOnlyBelow75((v) => !v)}
            className="text-xs font-semibold text-brand-500 hover:underline mt-0.5 cursor-pointer"
          >
            {onlyBelow75 ? 'Mostrar todo el curso' : 'Filtrar solo < 75% de asistencia'}
          </button>
        </Card>

        <Card className="p-4">
          <p className="text-xs uppercase font-semibold text-ink-muted">
            Clases de Ed. Física (HOST28_EF · {periodView})
          </p>
          <p className="text-2xl font-bold font-display text-emerald-brand-600 mt-1">
            {efCourseRecords.length}
          </p>
          <p className="text-xs text-ink-secondary mt-0.5">
            Partes sincronizados automáticamente
          </p>
        </Card>
      </div>

      {/* Planilla de toma de asistencia + porcentajes */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border-subtle flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <CalendarCheck size={16} className="text-brand-500" />
            {mode === 'materia'
              ? `Asistencia ${currentSubject?.name || ''} — ${currentCourse?.label || ''}`
              : `Asistencia General — ${currentCourse?.label || ''}`}{' '}
            ({formatDateAR(selectedDate)})
          </h3>
          <span className="text-xs text-ink-muted">
            P: Presente · A: Ausente · T: Tarde (0.5) · J: Justificada
          </span>
        </div>

        {displayedStudents.length === 0 ? (
          <EmptyState
            title={onlyBelow75 ? 'Todos los estudiantes superan el 75%' : 'Sin estudiantes en el curso'}
            description={
              onlyBelow75
                ? 'Ningún estudiante está por debajo del 75% de asistencia en este período.'
                : 'Seleccioná un curso con matrícula activa.'
            }
          />
        ) : (
          <div className="divide-y divide-border-subtle">
            {displayedStudents.map((st) => {
              const mark = getMark(st.dni);
              const stat = statsMap.get(st.dni);
              const efStat = efStatsMap.get(st.dni);
              return (
                <div
                  key={st.dni}
                  className={`p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    stat?.below75 ? 'bg-red-50/60 dark:bg-red-950/20' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-ink-primary">
                        {st.apellido}, {st.nombres}
                      </span>
                      {stat?.below75 ? (
                        <Badge variant="danger">
                          <AlertTriangle size={11} /> {stat.percentage}% (&lt;75%)
                        </Badge>
                      ) : (
                        <Badge variant="success">
                          <CheckCircle2 size={11} /> {stat?.percentage ?? 100}%
                        </Badge>
                      )}
                      {mode === 'preceptoria' && efStat && efStat.totalClasses > 0 && (
                        <Badge variant={efStat.below75 ? 'warning' : 'neutral'}>
                          EF: {efStat.percentage}% ({efStat.totalClasses} cl.)
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-ink-muted font-mono mt-0.5">
                      DNI {formatDniDisplay(st.dni)} · Clases: {stat?.totalClasses ?? 0} · Ausentes:{' '}
                      {stat?.absences ?? 0}
                    </p>
                  </div>

                  {!(mode === 'materia' && isEfSubject) && (
                    <div className="flex items-center gap-1.5">
                      {(['P', 'A', 'T', 'J'] as AttendanceMark[]).map((m) => {
                        const active = mark === m;
                        const color =
                          m === 'P'
                            ? active
                              ? 'bg-emerald-brand-500 text-white border-emerald-brand-500'
                              : 'hover:border-emerald-brand-400'
                            : m === 'A'
                              ? active
                                ? 'bg-red-600 text-white border-red-600'
                                : 'hover:border-red-400'
                              : m === 'T'
                                ? active
                                  ? 'bg-amber-500 text-white border-amber-500'
                                  : 'hover:border-amber-400'
                                : active
                                  ? 'bg-brand-500 text-white border-brand-500'
                                  : 'hover:border-brand-400';
                        return (
                          <button
                            key={m}
                            type="button"
                            disabled={!canTakeAttendanceToday}
                            onClick={() =>
                              setDraftMarks((prev) => ({ ...prev, [st.dni]: m }))
                            }
                            className={`w-9 h-9 rounded-xl border text-xs font-bold transition-all cursor-pointer disabled:opacity-50 ${
                              active
                                ? color
                                : `bg-surface-card border-border-strong text-ink-secondary ${color}`
                            }`}
                          >
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Días no contabilizados del período */}
      {applicableNonComp.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border-subtle font-bold text-xs uppercase text-ink-muted">
            Días No Contabilizados — Ciclo {academicYearId} ({applicableNonComp.length})
          </div>
          <div className="divide-y divide-border-subtle text-xs">
            {applicableNonComp.map((d) => (
              <div key={d.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-bold">{formatDateAR(d.date)}</span> ·{' '}
                  <strong>{d.cause}</strong>
                  {d.detail ? ` — ${d.detail}` : ''}{' '}
                  <span className="text-ink-muted">
                    ({d.scope === 'all' ? 'Toda la escuela' : 'Solo este curso'} · {d.createdBy})
                  </span>
                </div>
                {!isTeacherOnly && !d.id.startsWith('ef_feriado_') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleDeleteNonComp(d.id)}
                  >
                    <Trash2 size={13} className="text-red-500" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modal Día No Contabilizado */}
      <Modal
        open={ncdModalOpen}
        onClose={() => setNcdModalOpen(false)}
        title={`No contabilizar asistencia — ${formatDateAR(selectedDate)}`}
        subtitle="Esta fecha se excluirá automáticamente del cálculo de porcentaje de asistencia."
      >
        <form onSubmit={handleSaveNonComp} className="space-y-4">
          <div>
            <FieldLabel required>Causa</FieldLabel>
            <Select
              value={ncdCause}
              onChange={(e) => setNcdCause(e.target.value as NonComputableCause)}
            >
              {NON_COMPUTABLE_CAUSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel>Detalle / Observación</FieldLabel>
            <Input
              value={ncdDetail}
              onChange={(e) => setNcdDetail(e.target.value)}
              placeholder="Ej. Jornada Institucional ESI / Alerta naranja..."
            />
          </div>
          <div>
            <FieldLabel required>Alcance</FieldLabel>
            <Select
              value={ncdScope}
              onChange={(e) => setNcdScope(e.target.value as 'all' | 'course')}
            >
              <option value="all">Toda la escuela</option>
              <option value="course">Solo {currentCourse?.label || 'este curso'}</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setNcdModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={savingNcd}>
              Guardar día no contabilizable
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
