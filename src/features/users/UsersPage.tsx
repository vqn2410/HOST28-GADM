import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, ShieldCheck } from 'lucide-react';
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

export const UsersPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const usersQuery = useQuery({ queryKey: ['sgae-users'], queryFn: listSgaeUsers });
  const efUsersQuery = useQuery({ queryKey: ['ef-base-users'], queryFn: listEfBaseUsers });

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
  }>({
    dni: '',
    apellido: '',
    nombre: '',
    correo: '',
    roleId: 'secretaria',
    active: true,
    passwordForNewUser: '',
  });

  const openEdit = (u: SgaeUser) => {
    setForm({
      dni: u.dni,
      apellido: u.apellido,
      nombre: u.nombre,
      correo: u.correo,
      roleId: u.roleId,
      active: u.active,
      passwordForNewUser: '',
    });
    setModalOpen(true);
  };

  const openFromEfUser = (ef: { dni: string; apellido: string; nombre: string; correo: string }) => {
    setForm({
      dni: ef.dni,
      apellido: ef.apellido,
      nombre: ef.nombre,
      correo: ef.correo,
      roleId: 'preceptoria',
      active: true,
      passwordForNewUser: '',
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
        operation: 'user_permissions_update',
        entity: 'sgae_users',
        entityId: saved.dni,
        newSummary: { roleId: saved.roleId, active: saved.active },
      });
      await queryClient.invalidateQueries({ queryKey: ['sgae-users'] });
      toast.success(`Usuario ${saved.apellido}, ${saved.nombre} actualizado en SGAE.`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar usuario.');
    } finally {
      setSaving(false);
    }
  };

  const sgaeDniSet = new Set((usersQuery.data ?? []).map((u) => u.dni));
  const nonEnabledEfUsers = (efUsersQuery.data ?? []).filter((u) => !sgaeDniSet.has(u.dni));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios Habilitados en SGAE"
        subtitle="Control de acceso independiente del Host de Educación Física. Solo los usuarios habilitados aquí pueden operar módulos administrativos."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setForm({
                dni: '',
                apellido: '',
                nombre: '',
                correo: '',
                roleId: 'secretaria',
                active: true,
                passwordForNewUser: '',
              });
              setModalOpen(true);
            }}
          >
            <UserPlus size={15} /> Nuevo usuario SGAE
          </Button>
        }
      />

      <Card className="overflow-hidden">
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
            {(usersQuery.data ?? []).map((u) => (
              <tr key={u.dni}>
                <td className="px-4 py-3">
                  <p className="font-semibold">
                    {u.apellido}, {u.nombre}
                  </p>
                  <p className="text-xs text-ink-muted">{u.correo || '—'}</p>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{formatDniDisplay(u.dni)}</td>
                <td className="px-4 py-3">
                  <Badge variant="brand">
                    <ShieldCheck size={12} /> {ROLE_DEFINITIONS[u.roleId]?.name ?? u.roleId}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={u.active ? 'success' : 'danger'}>
                    {u.active ? 'Activo' : 'Deshabilitado'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                    Editar permisos
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {nonEnabledEfUsers.length > 0 && (
        <Card className="p-5 space-y-3">
          <h2 className="font-bold text-sm text-ink-primary">
            Personal existente en HOST28_EF sin acceso administrativo en SGAE
          </h2>
          <p className="text-xs text-ink-secondary">
            Por seguridad, los usuarios del Host de Educación Física no heredan permisos en SGAE
            automáticamente. Podés habilitarlos explícitamente asignando un rol:
          </p>
          <div className="divide-y divide-border-subtle text-sm">
            {nonEnabledEfUsers.map((ef) => (
              <div key={ef.dni} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-medium">
                    {ef.apellido}, {ef.nombre}
                  </span>{' '}
                  <span className="text-xs text-ink-muted">
                    (DNI {ef.dni} · Rol EF: {ef.rol})
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={() => openFromEfUser(ef)}>
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
        title="Configurar usuario SGAE"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel required>DNI</FieldLabel>
              <Input
                value={form.dni}
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
          <div>
            <FieldLabel>Contraseña inicial (solo si es usuario nuevo)</FieldLabel>
            <Input
              type="password"
              value={form.passwordForNewUser}
              onChange={(e) => setForm({ ...form, passwordForNewUser: e.target.value })}
              placeholder="Dejar vacío si el usuario ya existe en HOST28_EF"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Usuario habilitado para iniciar sesión en SGAE
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
