import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { listAuditLogs } from '@/repositories/auditRepository';
import { formatDateTimeAR } from '@/lib/utils/formatters';
import { Badge, Card, EmptyState, PageHeader, Select } from '@/components/ui/Primitives';

export const AuditPage: React.FC = () => {
  const [entityFilter, setEntityFilter] = useState('');

  const auditQuery = useQuery({
    queryKey: ['audit-logs', entityFilter],
    queryFn: () => listAuditLogs({ entity: entityFilter || undefined, max: 200 }),
  });

  const logs = auditQuery.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Auditoría Administrativa"
        subtitle="Trazabilidad inmutable de operaciones críticas sobre estudiantes, matrículas, certificados, plantillas y permisos."
        badge={<Badge variant="brand">{logs.length} registros</Badge>}
      />

      <Card className="p-4 flex items-center gap-3">
        <Select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="w-64 h-9 text-xs"
        >
          <option value="">Todas las entidades</option>
          <option value="students">Estudiantes</option>
          <option value="enrollments">Matrículas</option>
          <option value="academicYears">Ciclos lectivos</option>
          <option value="courses">Cursos</option>
          <option value="certificates">Certificados</option>
          <option value="certificateTemplates">Plantillas</option>
          <option value="schoolSettings">Configuración institucional</option>
          <option value="sgae_users">Usuarios y permisos</option>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        {logs.length === 0 ? (
          <EmptyState
            title="Sin registros de auditoría"
            description="Cada alta, modificación, emisión o anulación quedará registrada aquí automáticamente."
            icon={<Shield size={22} />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle uppercase text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Fecha y hora</th>
                  <th className="px-4 py-3">Responsable</th>
                  <th className="px-4 py-3">Operación</th>
                  <th className="px-4 py-3">Entidad / ID</th>
                  <th className="px-4 py-3">Resumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {formatDateTimeAR(l.timestamp)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-ink-primary">{l.userName}</span>
                      <span className="block text-[11px] text-ink-muted">
                        DNI {l.userDni} · {l.userRole}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="brand">{l.operation}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono">
                      {l.entity} / {l.entityId}
                    </td>
                    <td className="px-4 py-2.5 text-ink-secondary max-w-xs truncate">
                      {l.reason || (l.newSummary ? JSON.stringify(l.newSummary) : '—')}
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
