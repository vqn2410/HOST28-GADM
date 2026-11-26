import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { listAuditLogs } from '@/repositories/auditRepository';
import { formatDateTimeAR } from '@/lib/utils/formatters';
import { Badge, Card, EmptyState, PageHeader, Select } from '@/components/ui/Primitives';

export const AuditLogsPage: React.FC = () => {
  const [entityFilter, setEntityFilter] = useState('');

  const logsQuery = useQuery({
    queryKey: ['audit-logs', entityFilter],
    queryFn: () => listAuditLogs({ entity: entityFilter || undefined, max: 200 }),
  });

  const rows = logsQuery.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Registro de Auditoría Administrativa"
        subtitle="Trazabilidad inmutable de operaciones críticas. Acceso restringido según rol y minimización de datos sensibles."
        badge={
          <Badge variant="brand">
            <Shield size={11} /> {rows.length} eventos
          </Badge>
        }
      />

      <Card className="p-4 flex gap-3">
        <Select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="w-60"
        >
          <option value="">Todas las entidades</option>
          <option value="students">Estudiantes</option>
          <option value="enrollments">Matrículas</option>
          <option value="certificates">Certificados</option>
          <option value="certificateTemplates">Plantillas</option>
          <option value="academicYears">Ciclos lectivos</option>
          <option value="courses">Cursos</option>
          <option value="schoolSettings">Configuración</option>
          <option value="sgae_users">Usuarios y permisos</option>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="Sin eventos de auditoría"
            description="Las operaciones administrativas relevantes se registran automáticamente aquí."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle uppercase text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Fecha y hora</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Operación</th>
                  <th className="px-4 py-3">Entidad / ID</th>
                  <th className="px-4 py-3">Resumen / Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 whitespace-nowrap font-mono">
                      {formatDateTimeAR(log.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">{log.userName}</span>
                      <span className="block text-[11px] text-ink-muted">{log.userRole}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="neutral">{log.operation}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {log.entity} / {log.entityId}
                    </td>
                    <td className="px-4 py-3 text-ink-secondary max-w-md truncate">
                      {log.reason ||
                        (log.newSummary ? JSON.stringify(log.newSummary) : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
