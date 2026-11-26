import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, CheckCircle2, Lock, Star } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  FieldLabel,
  Input,
  Modal,
  PageHeader,
  Select,
} from '@/components/ui/Primitives';
import { AcademicYearStatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { saveAcademicYear } from '@/repositories/academicRepository';
import { logAudit } from '@/repositories/auditRepository';
import { formatDateAR } from '@/lib/utils/formatters';
import type { AcademicYear, AcademicYearStatus } from '@/types/domain';

export const AcademicYearsPage: React.FC = () => {
  const { user, can } = useAuth();
  const { academicYears, selectedYearId, setSelectedYearId, refetchYears } = useAcademicYear();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AcademicYear | null>(null);
  const [form, setForm] = useState({
    year: new Date().getFullYear() + 1,
    startDate: `${new Date().getFullYear() + 1}-03-01`,
    endDate: `${new Date().getFullYear() + 1}-12-18`,
    status: 'planificacion' as AcademicYearStatus,
    isDefault: false,
    initializeDefaultCourses: true,
  });

  const openCreate = () => {
    const nextYear = Math.max(...academicYears.map((y) => y.year), 2026) + 1;
    setEditing(null);
    setForm({
      year: nextYear,
      startDate: `${nextYear}-03-01`,
      endDate: `${nextYear}-12-18`,
      status: 'planificacion',
      isDefault: false,
      initializeDefaultCourses: true,
    });
    setModalOpen(true);
  };

  const openEdit = (y: AcademicYear) => {
    setEditing(y);
    setForm({
      year: y.year,
      startDate: y.startDate,
      endDate: y.endDate,
      status: y.status,
      isDefault: y.isDefault,
      initializeDefaultCourses: false,
    });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const saved = await saveAcademicYear({
        year: Number(form.year),
        startDate: form.startDate,
        endDate: form.endDate,
        status: form.status,
        isDefault: form.isDefault,
        createdBy: user.dni,
        initializeDefaultCourses: form.initializeDefaultCourses,
      });
      await logAudit({
        userDni: user.dni,
        userName: `${user.apellido}, ${user.nombre}`,
        userRole: user.roleId,
        operation: editing ? 'academic_year_update' : 'academic_year_create',
        entity: 'sgae_academic_years',
        entityId: saved.id,
        newSummary: { status: saved.status, isDefault: saved.isDefault },
      });
      return saved;
    },
    onSuccess: () => {
      toast.success(editing ? 'Ciclo lectivo actualizado.' : 'Ciclo lectivo creado.');
      setModalOpen(false);
      refetchYears();
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al guardar ciclo.'),
  });

  return (
    <div>
      <PageHeader
        title="Ciclos Lectivos"
        subtitle="Cada ciclo lectivo administra su propia estructura de cursos, divisiones, turnos y matrícula preservando el historial."
        actions={
          can('academic_years:manage') && (
            <Button size="sm" onClick={openCreate}>
              <CalendarPlus size={15} />
              Nuevo ciclo lectivo
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {academicYears.map((y) => {
          const isSelected = y.id === selectedYearId;
          return (
            <Card
              key={y.id}
              className={`p-5 flex flex-col justify-between transition-all ${
                isSelected ? 'ring-2 ring-brand-500 border-brand-500' : ''
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-2xl font-extrabold font-display text-ink-primary">
                      Ciclo {y.year}
                    </h2>
                    <p className="text-xs text-ink-secondary mt-1">
                      {formatDateAR(y.startDate)} — {formatDateAR(y.endDate)}
                    </p>
                  </div>
                  <AcademicYearStatusBadge status={y.status} />
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  {y.isDefault && (
                    <Badge variant="brand">
                      <Star size={11} /> Predeterminado
                    </Badge>
                  )}
                  {isSelected && (
                    <Badge variant="success">
                      <CheckCircle2 size={11} /> En visualización
                    </Badge>
                  )}
                  {y.status === 'cerrado' && (
                    <Badge variant="neutral">
                      <Lock size={11} /> Solo lectura histórica
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 mt-5 pt-4 border-t border-border-subtle">
                <Button
                  variant={isSelected ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedYearId(y.id);
                    toast.info(`Contexto global cambiado a Ciclo ${y.year}.`);
                  }}
                >
                  {isSelected ? 'Seleccionado' : 'Seleccionar ciclo'}
                </Button>
                {can('academic_years:manage') && (
                  <Button variant="ghost" size="sm" onClick={() => openEdit(y)}>
                    Configurar
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Configurar Ciclo Lectivo ${editing.year}` : 'Nuevo Ciclo Lectivo'}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Año lectivo</FieldLabel>
              <Input
                type="number"
                value={form.year}
                disabled={Boolean(editing)}
                onChange={(e) => setForm((p) => ({ ...p, year: Number(e.target.value) }))}
              />
            </div>
            <div>
              <FieldLabel required>Estado</FieldLabel>
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm((p) => ({ ...p, status: e.target.value as AcademicYearStatus }))
                }
              >
                <option value="planificacion">En planificación</option>
                <option value="activo">Activo</option>
                <option value="cerrado">Cerrado</option>
              </Select>
            </div>
            <div>
              <FieldLabel required>Fecha de inicio</FieldLabel>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
              />
            </div>
            <div>
              <FieldLabel required>Fecha de finalización</FieldLabel>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
              />
              Establecer como ciclo lectivo predeterminado del sistema
            </label>
            {!editing && (
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.initializeDefaultCourses}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, initializeDefaultCourses: e.target.checked }))
                  }
                />
                Crear automáticamente la estructura base de cursos de la E.E.S. N° 28 (1° a 6°)
              </label>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setModalOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
            Guardar ciclo
          </Button>
        </div>
      </Modal>
    </div>
  );
};
