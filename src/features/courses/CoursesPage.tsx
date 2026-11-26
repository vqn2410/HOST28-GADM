import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FieldLabel,
  Input,
  Modal,
  PageHeader,
  Select,
} from '@/components/ui/Primitives';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import {
  listCourses,
  listEnrollments,
  listShifts,
  saveCourse,
} from '@/repositories/academicRepository';
import { logAudit } from '@/repositories/auditRepository';
import type { Course, CourseStatus } from '@/types/domain';

export const CoursesPage: React.FC = () => {
  const { user, can } = useAuth();
  const { selectedYearId, selectedYear } = useAcademicYear();
  const queryClient = useQueryClient();

  const coursesQuery = useQuery({
    queryKey: ['courses', selectedYearId],
    queryFn: () => listCourses(selectedYearId),
  });
  const shiftsQuery = useQuery({ queryKey: ['shifts'], queryFn: listShifts });
  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', selectedYearId],
    queryFn: () => listEnrollments(selectedYearId),
  });

  const courses = coursesQuery.data ?? [];
  const shifts = (shiftsQuery.data ?? []).filter((s) => s.active);

  const activeCountByCourse = useMemo(() => {
    const map = new Map<string, number>();
    (enrollmentsQuery.data ?? []).forEach((e) => {
      if (e.status === 'activa') {
        map.set(e.courseId, (map.get(e.courseId) ?? 0) + 1);
      }
    });
    return map;
  }, [enrollmentsQuery.data]);

  const groupedByShift = useMemo(() => {
    const map = new Map<string, Course[]>();
    courses.forEach((c) => {
      const list = map.get(c.shiftName) ?? [];
      list.push(c);
      map.set(c.shiftName, list);
    });
    return Array.from(map.entries());
  }, [courses]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState({
    yearNumber: 1,
    division: '1ª',
    shiftId: 'manana',
    orientation: '',
    capacity: '35',
    status: 'activo' as CourseStatus,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const shift = (shiftsQuery.data ?? []).find((s) => s.id === form.shiftId);
      if (!shift) throw new Error('Seleccioná un turno válido.');
      const saved = await saveCourse({
        id: editing?.id,
        academicYearId: selectedYearId,
        yearNumber: Number(form.yearNumber),
        division: form.division,
        shiftId: shift.id,
        shiftName: shift.name,
        orientation: form.orientation,
        capacity: form.capacity ? Number(form.capacity) : null,
        status: form.status,
      });
      await logAudit({
        userDni: user.dni,
        userName: `${user.apellido}, ${user.nombre}`,
        userRole: user.roleId,
        operation: editing ? 'course_update' : 'course_create',
        entity: 'sgae_courses',
        entityId: saved.id,
        newSummary: { label: saved.label, shift: saved.shiftName },
      });
    },
    onSuccess: () => {
      toast.success('Curso guardado correctamente.');
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['courses', selectedYearId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al guardar curso'),
  });

  return (
    <div>
      <PageHeader
        title={`Cursos y Divisiones — Ciclo ${selectedYearId}`}
        subtitle="Estructura configurable de años (1° a 7°), divisiones numéricas o alfabéticas, turnos y orientaciones."
        actions={
          can('academic_years:manage') &&
          selectedYear?.status !== 'cerrado' && (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setForm({
                  yearNumber: 1,
                  division: '1ª',
                  shiftId: shifts[0]?.id || 'manana',
                  orientation: '',
                  capacity: '35',
                  status: 'activo',
                });
                setModalOpen(true);
              }}
            >
              <Plus size={15} />
              Nuevo curso
            </Button>
          )
        }
      />

      {groupedByShift.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            title={`Sin cursos configurados para ${selectedYearId}`}
            description="Agregá los cursos y divisiones de este ciclo lectivo."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedByShift.map(([shiftName, list]) => (
            <div key={shiftName}>
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-muted mb-3">
                Turno {shiftName} ({list.length} cursos)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {list.map((c) => {
                  const enrolled = activeCountByCourse.get(c.id) ?? 0;
                  return (
                    <Card key={c.id} className="p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-lg font-extrabold font-display text-ink-primary">
                              {c.label}
                            </h3>
                            <p className="text-xs text-ink-muted font-mono">
                              Código EF: {c.legacyCode}
                            </p>
                          </div>
                          <Badge variant={c.status === 'activo' ? 'success' : 'neutral'}>
                            {c.status}
                          </Badge>
                        </div>
                        {c.orientation && (
                          <p className="text-xs text-ink-secondary mt-2">{c.orientation}</p>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-ink-primary">
                          <Users size={14} className="text-brand-500" />
                          {enrolled}
                          {c.capacity ? ` / ${c.capacity}` : ''} matriculados
                        </span>
                        {can('academic_years:manage') && selectedYear?.status !== 'cerrado' && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(c);
                              setForm({
                                yearNumber: c.yearNumber,
                                division: c.division,
                                shiftId: c.shiftId,
                                orientation: c.orientation || '',
                                capacity: c.capacity ? String(c.capacity) : '',
                                status: c.status,
                              });
                              setModalOpen(true);
                            }}
                            className="text-brand-600 dark:text-brand-300 font-semibold hover:underline cursor-pointer"
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar curso ${editing.label}` : `Nuevo curso — Ciclo ${selectedYearId}`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel required>Año de cursada</FieldLabel>
            <Select
              value={form.yearNumber}
              onChange={(e) => setForm((p) => ({ ...p, yearNumber: Number(e.target.value) }))}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n}° año
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel required>División / Sección</FieldLabel>
            <Input
              value={form.division}
              onChange={(e) => setForm((p) => ({ ...p, division: e.target.value }))}
              placeholder="Ej. 1ª, 2ª, 3ª, A, B"
            />
          </div>
          <div>
            <FieldLabel required>Turno</FieldLabel>
            <Select
              value={form.shiftId}
              onChange={(e) => setForm((p) => ({ ...p, shiftId: e.target.value }))}
            >
              {(shiftsQuery.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel>Capacidad (opcional)</FieldLabel>
            <Input
              type="number"
              value={form.capacity}
              onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))}
              placeholder="35"
            />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>Orientación / Ciclo</FieldLabel>
            <Input
              value={form.orientation}
              onChange={(e) => setForm((p) => ({ ...p, orientation: e.target.value }))}
              placeholder="Ej. Ciclo Básico, Ciencias Sociales, Comunicación..."
            />
          </div>
          <div>
            <FieldLabel>Estado</FieldLabel>
            <Select
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as CourseStatus }))}
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setModalOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            disabled={!form.division.trim()}
          >
            Guardar curso
          </Button>
        </div>
      </Modal>
    </div>
  );
};
