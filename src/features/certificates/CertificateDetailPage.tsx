import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Ban,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
  EmptyState,
  FieldLabel,
  Modal,
  PageHeader,
  SkeletonBlock,
  Textarea,
} from '@/components/ui/Primitives';
import { CertificateStatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { cancelCertificate, getCertificateById } from '@/repositories/certificateRepository';
import { logAudit } from '@/repositories/auditRepository';
import { downloadCertificatePdf } from '@/templates/pdf/certificatePdfGenerator';
import {
  formatDateAR,
  formatDateTimeAR,
  formatDniDisplay,
  resolveCertificateValidationUrl,
} from '@/lib/utils/formatters';

export const CertificateDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, can } = useAuth();
  const { settings } = useAcademicYear();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [qrImg, setQrImg] = useState<string>('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const certQuery = useQuery({
    queryKey: ['certificate', id],
    queryFn: () => getCertificateById(id || ''),
    enabled: Boolean(id),
  });

  const cert = certQuery.data;

  useEffect(() => {
    if (cert?.token) {
      const url = resolveCertificateValidationUrl(cert.validationUrl, cert.token);
      void QRCode.toDataURL(url, { width: 200, margin: 1 }).then(setQrImg);
    }
  }, [cert?.validationUrl, cert?.token]);

  if (certQuery.isLoading) {
    return <SkeletonBlock className="h-72 w-full" />;
  }

  if (!cert) {
    return (
      <Card className="p-8">
        <EmptyState
          title="Certificado no encontrado"
          description="El identificador solicitado no corresponde a ningún documento emitido."
          action={
            <Link to="/certificados">
              <Button variant="outline">Volver al historial</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !cancelReason.trim()) return;
    setCancelling(true);
    try {
      await cancelCertificate(cert.id, cancelReason, `${user.apellido}, ${user.nombre}`);
      await logAudit({
        userDni: user.dni,
        userName: `${user.apellido}, ${user.nombre}`,
        userRole: user.roleId,
        operation: 'certificate_cancel',
        entity: 'sgae_certificates',
        entityId: cert.id,
        reason: cancelReason,
      });
      await queryClient.invalidateQueries({ queryKey: ['certificate', id] });
      await queryClient.invalidateQueries({ queryKey: ['certificates'] });
      toast.success('Certificado anulado.');
      setCancelOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al anular.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Certificado N.º ${cert.certificateNumber}`}
        subtitle={`${cert.typeName} · Snapshot histórico inmutable (Plantilla v${cert.templateVersion})`}
        badge={<CertificateStatusBadge status={cert.status} />}
        actions={
          <>
            <Button variant="emerald" size="sm" onClick={() => void downloadCertificatePdf(cert, settings)}>
              <Download size={15} /> Reimprimir / Descargar PDF
            </Button>
            {can('certificates:cancel') && cert.status === 'emitido' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate(
                      `/certificados/nuevo?dni=${cert.studentDni}&reemplaza=${cert.id}`
                    )
                  }
                >
                  <RefreshCw size={15} /> Reemplazar
                </Button>
                <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
                  <Ban size={15} /> Anular
                </Button>
              </>
            )}
            <Link to="/certificados">
              <Button variant="outline" size="sm">
                <ArrowLeft size={15} /> Historial
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-8 p-6 space-y-5">
          <h2 className="font-bold text-ink-primary border-b border-border-subtle pb-3">
            Contenido Histórico Congelado
          </h2>
          <h3 className="text-center font-display font-bold text-lg uppercase">
            {cert.snapshot.renderedTitle}
          </h3>
          <p className="text-sm text-ink-secondary whitespace-pre-line leading-relaxed">
            {cert.snapshot.renderedBody}
          </p>
          {cert.snapshot.observaciones && (
            <p className="text-xs italic text-ink-muted">
              Observaciones: {cert.snapshot.observaciones}
            </p>
          )}

          {cert.status === 'anulado' && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              <strong>Documento anulado:</strong> {cert.cancellationReason} (por {cert.cancelledBy} el{' '}
              {formatDateTimeAR(cert.cancelledAt)})
            </div>
          )}

          {cert.status === 'reemplazado' && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-xs text-amber-800 dark:text-amber-200">
              <strong>Documento reemplazado</strong> por el certificado N.º{' '}
              <span className="font-mono font-bold">{cert.replacedByCertificateNumber}</span>.
            </div>
          )}
        </Card>

        <Card className="lg:col-span-4 p-6 space-y-4">
          <h2 className="font-bold text-ink-primary border-b border-border-subtle pb-3">
            Validación QR y Metadatos
          </h2>
          {qrImg && (
            <div className="flex flex-col items-center p-4 rounded-xl bg-white border border-border-subtle">
              <img src={qrImg} alt="Código QR de validación" className="w-40 h-40" />
              <Link
                to={`/validar/${cert.token}`}
                target="_blank"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
              >
                Abrir página pública <ExternalLink size={12} />
              </Link>
            </div>
          )}
          <dl className="space-y-2 text-xs">
            <div>
              <dt className="text-ink-muted">Estudiante</dt>
              <dd className="font-semibold">
                {cert.snapshot.apellidoNombre} (DNI {formatDniDisplay(cert.snapshot.dni)})
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Curso / Turno / Ciclo</dt>
              <dd>
                {cert.snapshot.anio} {cert.snapshot.division} · {cert.snapshot.turno} · Ciclo{' '}
                {cert.snapshot.cicloLectivo}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Fecha de emisión documental</dt>
              <dd>{formatDateAR(cert.issueDate)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Generación real (Argentina)</dt>
              <dd>{formatDateTimeAR(cert.generatedAt)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Emitido por</dt>
              <dd>{cert.issuedByName}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Token</dt>
              <dd className="font-mono break-all text-[11px]">{cert.token}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Anular certificado ${cert.certificateNumber}`}
      >
        <form onSubmit={handleCancel} className="space-y-4">
          <div>
            <FieldLabel required>Motivo de anulación</FieldLabel>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
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
