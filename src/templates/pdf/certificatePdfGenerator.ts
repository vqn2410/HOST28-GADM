import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { DEFAULT_VALIDATION_DISCLAIMER } from '@/lib/database/defaults';
import { formatDateAR, resolveCertificateValidationUrl } from '@/lib/utils/formatters';
import type { Certificate, SchoolSettings } from '@/types/domain';

let cachedLogoDataUrl: string | null = null;

async function loadLogoDataUrl(logoUrl: string): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = typeof reader.result === 'string' ? reader.result : null;
        if (result) cachedLogoDataUrl = result;
        resolve(result ?? '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Renderiza el certificado en formato A4 vertical respetando el modelo oficial
 * vigente de la E.E.S. N° 28 "Gustavo Cerati" (cuadro institucional, logo,
 * marca de agua central, bloque de firma/sello sin autoridad precargada,
 * pie de contacto institucional y franja de validación QR).
 */
async function renderCertificateOnPage(
  pdf: jsPDF,
  cert: Certificate,
  settings?: SchoolSettings
): Promise<void> {
  const s = cert.snapshot;
  const pageWidth = 210;
  const frameX = 12;
  const frameY = 16;
  const frameW = pageWidth - frameX * 2; // 186mm
  const frameH = 264;
  const logoColW = 34;
  const headerTopH = 28;
  const titleRowH = 11;
  const headerTotalH = headerTopH + titleRowH; // 39mm

  const emailToPrint =
    !s.email || s.email === 'ees28lanus@abc.gob.ar'
      ? 'secundaria28lanus@abc.gob.ar'
      : s.email;
  const addressToPrint =
    !s.direccion || s.direccion === 'Distrito de Lanús, Provincia de Buenos Aires'
      ? 'Ituzaingó 1762 – Lanús Este'
      : s.direccion;
  const phoneToPrint = s.telefono || '4225-2086';
  const cueToPrint = !s.cue || s.cue === '0600028-00' ? '0617791-00' : s.cue;

  const logoData = await loadLogoDataUrl(settings?.logoUrl || '/logo.png');

  // ── 1. Marca de agua institucional centrada en el cuerpo (suave) ──
  if (logoData) {
    try {
      const pdfAny = pdf as unknown as {
        saveGraphicsState?: () => void;
        restoreGraphicsState?: () => void;
        setGState?: (gs: unknown) => void;
        GState?: new (opts: { opacity: number }) => unknown;
      };
      if (
        pdfAny.saveGraphicsState &&
        pdfAny.setGState &&
        pdfAny.GState &&
        pdfAny.restoreGraphicsState
      ) {
        pdfAny.saveGraphicsState();
        pdfAny.setGState(new pdfAny.GState({ opacity: 0.09 }));
        pdf.addImage(logoData, 'PNG', (pageWidth - 96) / 2, 102, 96, 96);
        pdfAny.restoreGraphicsState();
      }
    } catch {
      // Continuar sin marca de agua si el motor PDF no soporta GState
    }
  }

  // ── 2. Marco exterior y grilla del encabezado oficial ──
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.45);
  pdf.rect(frameX, frameY, frameW, frameH);

  // Separador vertical del logo en el encabezado
  pdf.line(frameX + logoColW, frameY, frameX + logoColW, frameY + headerTotalH);
  // Separador horizontal debajo del bloque de datos de escuela (solo columna derecha)
  pdf.line(frameX + logoColW, frameY + headerTopH, frameX + frameW, frameY + headerTopH);
  // Separador horizontal completo debajo del título
  pdf.line(frameX, frameY + headerTotalH, frameX + frameW, frameY + headerTotalH);

  // Logo en celda izquierda del encabezado
  if (logoData) {
    try {
      pdf.addImage(logoData, 'PNG', frameX + 4, frameY + 6.5, 26, 26);
    } catch {
      // Omitir si falla la carga de imagen
    }
  }

  // Textos institucionales en celda superior derecha
  const rightX = frameX + logoColW + 3.5;
  const schoolTitleMain = `ESCUELA DE EDUCACIÓN SECUNDARIA N° ${s.numeroEscuela || '28'}`;
  const quoteMatch = /["“]([^"”]+)["”]/.exec(s.nombreInstitucion);
  const schoolSubtitle = quoteMatch ? quoteMatch[1].toUpperCase() : 'GUSTAVO CERATI';

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(15, 23, 42);
  pdf.text(schoolTitleMain, rightX, frameY + 8);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(15, 23, 42);
  pdf.text(schoolSubtitle, rightX, frameY + 13.5);

  pdf.setFontSize(8.2);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`Provincia de ${s.provincia || 'Buenos Aires'}  •  CUE: ${cueToPrint}`, rightX, frameY + 18.2);
  pdf.text('Dirección General de Cultura y Educación.', rightX, frameY + 22);
  pdf.text('Dirección Provincial de Educación Secundaria.', rightX, frameY + 25.8);

  // Título centrado en la fila inferior del encabezado
  const titleCenterX = frameX + logoColW + (frameW - logoColW) / 2;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(15, 23, 42);
  pdf.text(s.renderedTitle.toUpperCase(), titleCenterX, frameY + headerTopH + 7.5, {
    align: 'center',
  });

  // ── 3. Lugar y fecha (esquina superior derecha del cuerpo, negrita cursiva) ──
  const bodyMarginX = frameX + 10;
  const bodyWidth = frameW - 20;

  pdf.setFont('helvetica', 'bolditalic');
  pdf.setFontSize(10);
  pdf.setTextColor(15, 23, 42);
  pdf.text(
    `${s.distrito || 'Lanús'}, ${formatDateAR(s.fechaEmision)}`,
    frameX + frameW - 8,
    frameY + headerTotalH + 7.5,
    { align: 'right' }
  );

  // Marca de agua roja si está anulado o reemplazado
  if (cert.status !== 'emitido') {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(38);
    pdf.setTextColor(220, 38, 38);
    pdf.text(
      cert.status === 'anulado' ? 'DOCUMENTO ANULADO' : 'DOCUMENTO REEMPLAZADO',
      pageWidth / 2,
      152,
      { align: 'center', angle: 32 }
    );
  }

  // ── 4. Cuerpo del certificado ──
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11.5);
  pdf.setTextColor(15, 23, 42);

  const paragraphs = s.renderedBody.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  let cursorY = frameY + headerTotalH + 22;

  paragraphs.forEach((para, index) => {
    const text = index === 0 ? `        ${para.trim()}` : para.trim();
    const lines = pdf.splitTextToSize(text, bodyWidth);
    pdf.text(lines, bodyMarginX, cursorY, { lineHeightFactor: 1.65 });
    cursorY += lines.length * 7.2 + 7;
  });

  if (s.observaciones?.trim()) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9.5);
    pdf.setTextColor(51, 65, 85);
    const obsLines = pdf.splitTextToSize(`Observaciones: ${s.observaciones.trim()}`, bodyWidth);
    pdf.text(obsLines, bodyMarginX, cursorY, { lineHeightFactor: 1.45 });
    cursorY += obsLines.length * 5.5 + 4;
  }

  // ── 5. Espacio limpio para Sello del Establecimiento y Firma y Sello de la autoridad ──
  const signLineY = Math.max(cursorY + 24, 178);
  const leftLineStart = frameX + 16;
  const leftLineEnd = frameX + 74;
  const rightLineStart = frameX + frameW - 74;
  const rightLineEnd = frameX + frameW - 16;

  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.35);
  pdf.line(leftLineStart, signLineY, leftLineEnd, signLineY);
  pdf.line(rightLineStart, signLineY, rightLineEnd, signLineY);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Sello del Establecimiento', (leftLineStart + leftLineEnd) / 2, signLineY + 5.5, {
    align: 'center',
  });
  pdf.text(
    'Firma y Sello de la autoridad',
    (rightLineStart + rightLineEnd) / 2,
    signLineY + 5.5,
    { align: 'center' }
  );

  // ── 6. Pie institucional oficial (dirección, teléfono, correo y fecha de emisión) ──
  const footerContactY = 216;
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.35);
  pdf.line(frameX, footerContactY, frameX + frameW, footerContactY);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text(
    `${s.nombreInstitucion.toUpperCase()} | DIRECCIÓN GENERAL DE CULTURA Y EDUCACIÓN`,
    pageWidth / 2,
    footerContactY + 5.5,
    { align: 'center' }
  );

  const contactLine = [
    addressToPrint.toUpperCase(),
    `TEL. ${phoneToPrint}`,
    `C.E.: ${emailToPrint}`,
  ].join(' | ');
  pdf.text(contactLine, pageWidth / 2, footerContactY + 10, { align: 'center' });

  pdf.text(
    `Fecha de Emisión: ${formatDateAR(s.fechaEmision)} en ${s.distrito || 'Lanús'}, Provincia de ${s.provincia || 'Buenos Aires'}`,
    pageWidth / 2,
    footerContactY + 14.5,
    { align: 'center' }
  );

  // ── 7. Franja inferior de validación QR institucional ──
  const qrBandY = 234;
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.35);
  pdf.line(frameX, qrBandY, frameX + frameW, qrBandY);

  const validationUrl = resolveCertificateValidationUrl(cert.validationUrl, cert.token);
  const qrDataUrl = await QRCode.toDataURL(validationUrl, {
    width: 220,
    margin: 1,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
  pdf.addImage(qrDataUrl, 'PNG', frameX + 6, qrBandY + 4, 28, 28);

  const metaX = frameX + 39;
  const metaW = frameW - 45;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(15, 23, 42);
  pdf.text(
    `VERIFICACIÓN DOCUMENTAL QR  •  CERTIFICADO N.º ${cert.certificateNumber}`,
    metaX,
    qrBandY + 8
  );

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.2);
  pdf.setTextColor(51, 65, 85);
  pdf.text(`Token de validación: ${cert.token}`, metaX, qrBandY + 13);

  const urlLines = pdf.splitTextToSize(`URL de verificación: ${validationUrl}`, metaW);
  pdf.text(urlLines, metaX, qrBandY + 17.5);

  const disclaimer = settings?.validationDisclaimer || DEFAULT_VALIDATION_DISCLAIMER;
  pdf.setFontSize(6.5);
  pdf.setTextColor(100, 116, 139);
  const discLines = pdf.splitTextToSize(disclaimer, metaW);
  pdf.text(discLines, metaX, qrBandY + 25.5, { lineHeightFactor: 1.2 });
}

