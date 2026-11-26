import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, ShieldCheck, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { ROLE_DEFINITIONS } from '@/lib/permissions/rbac';
import {
  listEfBaseUsers,
  listSgaeUsers,
  upsertSgaeUser,
} from '@/repositories/settingsAndUsersRepository';
import { logAudit } from '@/repositories/auditRepository';
import { formatDniDisplay } from '@/lib/utils/formatters';
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
import type { RoleId, SgaeUser } from '@/types/domain';

export const UsersManagementPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const sgaeUsersQuery = useQuery({ queryKey: ['sgae-users'], queryFn: listSgaeUsers });
  const efUsersQuery = useQuery({ queryKey: ['ef-users'], queryFn: listEfBaseUsers });

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    dni: string;
    apellido: string;
    nombre: string;
    correo: string;
    roleId: RoleId;
    active: boolean;
    passwordForNewUser: string;
    isEdit: boolean;
  }>({
    dni: '',
    apellido: '',
    nombre: '',
    correo: '',
    roleId: 'secretaria',
    active: true,
    passwordForNewUser: '',
    isEdit: false,
  });

  const sgaeDnis = new Set((sgaeUsersQuery.data ?? []).map((u) => u.dni));
  const pendingEfUsers = (efUsersQuery.data ?? []).filter((u) => !sgaeDnis.has(u.dni));

  const openNew = () => {
    setForm({
      dni: '',
      apellido: '',
      nombre: '',
      correo: '',
      roleId: 'secretaria',
      active: true,
      passwordForNewUser: '',
      isEdit: false,
    });
    setModalOpen(true);
  };

  const openFromEf = (ef: {
    dni: string;
    apellido: string;
    nombre: string;
    correo: string;
  }) => {
    setForm({
      dni: ef.dni,
      apellido: ef.apellido,
      nombre: ef.nombre,
      correo: ef.correo,
      roleId: 'preceptoria',
      active: true,
      passwordForNewUser: '',
      isEdit: false,
    });
    setModalOpen(true);
  };

  const openEdit = (u: SgaeUser) => {
    setForm({
      dni: u.dni,
      apellido: u.apellido,
      nombre: u.nombre,
      correo: u.correo,
      roleId: u.roleId,
      active: u.active,
      passwordForNewUser: '',
      isEdit: true,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const saved = await upsertSgaeUser(form);
      await logAudit({
        userDni: user.dni,
        userName: `${user.apellido}, ${user.nombre}`,
        userRole: user.roleId,
        operation: form.isEdit ? 'user_permissions_update' : 'user_create',
        entity: 'sgae_users',
        entityId: saved.dni,
        newSummary: { roleId: saved.roleId, active: saved.active },
      });
      await queryClient.invalidateQueries({ queryKey: ['sgae-users'] });
      toast.success(`Usuario ${saved.apellido}, ${saved.nombre} guardado.`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar usuario.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios del Sistema SGAE"
        subtitle="Control de acceso independiente del Host de Educación Física. Ningún usuario de EF recibe acceso automático sin habilitación explícita."
        actions={
          <Button size="sm" onClick={openNew}>
            <UserPlus size={15} /> Nuevo usuario
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border-subtle font-bold text-sm">
          Usuarios habilitados en SGAE ({sgaeUsersQuery.data?.length ?? 0})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-subtle text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-3">Personal</th>
                <th className="px-4 py-3">DNI</th>
                <th className="px-4 py-3">Rol SGAE</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {(sgaeUsersQuery.data ?? []).map((u) => (
                <tr key={u.dni}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">
                      {u.apellido}, {u.nombre}
                    </p>
                    <p className="text-xs text-ink-muted">{u.correo}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{formatDniDisplay(u.dni)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="brand">
                      <ShieldCheck size={11} /> {ROLE_DEFINITIONS[u.roleId]?.name ?? u.roleId}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={u.active ? 'success' : 'danger'}>
                      {u.active ? 'Activo' : 'Deshabilitado'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                      <Edit2 size={14} /> Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {pendingEfUsers.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border-subtle">
            <h2 className="font-bold text-sm">
              Personal registrado en HOST28_EF sin acceso a SGAE ({pendingEfUsers.length})
            </h2>
            <p className="text-xs text-ink-muted">
              Podés habilitar selectivamente a un integrante asignándole un rol administrativo.
            </p>
          </div>
          <div className="divide-y divide-border-subtle">
            {pendingEfUsers.map((ef) => (
              <div key={ef.dni} className="px-4 py-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-sm">
                    {ef.apellido}, {ef.nombre}
                  </span>
                  <span className="text-ink-muted ml-2 font-mono">DNI {ef.dni}</span>
                  <span className="text-ink-muted ml-2">· Rol EF: {ef.rol}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => openFromEf(ef)}>
                  Habilitar en SGAE
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.isEdit ? 'Editar usuario SGAE' : 'Habilitar / Crear usuario SGAE'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel required>DNI</FieldLabel>
              <Input
                value={form.dni}
                disabled={form.isEdit}
                onChange={(e) => setForm({ ...form, dni: e.target.value })}
                required
              />
            </div>
            <div>
              <FieldLabel required>Rol SGAE</FieldLabel>
              <Select
                value={form.roleId}
                onChange={(e) => setForm({ ...form, roleId: e.target.value as RoleId })}
              >
                {Object.values(ROLE_DEFINITIONS).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel required>Apellido</FieldLabel>
              <Input
                value={form.apellido}
                onChange={(e) => setForm({ ...form, apellido: e.target.value })}
                required
              />
            </div>
            <div>
              <FieldLabel required>Nombre</FieldLabel>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <FieldLabel>Correo institucional</FieldLabel>
            <Input
              type="email"
              value={form.correo}
              onChange={(e) => setForm({ ...form, correo: e.target.value })}
            />
          </div>
          {!form.isEdit && (
            <div className="p-3 rounded-xl bg-surface-subtle border border-border-subtle text-xs text-ink-secondary">
              <strong>Contraseña compartida con HOST28_EF:</strong> si el DNI ya existe en
              Educación Física, utilizará exactamente la misma clave. Si es un usuario nuevo, su
              contraseña inicial será su propio DNI (igual que en HOST28_EF).
            </div>
          )}
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Usuario activo en SGAE
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Guardar usuario
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
