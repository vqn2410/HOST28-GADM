import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  FieldLabel,
  Input,
  Modal,
  PageHeader,
} from '@/components/ui/Primitives';
import { listShifts, saveShift } from '@/repositories/academicRepository';
import { useAuth } from '@/providers/AuthProvider';
import type { Shift } from '@/types/domain';

export const ShiftsPage: React.FC = () => {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const shiftsQuery = useQuery({ queryKey: ['shifts'], queryFn: listShifts });
  const shifts = shiftsQuery.data ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Omit<Shift, 'id'> & { id?: string }>({
    name: '',
    code: '',
    startTime: '',
    endTime: '',
    active: true,
  });

  const saveMutation = useMutation({
    mutationFn: () => saveShift(form),
    onSuccess: () => {
      toast.success('Turno guardado correctamente.');
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al guardar turno'),
  });

  return (
    <div>
      <PageHeader
        title="Gestión de Turnos"
        subtitle="Turnos escolares configurables (Mañana, Tarde, Vespertino, Noche y turnos personalizados)."
        actions={
          can('academic_years:manage') && (
            <Button
              size="sm"
              onClick={() => {
                setForm({ name: '', code: '', startTime: '', endTime: '', active: true });
                setModalOpen(true);
              }}
            >
              <Plus size={15} />
              Nuevo turno
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {shifts.map((s) => (
          <Card key={s.id} className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between">
                <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-900/40 text-brand-600">
                  <Clock size={18} />
                </div>
                <Badge variant={s.active ? 'success' : 'neutral'}>
                  {s.active ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
              <h3 className="text-lg font-bold text-ink-primary mt-3">{s.name}</h3>
              <p className="text-xs text-ink-muted font-mono">Código: {s.code}</p>
              {(s.startTime || s.endTime) && (
                <p className="text-xs text-ink-secondary mt-2">
                  Franja horaria: {s.startTime || '—'} a {s.endTime || '—'}
                </p>
              )}
            </div>
            {can('academic_years:manage') && (
              <div className="mt-4 pt-3 border-t border-border-subtle">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setForm(s);
                    setModalOpen(true);
                  }}
                >
                  Editar
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? `Editar turno ${form.name}` : 'Nuevo turno escolar'}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Nombre del turno</FieldLabel>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ej. Mañana, Intermedio..."
              />
            </div>
            <div>
              <FieldLabel required>Código</FieldLabel>
              <Input
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                placeholder="M, T, V, N"
                maxLength={5}
              />
            </div>
            <div>
              <FieldLabel>Hora inicio</FieldLabel>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
              />
            </div>
            <div>
              <FieldLabel>Hora fin</FieldLabel>
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
            />
            Turno habilitado para nuevos cursos
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setModalOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            disabled={!form.name.trim() || !form.code.trim()}
          >
            Guardar turno
          </Button>
        </div>
      </Modal>
    </div>
  );
};