export async function generateCertificatePdfBlob(
  cert: Certificate,
  settings?: SchoolSettings
): Promise<Blob> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await renderCertificateOnPage(pdf, cert, settings);
  return pdf.output('blob');
}

export async function downloadCertificatePdf(
  cert: Certificate,
  settings?: SchoolSettings
): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await renderCertificateOnPage(pdf, cert, settings);
  const safeName = `${cert.certificateNumber}_${cert.snapshot.apellido}_${cert.snapshot.dni}`.replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  pdf.save(`${safeName}.pdf`);
}

export async function printCertificatePdf(
  cert: Certificate,
  settings?: SchoolSettings
): Promise<void> {
  const blob = await generateCertificatePdfBlob(cert, settings);
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    setTimeout(() => {
      URL.revokeObjectURL(url);
      iframe.remove();
    }, 60_000);
  };
}

export async function downloadConsolidatedCertificatesPdf(
  certs: Certificate[],
  settings?: SchoolSettings,
  filename = 'certificados_consolidados.pdf'
): Promise<void> {
  if (certs.length === 0) return;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  for (let i = 0; i < certs.length; i++) {
    if (i > 0) pdf.addPage('a4', 'portrait');
    await renderCertificateOnPage(pdf, certs[i], settings);
  }
  pdf.save(filename);
}

export async function downloadCertificatesZip(
  certs: Certificate[],
  settings?: SchoolSettings,
  zipFilename = 'certificados_sgae.zip'
): Promise<void> {
  const zip = new JSZip();
  for (const cert of certs) {
    const blob = await generateCertificatePdfBlob(cert, settings);
    const safeName = `${cert.certificateNumber}_${cert.snapshot.apellido}_${cert.snapshot.dni}.pdf`.replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );
    zip.file(safeName, blob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename;
  a.click();
  URL.revokeObjectURL(url);
}
