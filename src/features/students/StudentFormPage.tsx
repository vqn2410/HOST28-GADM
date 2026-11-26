import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, AlertTriangle, CalendarCheck2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
  FieldError,
  FieldLabel,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui/Primitives';
import { studentSchema, type StudentFormValues } from '@/lib/validators/schemas';
import { calculateAge, normalizeDni } from '@/lib/utils/formatters';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { createStudent, getStudentByDni } from '@/repositories/studentRepository';
import { enrollStudent, listCourses } from '@/repositories/academicRepository';
import { logAudit } from '@/repositories/auditRepository';

export const StudentFormPage: React.FC = () => {
  const { user } = useAuth();
  const { selectedYearId, selectedYear, settings } = useAcademicYear();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [enrollNow, setEnrollNow] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [duplicateDni, setDuplicateDni] = useState<string | null>(null);

  const coursesQuery = useQuery({
    queryKey: ['courses', selectedYearId],
    queryFn: () => listCourses(selectedYearId),
  });
  const activeCourses = (coursesQuery.data ?? []).filter((c) => c.status === 'activo');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<StudentFormValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      apellido: '',
      nombres: '',
      dni: '',
      fechaNacimiento: '',
      anioIngreso: Number(selectedYearId) || new Date().getFullYear(),
      estadoInstitucional: 'activo',
      observaciones: '',
    },
  });

  const watchedBirth = watch('fechaNacimiento');
  const computedAge = calculateAge(watchedBirth);

  const checkDniBlur = async (raw: string) => {
    const clean = normalizeDni(raw);
    if (clean.length < 5) {
      setDuplicateDni(null);
      return;
    }
    const existing = await getStudentByDni(clean);
    setDuplicateDni(existing ? existing.dni : null);
  };

  const mutation = useMutation({
    mutationFn: async (values: StudentFormValues) => {
      const course = activeCourses.find((c) => c.id === selectedCourseId);
      const created = await createStudent({
        ...values,
        cursoOrigen: enrollNow && course ? course.legacyCode : '',
        turno: enrollNow && course ? course.shiftName : '',
      });

      if (user) {
        await logAudit({
          userDni: user.dni,
          userName: `${user.apellido}, ${user.nombre}`,
          userRole: user.roleId,
          operation: 'student_create',
          entity: 'alumnos',
          entityId: created.dni,
          newSummary: {
            apellido: created.apellido,
            nombres: created.nombres,
            anioIngreso: created.anioIngreso,
          },
        });
      }

      if (enrollNow && course && user) {
        await enrollStudent({
          student: created,
          academicYearId: selectedYearId,
          course,
          performedByDni: user.dni,
          performedByName: `${user.apellido}, ${user.nombre}`,
          isCurrentDefaultYear: selectedYear?.isDefault ?? true,
        });
      }

      return created;
    },
    onSuccess: (created) => {
      toast.success(`Estudiante ${created.apellido}, ${created.nombres} registrado correctamente.`);
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      navigate(`/estudiantes/${created.dni}`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el estudiante.');
    },
  });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Nuevo Estudiante"
        subtitle="Alta en la base general única. El registro quedará disponible automáticamente para SGAE y HOST 28 Educación Física."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/estudiantes')}>
            <ArrowLeft size={15} />
            Volver al listado
          </Button>
        }
      />

      {duplicateDni && (
        <div className="mb-5 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-bold">DNI ya registrado en la base general</p>
            <p className="text-xs mt-1">
              Ya existe un estudiante con DNI <strong className="font-mono">{duplicateDni}</strong>.
              No es necesario volver a cargarlo; podés acceder directamente a su ficha y asignarle una nueva matrícula.
            </p>
            <Link
              to={`/estudiantes/${duplicateDni}`}
              className="inline-block mt-2 text-xs font-bold text-brand-700 dark:text-brand-300 underline"
            >
              Abrir ficha del estudiante existente →
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
        <Card className="p-6">
          <h2 className="text-base font-bold text-ink-primary mb-4">1. Datos personales</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel htmlFor="apellido" required>
                Apellido
              </FieldLabel>
              <Input id="apellido" placeholder="Ej. Álvarez" {...register('apellido')} />
              <FieldError message={errors.apellido?.message} />
            </div>
            <div>
              <FieldLabel htmlFor="nombres" required>
                Nombre / Nombres
              </FieldLabel>
              <Input id="nombres" placeholder="Ej. Martín Ezequiel" {...register('nombres')} />
              <FieldError message={errors.nombres?.message} />
            </div>
            <div>
              <FieldLabel htmlFor="dni" required>
                DNI (sin puntos ni espacios)
              </FieldLabel>
              <Input
                id="dni"
                inputMode="numeric"
                placeholder="46123456"
                className="font-mono"
                {...register('dni', {
                  onBlur: (e) => void checkDniBlur(e.target.value),
                })}
              />
              <FieldError message={errors.dni?.message} />
            </div>
            <div>
              <FieldLabel htmlFor="fechaNacimiento">
                Fecha de nacimiento{' '}
                {computedAge !== null && (
                  <span className="text-emerald-brand-600 font-bold normal-case ml-1">
                    (Edad calculada: {computedAge} años)
                  </span>
                )}
              </FieldLabel>
              <Input id="fechaNacimiento" type="date" {...register('fechaNacimiento')} />
              <FieldError message={errors.fechaNacimiento?.message} />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-bold text-ink-primary mb-4">2. Situación institucional</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel htmlFor="anioIngreso" required>
                Año lectivo de ingreso
              </FieldLabel>
              <Input id="anioIngreso" type="number" {...register('anioIngreso')} />
              <FieldError message={errors.anioIngreso?.message} />
            </div>
            <div>
              <FieldLabel htmlFor="estadoInstitucional" required>
                Estado institucional
              </FieldLabel>
              <Select id="estadoInstitucional" {...register('estadoInstitucional')}>
                <option value="activo">Activo</option>
                <option value="egresado">Egresado</option>
                <option value="pase">Pase a otra institución</option>
                <option value="desvinculado">Desvinculado</option>
                <option value="archivado">Archivado</option>
                {(settings.customStudentStatuses || []).map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </Select>
              <FieldError message={errors.estadoInstitucional?.message} />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="observaciones">Observaciones administrativas</FieldLabel>
              <Textarea
                id="observaciones"
                placeholder="Notas administrativas relevantes (opcional)"
                {...register('observaciones')}
              />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <CalendarCheck2 size={18} className="text-brand-500" />
              <h2 className="text-base font-bold text-ink-primary">
                3. Matriculación inmediata (Ciclo {selectedYearId})
              </h2>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={enrollNow}
                onChange={(e) => setEnrollNow(e.target.checked)}
                className="rounded border-border-strong"
              />
              Matricular al guardar
            </label>
          </div>

          {enrollNow && (
            <div>
              <FieldLabel htmlFor="initial-course">Curso y división de destino</FieldLabel>
              <Select
                id="initial-course"
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
              >
                <option value="">Seleccionar curso (opcional)...</option>
                {activeCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} — Turno {c.shiftName} ({c.legacyCode})
                  </option>
                ))}
              </Select>
              <p className="text-xs text-ink-muted mt-1.5">
                Si seleccionás un curso, se generará la matrícula anual del ciclo {selectedYearId} y
                se sincronizará automáticamente con HOST 28 Educación Física.
              </p>
            </div>
          )}
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/estudiantes')}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={Boolean(duplicateDni)}>
            <Save size={16} />
            Guardar estudiante
          </Button>
        </div>
      </form>
    </div>
  );
};
