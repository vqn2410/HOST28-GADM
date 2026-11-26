import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  QrCode,
  ShieldCheck,
  Search,
  Lock,
} from 'lucide-react';
import { Button, Card, FieldLabel, Input } from '@/components/ui/Primitives';
import { validateCertificatePublic } from '@/repositories/certificateRepository';
import { formatDateAR } from '@/lib/utils/formatters';
import type { PublicValidationResponse } from '@/types/domain';

export const PublicValidationPage: React.FC = () => {
  const { token: urlToken } = useParams<{ token?: string }>();
  const navigate = useNavigate();

  const [manualToken, setManualToken] = useState(urlToken || '');
  const [dniInput, setDniInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PublicValidationResponse | null>(null);

  // Evitar indexación por motores de búsqueda (Ley 25.326)
  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const created = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    const prev = meta.content;
    meta.content = 'noindex, nofollow, noarchive';
    return () => {
      if (created && meta) meta.remove();
      else if (meta) meta.content = prev;
    };
  }, []);

  const runValidation = async (tokenValue: string, dniCheck?: string) => {
    if (!tokenValue.trim()) return;
    setLoading(true);
    try {
      const res = await validateCertificatePublic(tokenValue.trim(), dniCheck);
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (urlToken) {
      setManualToken(urlToken);
      void runValidation(urlToken);
    }
  }, [urlToken]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualToken.trim();
    if (!cleaned) return;
    navigate(`/validar/${encodeURIComponent(cleaned)}`);
  };

  const handleVerifyDni = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim() || !dniInput.trim()) return;
    void runValidation(manualToken.trim(), dniInput.trim());
  };

  const cert = result?.certificate;

  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col">
      {/* Encabezado institucional */}
      <header className="institutional-banner text-white py-6 px-4">
        <div className="max-w-3xl mx-auto relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-white p-1.5 shadow-md shrink-0">
              <img src="/logo.png" alt="Logo E.E.S. N° 28" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-blue-200 font-semibold">
                Provincia de Buenos Aires · Distrito de Lanús
              </p>
              <h1 className="font-display font-bold text-lg sm:text-xl leading-tight">
                Validación Documental Institucional
              </h1>
            </div>
          </div>
          <Link
            to="/login"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          >
            Acceso personal
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 space-y-6">
        {/* Buscador manual por token */}
        <Card className="p-5">
          <form onSubmit={handleManualSubmit} className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 w-full">
              <FieldLabel htmlFor="token-input">
                Ingresar token de validación manualmente
              </FieldLabel>
              <Input
                id="token-input"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Pegá el token impreso al pie del certificado..."
              />
            </div>
            <Button type="submit" loading={loading} className="w-full sm:w-auto">
              <Search size={15} /> Verificar documento
            </Button>
          </form>
        </Card>

        {/* Estado inicial sin token */}
        {!urlToken && !result && (
          <Card className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-900/40 text-brand-600 flex items-center justify-center mx-auto">
              <QrCode size={24} />
            </div>
            <h2 className="font-bold text-ink-primary">
              Verificá la emisión de certificados escolares
            </h2>
            <p className="text-sm text-ink-secondary max-w-md mx-auto">
              Escaneá el código QR impreso al pie del certificado o ingresá el token de validación
              en el campo superior.
            </p>
          </Card>
        )}

        {/* Resultado */}
        {result && (
          <Card className="overflow-hidden">
            {/* Banner de estado */}
            {result.state === 'verified' && (
              <div className="bg-emerald-brand-500 text-white px-6 py-4 flex items-center gap-3">
                <CheckCircle2 size={24} className="shrink-0" />
                <div>
                  <p className="font-display font-extrabold text-base tracking-wide">
                    DOCUMENTO REGISTRADO — EMISIÓN VERIFICADA
                  </p>
                  <p className="text-xs text-emerald-50">
                    El certificado se encuentra vigente en el registro institucional.
                  </p>
                </div>
              </div>
            )}

            {result.state === 'cancelled' && (
              <div className="bg-red-600 text-white px-6 py-4 flex items-center gap-3">
                <XCircle size={24} className="shrink-0" />
                <div>
                  <p className="font-display font-extrabold text-base tracking-wide">
                    DOCUMENTO ANULADO
                  </p>
                  <p className="text-xs text-red-100">
                    Este certificado fue anulado por la institución educativa.
                    {cert?.cancellationReason ? ` Motivo: ${cert.cancellationReason}` : ''}
                  </p>
                </div>
              </div>
            )}

            {result.state === 'replaced' && (
              <div className="bg-amber-600 text-white px-6 py-4 flex items-center gap-3">
                <AlertTriangle size={24} className="shrink-0" />
                <div>
                  <p className="font-display font-extrabold text-base tracking-wide">
                    DOCUMENTO REEMPLAZADO
                  </p>
                  <p className="text-xs text-amber-50">
                    Este documento fue sustituido por el certificado N.º{' '}
                    {cert?.replacedByCertificateNumber || 'posterior'}.
                  </p>
                </div>
              </div>
            )}

            {result.state === 'not_found' && (
              <div className="p-8 text-center space-y-2">
                <HelpCircle size={32} className="mx-auto text-ink-muted" />
                <h2 className="font-bold text-ink-primary">Token inexistente</h2>
                <p className="text-sm text-ink-secondary">{result.message}</p>
              </div>
            )}

            {result.state === 'error' && (
              <div className="p-8 text-center space-y-2">
                <AlertTriangle size={32} className="mx-auto text-amber-500" />
                <h2 className="font-bold text-ink-primary">Error temporal de validación</h2>
                <p className="text-sm text-ink-secondary">{result.message}</p>
              </div>
            )}

            {/* Datos del documento verificado */}
            {cert && (
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-border-subtle">
                  <img
                    src={cert.logoUrl || '/logo.png'}
                    alt="Logo escolar"
                    className="w-11 h-11 object-contain"
                  />
                  <div>
                    <p className="font-bold text-ink-primary">{cert.institutionName}</p>
                    <p className="text-xs text-ink-secondary">{cert.typeName}</p>
                  </div>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-ink-muted uppercase font-semibold">Estudiante</dt>
                    <dd className="font-bold text-ink-primary mt-0.5">{cert.studentDisplay}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted uppercase font-semibold">DNI</dt>
                    <dd className="font-mono font-bold text-ink-primary mt-0.5">
                      {cert.dniFull || cert.dniMasked}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted uppercase font-semibold">
                      Año / División / Turno
                    </dt>
                    <dd className="text-ink-primary mt-0.5">
                      {cert.year} año, {cert.division} división — Turno {cert.shift}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted uppercase font-semibold">Ciclo lectivo</dt>
                    <dd className="text-ink-primary mt-0.5">{cert.academicYear}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted uppercase font-semibold">
                      Fecha y lugar de emisión
                    </dt>
                    <dd className="text-ink-primary mt-0.5">
                      {formatDateAR(cert.issueDate)} · {cert.issuePlace}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted uppercase font-semibold">
                      N.º de certificado
                    </dt>
                    <dd className="font-mono font-semibold text-ink-primary mt-0.5">
                      {cert.certificateNumber}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted uppercase font-semibold">Tipo de firma</dt>
                    <dd className="text-ink-primary mt-0.5">Ológrafa (manuscrita y sello)</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted uppercase font-semibold">
                      Token de validación
                    </dt>
                    <dd className="font-mono text-xs text-ink-secondary break-all mt-0.5">
                      {cert.token}
                    </dd>
                  </div>
                </dl>

                {/* Verificación adicional por DNI (Ley 25.326) */}
                {!result.verifiedDniMatch && (
                  <form
                    onSubmit={handleVerifyDni}
                    className="p-4 rounded-xl bg-surface-subtle border border-border-subtle space-y-3"
                  >
                    <div className="flex items-start gap-2 text-xs text-ink-secondary">
                      <Lock size={15} className="text-brand-500 shrink-0 mt-0.5" />
                      <span>
                        Por protección de datos personales (Ley 25.326), el nombre y el DNI se
                        muestran parcialmente ocultos. Ingresá el DNI que figura en el documento
                        impreso para confirmar los datos completos.
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={dniInput}
                        onChange={(e) => setDniInput(e.target.value)}
                        placeholder="Ingresá el DNI sin puntos"
                        inputMode="numeric"
                      />
                      <Button type="submit" variant="outline" loading={loading}>
                        Confirmar DNI
                      </Button>
                    </div>
                  </form>
                )}

                {/* Leyenda obligatoria */}
                <div className="p-4 rounded-xl bg-brand-50/70 dark:bg-brand-900/25 border border-brand-200 dark:border-brand-800 text-xs text-ink-secondary leading-relaxed flex items-start gap-2.5">
                  <ShieldCheck size={16} className="text-brand-600 shrink-0 mt-0.5" />
                  <p>{cert.disclaimer}</p>
                </div>
              </div>
            )}
          </Card>
        )}
      </main>
    </div>
  );
};
