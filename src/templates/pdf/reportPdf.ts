import { jsPDF } from 'jspdf';
import type { SchoolSettings } from '@/types/domain';
import { formatDateAR, getArgentinaDateISO } from '@/lib/utils/formatters';

export interface RosterPdfColumn {
  header: string;
  key: string;
  width: number;
}

export async function exportRosterPdf(params: {
  title: string;
  subtitle?: string;
  academicYear: string;
  settings: SchoolSettings;
  columns: RosterPdfColumn[];
  rows: Record<string, string | number>[];
  fileName: string;
}): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = 297;
  const pageH = 210;
  const marginX = 14;
  const today = formatDateAR(getArgentinaDateISO());

  const drawHeader = (pageNum: number) => {
    doc.setFillColor(47, 84, 153);
    doc.rect(marginX, 10, pageW - marginX * 2, 2.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(params.settings.institutionName, marginX, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Distrito: ${params.settings.district}, Provincia de ${params.settings.province}  •  Ciclo Lectivo ${params.academicYear}`,
      marginX,
      23
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(47, 84, 153);
    doc.text(params.title, marginX, 30);

    if (params.subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(params.subtitle, marginX, 35);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generado: ${today}  •  Página ${pageNum}`, pageW - marginX, 18, { align: 'right' });

    // Cabecera de tabla
    const thY = 40;
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(marginX, thY, pageW - marginX * 2, 7.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(30, 41, 59);
    let x = marginX + 2;
    for (const col of params.columns) {
      doc.text(col.header, x, thY + 5);
      x += col.width;
    }
  };

  let pageNum = 1;
  drawHeader(pageNum);
  let y = 52;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  for (let i = 0; i < params.rows.length; i++) {
    if (y > pageH - 16) {
      doc.addPage();
      pageNum += 1;
      drawHeader(pageNum);
      y = 52;
    }

    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, y - 4.5, pageW - marginX * 2, 6.5, 'F');
    }

    doc.setTextColor(15, 23, 42);
    let x = marginX + 2;
    for (const col of params.columns) {
      const val = String(params.rows[i][col.key] ?? '');
      const clipped = doc.splitTextToSize(val, col.width - 3)[0] ?? '';
      doc.text(clipped, x, y);
      x += col.width;
    }

    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, y + 2, pageW - marginX, y + 2);
    y += 6.5;
  }

  doc.save(`${params.fileName}.pdf`);
}
