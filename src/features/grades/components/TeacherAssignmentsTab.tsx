import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteTeacherAssignment,
  saveTeacherAssignment,
  WEEKDAYS,
} from '@/repositories/attendanceRepository';
import { listEfBaseUsers, listSgaeUsers } from '@/repositories/settingsAndUsersRepository';
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
import type { Course, Subject, TeacherAssignment } from '@/types/domain';

interface TeacherAssignmentsTabProps {
  academicYearId: string;
  courses: Course[];
  subjects: Subject[];
  assignments: TeacherAssignment[];
}

export const TeacherAssignmentsTab: React.FC<TeacherAssignmentsTabProps> = ({
  academicYearId,
  courses,
  subjects,
  assignments,
}) => {
  const queryClient = useQueryClient();
  const sgaeUsersQuery = useQuery({ queryKey: ['sgae-users'], queryFn: listSgaeUsers });
  const efUsersQuery = useQuery({ queryKey: ['ef-users'], queryFn: listEfBaseUsers });

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    teacherDni: '',
    courseId: courses[0]?.id || '',
    subjectId: '',
    daysOfWeek: [1, 3] as number[],
    schedule: '08:00 - 10:00',
  });

  // Combinar personal registrado en SGAE y HOST28_EF
  const staffOptions = React.useMemo(() => {
    const map = new Map<string, { dni: string; name: string; role: string }>();
    (efUsersQuery.data ?? []).forEach((u) =>
      map.set(u.dni, { dni: u.dni, name: `${u.apellido}, ${u.nombre}`, role: u.rol })
    );
    (sgaeUsersQuery.data ?? []).forEach((u) =>
      map.set(u.dni, { dni: u.dni, name: `${u.apellido}, ${u.nombre}`, role: u.roleId })
    );
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [efUsersQuery.data, sgaeUsersQuery.data]);

  const selectedCourse = courses.find((c) => c.id === form.courseId);
  const availableSubjects = subjects.filter(
    (s) => s.active && (!selectedCourse || s.yearNumber === selectedCourse.yearNumber)
  );

  const toggleDay = (d: number) => {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(d)
        ? prev.daysOfWeek.filter((x) => x !== d)
        : [...prev.daysOfWeek, d].sort(),
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const staff = staffOptions.find((s) => s.dni === form.teacherDni);
    const course = courses.find((c) => c.id === form.courseId);
    const subject = availableSubjects.find((s) => s.id === form.subjectId);
    if (!staff || !course || !subject) {
      toast.error('Seleccioná docente, curso y materia.');
      return;
    }
    if (form.daysOfWeek.length === 0) {
      toast.error('Seleccioná al menos un día de la semana.');
      return;
    }

    setSaving(true);
    try {
      await saveTeacherAssignment({
        academicYearId,
        teacherDni: staff.dni,
        teacherName: staff.name,
        courseId: course.id,
        courseLabel: course.label,
        subjectId: subject.id,
        subjectName: subject.name,
        daysOfWeek: form.daysOfWeek,
        schedule: form.schedule.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ['teacher-assignments', academicYearId] });
      toast.success(`Asignación guardada: ${staff.name} → ${subject.name} (${course.label}).`);
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteTeacherAssignment(id);
    await queryClient.invalidateQueries({ queryKey: ['teacher-assignments', academicYearId] });
    toast.success('Asignación eliminada.');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-sm text-ink-primary">
            Asignación de Docentes, Materias, Días y Horarios ({academicYearId})
          </h3>
          <p className="text-xs text-ink-muted">
            Los usuarios con rol <strong>Docente</strong> verán únicamente los cursos, materias y
            días de toma de asistencia asignados aquí.
          </p>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={14} /> Nueva asignación docente
        </Button>
      </div>

      <Card className="overflow-hidden">
        {assignments.length === 0 ? (
          <EmptyState
            title="Sin asignaciones docentes registradas"
            description="Asigná docentes a sus cursos, materias y días de dictado para habilitar su vista acotada."
            icon={<CalendarClock size={22} />}
            action={
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus size={14} /> Crear asignación
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-border-subtle">
            {assignments.map((a) => (
              <div
                key={a.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <p className="font-bold text-sm text-ink-primary">
                    {a.teacherName}{' '}
                    <span className="font-mono font-normal text-ink-muted">(DNI {a.teacherDni})</span>
                  </p>
                  <p className="text-ink-secondary mt-0.5">
                    <strong>{a.subjectName}</strong> · Curso <strong>{a.courseLabel}</strong> ·
                    Horario: <strong>{a.schedule || 'Sin definir'}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {a.daysOfWeek.map((d) => (
                    <Badge key={d} variant="brand">
                      {WEEKDAYS.find((w) => w.value === d)?.short ?? d}
                    </Badge>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Eliminar asignación"
                    onClick={() => void handleDelete(a.id)}
                  >
                    <Trash2 size={14} className="text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Asignar Docente a Curso y Materia"
        subtitle="Definí los días hábiles y horario en los que el docente podrá tomar asistencia."
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <FieldLabel required>Docente</FieldLabel>
            <Select
              value={form.teacherDni}
              onChange={(e) => setForm({ ...form, teacherDni: e.target.value })}
              required
            >
              <option value="">— Seleccionar docente —</option>
              {staffOptions.map((s) => (
                <option key={s.dni} value={s.dni}>
                  {s.name} (DNI {s.dni} · {s.role})
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Curso</FieldLabel>
              <Select
                value={form.courseId}
                onChange={(e) => setForm({ ...form, courseId: e.target.value, subjectId: '' })}
                required
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({c.shiftName})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel required>Materia</FieldLabel>
              <Select
                value={form.subjectId}
                onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                required
              >
                <option value="">— Seleccionar materia —</option>
                {availableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel required>Días de dictado (habilitados para asistencia)</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((w) => {
                const active = form.daysOfWeek.includes(w.value);
                return (
                  <button
                    key={w.value}
                    type="button"
                    onClick={() => toggleDay(w.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                      active
                        ? 'bg-brand-500 text-white border-brand-500'
                        : 'bg-surface-card text-ink-secondary border-border-strong'
                    }`}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <FieldLabel required>Horario</FieldLabel>
            <Input
              value={form.schedule}
              onChange={(e) => setForm({ ...form, schedule: e.target.value })}
              placeholder="Ej. 07:30 - 09:30"
              required
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="emerald" loading={saving}>
              Guardar asignación
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
