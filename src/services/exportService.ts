import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { formatDateAR, getArgentinaDateISO } from '@/lib/utils/formatters';
import type { SchoolSettings } from '@/types/domain';

export function exportRowsToExcel(
  rows: Record<string, unknown>[],
  sheetName: string,
  filename: string
): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function exportRowsToCsv(
  rows: Record<string, unknown>[],
  filename: string
): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportTableToPdf(options: {
  title: string;
  subtitle?: string;
  academicYear: string;
  settings: SchoolSettings;
  headers: string[];
  rows: string[][];
  filename: string;
  landscape?: boolean;
}): void {
  const pdf = new jsPDF({
    orientation: options.landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 14;
  const usableWidth = pageWidth - marginX * 2;
  const colWidth = usableWidth / options.headers.length;

  const drawHeader = (pageNum: number) => {
    pdf.setFillColor(47, 84, 153);
    pdf.rect(marginX, 10, usableWidth, 2, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(71, 85, 105);
    pdf.text(
      `${options.settings.institutionName} — Distrito de ${options.settings.district}, ${options.settings.province}`,
      marginX,
      17
    );
    pdf.text(
      `Ciclo Lectivo ${options.academicYear}  •  Generado: ${formatDateAR(getArgentinaDateISO())}  •  Pág. ${pageNum}`,
      pageWidth - marginX,
      17,
      { align: 'right' }
    );

    pdf.setFontSize(13);
    pdf.setTextColor(15, 23, 42);
    pdf.text(options.title, marginX, 24);

    if (options.subtitle) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      pdf.text(options.subtitle, marginX, 29);
    }

    // Table header
    const thY = options.subtitle ? 34 : 30;
    pdf.setFillColor(241, 245, 249);
    pdf.rect(marginX, thY, usableWidth, 7, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(30, 41, 59);
    options.headers.forEach((h, i) => {
      pdf.text(h, marginX + i * colWidth + 2, thY + 4.8);
    });
    return thY + 7;
  };

  let pageNum = 1;
  let y = drawHeader(pageNum);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(30, 41, 59);

  options.rows.forEach((row, idx) => {
    if (y > pageHeight - 16) {
      pdf.addPage();
      pageNum += 1;
      y = drawHeader(pageNum);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(30, 41, 59);
    }
    if (idx % 2 === 1) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(marginX, y, usableWidth, 6.2, 'F');
    }
    row.forEach((cell, i) => {
      const clipped = String(cell ?? '').slice(0, 28);
      pdf.text(clipped, marginX + i * colWidth + 2, y + 4.3);
    });
    y += 6.2;
  });

  pdf.save(options.filename.endsWith('.pdf') ? options.filename : `${options.filename}.pdf`);
}

export function downloadImportTemplateExcel(): void {
  const sampleRows = [
    {
      APELLIDO: 'González',
      NOMBRE: 'Valentina',
      DNI: '46123456',
      FECHA_NACIMIENTO: '2012-04-15',
      ANIO_INGRESO: 2026,
      CICLO_LECTIVO: 2026,
      ANIO_CURSADA: 1,
      DIVISION: '1ª',
      TURNO: 'Mañana',
    },
    {
      APELLIDO: 'Ramírez',
      NOMBRE: 'Tomás Nahuel',
      DNI: '45987654',
      FECHA_NACIMIENTO: '2011-09-22',
      ANIO_INGRESO: 2025,
      CICLO_LECTIVO: 2026,
      ANIO_CURSADA: 2,
      DIVISION: '2ª',
      TURNO: 'Tarde',
    },
  ];
  exportRowsToExcel(sampleRows, 'Plantilla_SGAE', 'plantilla_importacion_estudiantes_sgae.xlsx');
}
