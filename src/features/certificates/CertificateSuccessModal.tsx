import React, { useState } from 'react';
import { CheckCircle2, Download, Printer, PlusCircle } from 'lucide-react';
import {
  downloadCertificatePdf,
  printCertificatePdf,
} from '@/templates/pdf/certificatePdfGenerator';
import { formatDateAR, formatDniDisplay } from '@/lib/utils/formatters';
import { Badge, Button, Modal } from '@/components/ui/Primitives';
import type { Certificate, SchoolSettings } from '@/types/domain';

interface CertificateSuccessModalProps {
  certificate: Certificate | null;
  settings: SchoolSettings;
  onGenerateNew: () => void;
  onClose: () => void;
}

export const CertificateSuccessModal: React.FC<CertificateSuccessModalProps> = ({
  certificate,
  settings,
  onGenerateNew,
  onClose,
}) => {
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!certificate) return null;

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printCertificatePdf(certificate, settings);
    } finally {
      setPrinting(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadCertificatePdf(certificate, settings);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      open={Boolean(certificate)}
      onClose={onClose}
      title="Constancia generada con éxito"
      subtitle="El documento ya quedó registrado con su número correlativo y código QR de verificación."
      size="md"
    >
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center py-2">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
            <CheckCircle2 size={30} />
          </div>
          <Badge variant="brand" className="font-mono text-xs mb-2">
            CERTIFICADO N.º {certificate.certificateNumber}
          </Badge>
          <p className="text-base font-bold text-ink-primary">
            {certificate.snapshot.apellidoNombre}
          </p>
          <p className="text-xs text-ink-secondary mt-0.5">
            DNI {formatDniDisplay(certificate.snapshot.dni)} · {certificate.snapshot.anio}{' '}
            {certificate.snapshot.division} ({certificate.snapshot.turno}) · Emisión{' '}
            {formatDateAR(certificate.issueDate)}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Button
            type="button"
            variant="primary"
            size="lg"
            loading={printing}
            onClick={() => void handlePrint()}
            className="w-full"
          >
            <Printer size={16} /> Imprimir
          </Button>
          <Button
            type="button"
            variant="emerald"
            size="lg"
            loading={downloading}
            onClick={() => void handleDownload()}
            className="w-full"
          >
            <Download size={16} /> Descargar PDF
          </Button>
        </div>

        <div className="pt-2 border-t border-border-subtle">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onGenerateNew}
            className="w-full"
          >
            <PlusCircle size={16} /> Generar nueva constancia
          </Button>
        </div>
      </div>
    </Modal>
  );
};
