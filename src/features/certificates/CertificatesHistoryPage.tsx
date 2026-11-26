import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileBadge2,
  Download,
  Eye,
  Ban,
  Search,
  Layers,
  Plus,
} from 'lucide-react';
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
  Textarea,
} from '@/components/ui/Primitives';
import { CertificateStatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { cancelCertificate, listCertificates } from '@/repositories/certificateRepository';
import { logAudit } from '@/repositories/auditRepository';
import { downloadCertificatePdf } from '@/templates/pdf/certificatePdfGenerator';
import { formatDateAR, formatDateTimeAR, formatDniDisplay } from '@/lib/utils/formatters';
import type { Certificate } from '@/types/domain';

export const CertificatesHistoryPage: React.FC = () => {
  const { user, can } = useAuth();
  const { selectedYearId, settings } = useAcademicYear();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [yearScope, setYearScope] = useState<'selected' | 'all'>('selected');

  const [cancelTarget, setCancelTarget] = useState<Certificate | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const certsQuery = useQuery({
    queryKey: ['certificates', yearScope === 'selected' ? selectedYearId : 'all'],
    queryFn: () =>
      yearScope === 'selected'
        ? listCertificates({ academicYearId: selectedYearId })
        : listCertificates(),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (certsQuery.data ?? []).filter((c) => {
      if (typeFilter !== 'todos' && c.typeCode !== typeFilter) return false;
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      if (q) {
        const hay =
          `${c.certificateNumber} ${c.token} ${c.studentDni} ${c.snapshot.apellidoNombre} ${c.issuedByName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [certsQuery.data, search, typeFilter, statusFilter]);

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget || !user || !cancelReason.trim()) return;
    setCancelling(true);
    try {
      await cancelCertificate(cancelTarget.id, cancelReason, `${user.apellido}, ${user.nombre}`);
      await logAudit({
        userDni: user.dni,
        userName: `${user.apellido}, ${user.nombre}`,
        userRole: user.roleId,
        operation: 'certificate_cancel',
        entity: 'sgae_certificates',
        entityId: cancelTarget.id,
        reason: cancelReason,
        newSummary: { certificateNumber: cancelTarget.certificateNumber, status: 'anulado' },
      });
      await queryClient.invalidateQueries({ queryKey: ['certificates'] });
      toast.success(`Certificado ${cancelTarget.certificateNumber} anulado.`);
      setCancelTarget(null);
      setCancelReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al anular certificado.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Historial de Certificados y Constancias"
        subtitle="Registro inmutable de documentos emitidos con snapshot histórico, numeración correlativa y validación QR."
        badge={<Badge variant="brand">{filtered.length} documentos</Badge>}
        actions={
          <>
            {can('certificates:issue_bulk') && (
              <Link to="/certificados/emision-masiva">
                <Button variant="outline" size="sm">
                  <Layers size={15} /> Emisión masiva
                </Button>
              </Link>
            )}
            {can('certificates:issue') && (
              <Link to="/certificados/nuevo">
                <Button size="sm">
                  <Plus size={15} /> Emitir certificado
                </Button>
              </Link>
            )}
          </>
        }
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5 relative">
            <Search size={15} className="absolute left-3.5 top-3 text-ink-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por DNI, estudiante, número (2026-000001) o token..."
              className="pl-10"
            />
          </div>
          <div className="md:col-span-3">
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="todos">Todos los tipos</option>
              <option value="alumno_regular">Alumno regular</option>
              <option value="salario_familiar">Salario familiar</option>
              <option value="constancia_general">Constancia general</option>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="todos">Todos los estados</option>
              <option value="emitido">Emitidos</option>
              <option value="anulado">Anulados</option>
              <option value="reemplazado">Reemplazados</option>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select
              value={yearScope}
              onChange={(e) => setYearScope(e.target.value as 'selected' | 'all')}
            >
              <option value="selected">Ciclo {selectedYearId}</option>
              <option value="all">Todos los ciclos</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            title="No se registran certificados para este filtro"
            description="Emití un certificado individual o masivo para comenzar a construir el archivo documental."
            icon={<FileBadge2 size={22} />}
            action={
              can('certificates:issue') ? (
                <Link to="/certificados/nuevo">
                  <Button size="sm">Emitir certificado</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-surface-subtle/70 text-xs uppercase text-ink-muted border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3">N.º Certificado</th>
                  <th className="px-4 py-3">Estudiante</th>
                  <th className="px-4 py-3">Tipo / Curso</th>
                  <th className="px-4 py-3">Emisión / Generación</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-subtle/40">
                    <td className="px-4 py-3">
                      <Link
                        to={`/certificados/${c.id}`}
                        className="font-mono font-bold text-xs text-brand-600 dark:text-brand-300 hover:underline"
                      >
                        {c.certificateNumber}
                      </Link>
                      <p className="text-[11px] font-mono text-ink-muted truncate max-w-36">
                        {c.token}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-primary">{c.snapshot.apellidoNombre}</p>
                      <p className="text-xs font-mono text-ink-muted">
                        DNI {formatDniDisplay(c.snapshot.dni)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-semibold text-ink-primary">{c.typeName}</p>
                      <p className="text-ink-muted">
                        {c.snapshot.anio} {c.snapshot.division} · {c.snapshot.turno} (
                        {c.snapshot.cicloLectivo})
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-medium">{formatDateAR(c.issueDate)}</p>
                      <p className="text-[11px] text-ink-muted">
                        {formatDateTimeAR(c.generatedAt)} · {c.issuedByName}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <CertificateStatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link to={`/certificados/${c.id}`}>
                          <Button variant="ghost" size="sm" title="Ver detalle y QR">
                            <Eye size={14} />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Descargar / Reimprimir PDF original"
                          onClick={() => void downloadCertificatePdf(c, settings)}
                        >
                          <Download size={14} />
                        </Button>
                        {can('certificates:cancel') && c.status === 'emitido' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Anular certificado"
                            onClick={() => setCancelTarget(c)}
                          >
                            <Ban size={14} className="text-red-500" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title={`Anular certificado ${cancelTarget?.certificateNumber ?? ''}`}
        subtitle="Los certificados emitidos son inmutables. Si contiene un error, anulalo aquí y emití un reemplazo."
      >
        <form onSubmit={handleConfirmCancel} className="space-y-4">
          <div>
            <FieldLabel required>Motivo de anulación</FieldLabel>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ej. Error en el destinatario / Solicitud duplicada..."
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCancelTarget(null)}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" loading={cancelling}>
              Confirmar anulación
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
