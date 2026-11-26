import React from 'react';
import { Check, Minus } from 'lucide-react';
import { ALL_PERMISSIONS, ROLE_DEFINITIONS } from '@/lib/permissions/rbac';
import { Card, PageHeader } from '@/components/ui/Primitives';

export const RolesPermissionsPage: React.FC = () => {
  const roles = Object.values(ROLE_DEFINITIONS);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Matriz de Roles y Permisos (RBAC)"
        subtitle="Control de acceso por principio de mínimo privilegio, verificado tanto en interfaz como en operaciones administrativas."
      />

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-surface-subtle uppercase text-ink-muted">
            <tr>
              <th className="px-4 py-3">Permiso</th>
              <th className="px-4 py-3">Módulo</th>
              {roles.map((r) => (
                <th key={r.id} className="px-4 py-3 text-center">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {ALL_PERMISSIONS.map((perm) => (
              <tr key={perm.id}>
                <td className="px-4 py-2.5 font-medium text-ink-primary">{perm.label}</td>
                <td className="px-4 py-2.5 text-ink-muted">{perm.group}</td>
                {roles.map((r) => {
                  const granted = r.permissions.includes(perm.id);
                  return (
                    <td key={r.id} className="px-4 py-2.5 text-center">
                      {granted ? (
                        <Check size={16} className="text-emerald-brand-500 mx-auto" />
                      ) : (
                        <Minus size={14} className="text-ink-muted/40 mx-auto" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};
