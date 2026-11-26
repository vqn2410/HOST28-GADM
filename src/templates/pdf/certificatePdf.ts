import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import type { Certificate, SchoolSettings } from '@/types/domain';
import { DEFAULT_VALIDATION_DISCLAIMER } from '@/lib/database/defaults';
import { formatDateAR, formatDateLongAR, formatDniDisplay } from '@/lib/utils/formatters';

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function renderCertificatePage(
  doc: jsPDF,
  certificate: Certificate,
  settings: SchoolSettings,
  logoDataUrl: string | null
): Promise<void> {
  const snap = certificate.snapshot;
  const pageW = 210; // A4 vertical mm
  const pageH = 297;
  const marginX = 20;
  const contentW = pageW - marginX * 2;

  // Borde institucional sutil
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.35);
  doc.rect(10, 10, pageW - 20, pageH - 20);

  // Franja superior institucional (Azul Real)
  doc.setFillColor(47, 84, 153);
  doc.rect(10, 10, pageW - 20, 3.2, 'F');
  // Detalle esmeralda
  doc.setFillColor(0, 160, 89);
  doc.rect(10, 13.2, pageW - 20, 1, 'F');

  // Encabezado Institucional
  let headerY = 21;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', marginX, headerY, 22, 22);
    } catch {
      // Continuar sin logo si falla el formato
    }
  }

  const textStartX = logoDataUrl ? marginX + 27 : marginX;
  const textMaxW = logoDataUrl ? contentW - 27 : contentW;

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PROVINCIA DE BUENOS AIRES', textStartX, headerY + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('DIRECCIÓN GENERAL DE CULTURA Y EDUCACIÓN', textStartX, headerY + 8.5);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const instLines = doc.splitTextToSize(snap.nombreInstitucion.toUpperCase(), textMaxW);
  doc.text(instLines, textStartX, headerY + 14.5);

  const metaY = headerY + 14.5 + instLines.length * 4.8;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const metaParts = [
    `Establecimiento N.º ${snap.numeroEscuela}`,
    `Distrito: ${snap.distrito}`,
    snap.cue ? `CUE: ${snap.cue}${snap.cueAnexo ? ` / Anexo ${snap.cueAnexo}` : ''}` : '',
  ].filter(Boolean);
  doc.text(metaParts.join('  •  '), textStartX, metaY);

  const contactParts = [snap.direccion, snap.telefono, snap.email].filter(Boolean);
  if (contactParts.length > 0) {
    doc.text(contactParts.join('  •  '), textStartX, metaY + 4.2);
  }

  // Línea divisoria del membrete
  const dividerY = Math.max(metaY + 9, 49);
  doc.setDrawColor(47, 84, 153);
  doc.setLineWidth(0.5);
  doc.line(marginX, dividerY, pageW - marginX, dividerY);

  // Número de certificado y fecha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(47, 84, 153);
  doc.text(`CERTIFICADO N.º ${certificate.certificateNumber}`, marginX, dividerY + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Ciclo Lectivo ${snap.cicloLectivo}  •  Emisión: ${formatDateAR(certificate.issueDate)}`,
    pageW - marginX,
    dividerY + 6.5,
    { align: 'right' }
  );

  // Marca de agua si el certificado está anulado o reemplazado
  if (certificate.status !== 'emitido') {
    doc.setTextColor(220, 38, 38);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(34);
    doc.text(
      certificate.status === 'anulado' ? 'DOCUMENTO ANULADO' : 'DOCUMENTO REEMPLAZADO',
      pageW / 2,
      148,
      { align: 'center', angle: 28 }
    );
  }

  // Título del certificado
  const titleY = dividerY + 21;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(snap.renderedTitle.toUpperCase(), contentW);
  doc.text(titleLines, pageW / 2, titleY, { align: 'center' });

  // Subrayado sobrio bajo el título
  const underlineY = titleY + titleLines.length * 5.5;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(marginX + 32, underlineY, pageW - marginX - 32, underlineY);

  // Cuadro resumen de datos del estudiante (limpio y legible)
  const boxY = underlineY + 8;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, boxY, contentW, 24, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTUDIANTE', marginX + 5, boxY + 6.5);
  doc.text('DNI', marginX + 115, boxY + 6.5);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(snap.apellidoNombre, marginX + 5, boxY + 12);
  doc.text(formatDniDisplay(snap.dni), marginX + 115, boxY + 12);

  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Año: ${snap.anio}   •   División: ${snap.division}   •   Turno: ${snap.turno}   •   Ciclo Lectivo: ${snap.cicloLectivo}`,
    marginX + 5,
    boxY + 19.5
  );

  // Cuerpo del documento
  let bodyY = boxY + 35;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);

  const paragraphs = snap.renderedBody
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const para of paragraphs) {
    const lines = doc.splitTextToSize(para, contentW);
    doc.text(lines, marginX, bodyY, { align: 'justify', maxWidth: contentW });
    bodyY += lines.length * 6 + 5;
  }

  if (snap.observaciones) {
    bodyY += 2;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    const obsLines = doc.splitTextToSize(`Observaciones: ${snap.observaciones}`, contentW);
    doc.text(obsLines, marginX, bodyY);
    bodyY += obsLines.length * 5 + 4;
  }

  // Lugar y fecha de emisión (cierre)
  const closeY = Math.max(bodyY + 8, 178);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(
    `${snap.lugarEmision}, ${formatDateLongAR(certificate.issueDate)}.`,
    marginX,
    closeY
  );

  // Espacios para firma ológrafa y sello institucional (sin simular firmas digitales)
  const sigY = Math.max(closeY + 26, 212);
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.35);

  // Sello institucional (izquierda)
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.roundedRect(marginX + 6, sigY - 14, 52, 20, 2, 2);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('SELLO INSTITUCIONAL', marginX + 32, sigY - 3, { align: 'center' });

  // Firma ológrafa (derecha)
  const sigLineStart = pageW - marginX - 68;
  const sigLineEnd = pageW - marginX - 4;
  doc.line(sigLineStart, sigY, sigLineEnd, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    snap.autoridadFirmante || 'Firma y aclaración de la autoridad escolar',
    (sigLineStart + sigLineEnd) / 2,
    sigY + 5,
    { align: 'center' }
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Firma ológrafa y sello', (sigLineStart + sigLineEnd) / 2, sigY + 9.5, {
    align: 'center',
  });

  // Pie de página con Código QR de validación
  const footerTop = 242;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.35);
  doc.line(marginX, footerTop, pageW - marginX, footerTop);

  // Generar QR
  const qrDataUrl = await QRCode.toDataURL(certificate.validationUrl, {
    width: 240,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  doc.addImage(qrDataUrl, 'PNG', marginX, footerTop + 4, 28, 28);

  const infoX = marginX + 33;
  const infoW = contentW - 33;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(47, 84, 153);
  doc.text('VALIDACIÓN DE EMISIÓN DOCUMENTAL', infoX, footerTop + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`N.º de certificado: ${certificate.certificateNumber}`, infoX, footerTop + 12.5);
  doc.text(`Token de validación: ${certificate.token}`, infoX, footerTop + 16.5);
  const urlLines = doc.splitTextToSize(`Verificar en: ${certificate.validationUrl}`, infoW);
  doc.text(urlLines, infoX, footerTop + 20.5);

  const disclaimerY = footerTop + 25.5;
  doc.setFontSize(6.6);
  doc.setTextColor(100, 116, 139);
  const disclaimer = settings.validationDisclaimer || DEFAULT_VALIDATION_DISCLAIMER;
  const discLines = doc.splitTextToSize(disclaimer, infoW);
  doc.text(discLines, infoX, disclaimerY);
}

export async function generateCertificatePdfBlob(
  certificate: Certificate,
  settings: SchoolSettings
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logoDataUrl = settings.logoUrl ? await loadImageAsDataUrl(settings.logoUrl) : null;
  await renderCertificatePage(doc, certificate, settings, logoDataUrl);
  return doc.output('blob');
}

export async function downloadCertificatePdf(
  certificate: Certificate,
  settings: SchoolSettings
): Promise<void> {
  const blob = await generateCertificatePdfBlob(certificate, settings);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = `${certificate.certificateNumber}_${certificate.snapshot.apellido}_${certificate.snapshot.dni}`
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  a.href = url;
  a.download = `${safeName}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Genera un PDF consolidado (una página por estudiante) para emisión masiva. */
export async function generateConsolidatedPdfBlob(
  certificates: Certificate[],
  settings: SchoolSettings
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logoDataUrl = settings.logoUrl ? await loadImageAsDataUrl(settings.logoUrl) : null;
  for (let i = 0; i < certificates.length; i++) {
    if (i > 0) doc.addPage();
    await renderCertificatePage(doc, certificates[i], settings, logoDataUrl);
  }
  return doc.output('blob');
}

/** Genera un archivo ZIP con un PDF individual por estudiante para emisión masiva. */
export async function generateBulkZipBlob(
  certificates: Certificate[],
  settings: SchoolSettings,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const zip = new JSZip();
  const logoDataUrl = settings.logoUrl ? await loadImageAsDataUrl(settings.logoUrl) : null;
  for (let i = 0; i < certificates.length; i++) {
    const cert = certificates[i];
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    await renderCertificatePage(doc, cert, settings, logoDataUrl);
    const arrayBuffer = doc.output('arraybuffer');
    const fileName = `${cert.certificateNumber}_${cert.snapshot.apellido}_${cert.snapshot.dni}`
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    zip.file(`${fileName}.pdf`, arrayBuffer);
    onProgress?.(i + 1, certificates.length);
  }
  return zip.generateAsync({ type: 'blob' });
}
