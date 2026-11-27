import { jsPDF } from 'jspdf';
import { formatDateAR, formatDniDisplay, getArgentinaDateISO } from '@/lib/utils/formatters';
import { evaluateStudentTrajectoryRes1650 } from '@/repositories/gradesRepository';
import type {
  Enrollment,
  SchoolSettings,
  Student,
  StudentGradeRecord,
  Subject,
} from '@/types/domain';

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

export interface BulletinPdfInput {
  student: Student;
  enrollment: Enrollment;
  subjects: Subject[];
  grades: StudentGradeRecord[];
  settings: SchoolSettings;
}

async function buildBulletinPdf(input: BulletinPdfInput): Promise<jsPDF> {
  const { student, enrollment, subjects, grades, settings } = input;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const marginX = 12;
  const contentW = pageWidth - marginX * 2; // 186mm

  const cue = !settings.cue || settings.cue === '0600028-00' ? '0617791-00' : settings.cue;
  const email =
    !settings.email || settings.email === 'ees28lanus@abc.gob.ar'
      ? 'secundaria28lanus@abc.gob.ar'
      : settings.email;
  const address =
    !settings.address || settings.address === 'Distrito de Lanús, Provincia de Buenos Aires'
      ? 'Ituzaingó 1762 – Lanús Este'
      : settings.address;
  const phone = settings.phone || '4225-2086';

  const logo = await loadLogoDataUrl(settings.logoUrl || '/logo.png');

  // Franja institucional superior
  pdf.setFillColor(29, 62, 122);
  pdf.rect(0, 0, pageWidth, 4.5, 'F');
  pdf.setFillColor(0, 160, 89);
  pdf.rect(0, 4.5, pageWidth * 0.7, 1.3, 'F');
  pdf.setFillColor(252, 208, 85);
  pdf.rect(pageWidth * 0.7, 4.5, pageWidth * 0.3, 1.3, 'F');

  // Encabezado
  const hY = 10;
  if (logo) {
    try {
      pdf.addImage(logo, 'PNG', marginX, hY, 20, 20);
    } catch {
      // ignore
    }
  }
  const textX = marginX + 24;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(47, 84, 153);
  pdf.text(
    `PROVINCIA DE BUENOS AIRES • DGCyE • DIRECCIÓN PROVINCIAL DE EDUCACIÓN SECUNDARIA`,
    textX,
    hY + 4
  );

  pdf.setFontSize(12);
  pdf.setTextColor(15, 23, 42);
  pdf.text(settings.institutionName.toUpperCase(), textX, hY + 10);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(71, 85, 105);
  pdf.text(
    `Distrito de ${settings.district} • CUE: ${cue} • ${address} • Tel. ${phone}`,
    textX,
    hY + 15
  );

  // Título oficial RITE
  pdf.setFillColor(240, 245, 250);
  pdf.setDrawColor(185, 207, 235);
  pdf.roundedRect(marginX, 33, contentW, 11, 2, 2, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdf.setTextColor(29, 62, 122);
  pdf.text(
    'BOLETÍN DE CALIFICACIONES — REGISTRO INSTITUCIONAL DE TRAYECTORIA EDUCATIVA (RITE)',
    pageWidth / 2,
    38.2,
    { align: 'center' }
  );
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text(
    `Régimen Académico Educación Secundaria — Resolución N.º 1650/24 PBA  •  Ciclo Lectivo ${enrollment.academicYearId}`,
    pageWidth / 2,
    42.3,
    { align: 'center' }
  );

  // Datos del estudiante
  const infoY = 47;
  pdf.setDrawColor(203, 213, 225);
  pdf.roundedRect(marginX, infoY, contentW, 16, 2, 2, 'S');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text('ESTUDIANTE', marginX + 4, infoY + 4.8);
  pdf.text('DNI', marginX + 105, infoY + 4.8);
  pdf.text('CURSO Y DIVISIÓN', marginX + 140, infoY + 4.8);

  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text(`${student.apellido}, ${student.nombres}`, marginX + 4, infoY + 10.5);
  pdf.text(formatDniDisplay(student.dni), marginX + 105, infoY + 10.5);
  pdf.text(`${enrollment.courseLabel} (${enrollment.shiftName})`, marginX + 140, infoY + 10.5);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Emisión: ${formatDateAR(getArgentinaDateISO())}`, marginX + 4, infoY + 14.5);

  // Tabla de materias y calificaciones Res. 1650/24
  const tableY = 67;
  const cols = [
    { label: 'MATERIA', w: 54 },
    { label: '1° VAL.', w: 15 },
    { label: '1° CUAT.', w: 16 },
    { label: '2° VAL.', w: 15 },
    { label: '2° CUAT.', w: 16 },
    { label: 'INT. DIC.', w: 18 },
    { label: 'INT. FEB.', w: 18 },
    { label: 'FINAL', w: 13 },
    { label: 'CONDICIÓN', w: 21 },
  ];

  // Header tabla
  pdf.setFillColor(29, 62, 122);
  pdf.rect(marginX, tableY, contentW, 7.5, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(255, 255, 255);

  let cx = marginX;
  cols.forEach((col, i) => {
    pdf.text(col.label, i === 0 ? cx + 2 : cx + col.w / 2, tableY + 5, {
      align: i === 0 ? 'left' : 'center',
    });
    cx += col.w;
  });

  const gradeBySubject = new Map(grades.map((g) => [g.subjectId, g]));
  let ry = tableY + 7.5;

  subjects.forEach((subj, idx) => {
    const g = gradeBySubject.get(subj.id);
    const rowH = 8.2;
    if (idx % 2 === 1) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(marginX, ry, contentW, rowH, 'F');
    }
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.2);
    pdf.line(marginX, ry + rowH, marginX + contentW, ry + rowH);

    const dicText = g?.intDicEstado
      ? `${g.intDicEstado}${g.intDicNota !== null ? ` (${g.intDicNota})` : ''}`
      : '—';
    const febText = g?.intFebEstado
      ? `${g.intFebEstado}${g.intFebNota !== null ? ` (${g.intFebNota})` : ''}`
      : '—';
    const condLabel =
      g?.estadoAcreditacion === 'acreditada'
        ? 'Acreditada'
        : g?.estadoAcreditacion === 'intensificacion'
          ? 'Intensifica'
          : g?.estadoAcreditacion === 'pendiente'
            ? 'Pendiente'
            : 'En curso';

    const cells = [
      subj.name.slice(0, 30),
      g?.val1 || '—',
      g?.nota1 !== null && g?.nota1 !== undefined ? String(g.nota1) : '—',
      g?.val2 || '—',
      g?.nota2 !== null && g?.nota2 !== undefined ? String(g.nota2) : '—',
      dicText,
      febText,
      g?.notaFinal !== null && g?.notaFinal !== undefined ? String(g.notaFinal) : '—',
      condLabel,
    ];

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(15, 23, 42);

    let x = marginX;
    cells.forEach((val, i) => {
      if (i === 0) pdf.setFont('helvetica', 'bold');
      else if (i === 7 || i === 8) pdf.setFont('helvetica', 'bold');
      else pdf.setFont('helvetica', 'normal');
      pdf.text(val, i === 0 ? x + 2 : x + cols[i].w / 2, ry + 5.4, {
        align: i === 0 ? 'left' : 'center',
      });
      x += cols[i].w;
    });

    ry += rowH;
  });

  // Resumen Trayectoria Res. 1650/24
  const traj = evaluateStudentTrajectoryRes1650(grades);
  const sumY = Math.min(ry + 7, 215);
  pdf.setFillColor(245, 248, 252);
  pdf.setDrawColor(185, 207, 235);
  pdf.roundedRect(marginX, sumY, contentW, 20, 2, 2, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(29, 62, 122);
  pdf.text('SÍNTESIS DE TRAYECTORIA EDUCATIVA (RESOLUCIÓN 1650/24 PBA)', marginX + 4, sumY + 5.5);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.8);
  pdf.setTextColor(30, 41, 59);
  pdf.text(
    `Acreditadas: ${traj.acreditadas}   •   En Intensificación: ${traj.enIntensificacion}   •   Pendientes: ${traj.pendientes}   •   Estado: ${traj.label}`,
    marginX + 4,
    sumY + 11
  );

  pdf.setFontSize(6.8);
  pdf.setTextColor(100, 116, 139);
  pdf.text(
    'Referencias: TEA (Trayectoria Educativa Avanzada) · TEP (En Proceso) · TED (Discontinua) | Acreditación cuatrimestral: 7 a 10 · Intensificación: AA (Aprobó y Acreditó ≥4), CCA (Continúa con Avances), CSA (Continúa sin Avances).',
    marginX + 4,
    sumY + 16.5,
    { maxWidth: contentW - 8 }
  );

  // Espacios de firma
  const sigY = 262;
  pdf.setDrawColor(100, 116, 139);
  pdf.setLineWidth(0.35);
  const segW = 50;
  pdf.line(marginX + 4, sigY, marginX + 4 + segW, sigY);
  pdf.line(pageWidth / 2 - segW / 2, sigY, pageWidth / 2 + segW / 2, sigY);
  pdf.line(pageWidth - marginX - 4 - segW, sigY, pageWidth - marginX - 4, sigY);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(51, 65, 85);
  pdf.text('Sello del Establecimiento', marginX + 4 + segW / 2, sigY + 4.5, { align: 'center' });
  pdf.text('Firma Autoridad / Preceptoría', pageWidth / 2, sigY + 4.5, { align: 'center' });
  pdf.text('Notificación Familia / Responsable', pageWidth - marginX - 4 - segW / 2, sigY + 4.5, {
    align: 'center',
  });

  // Pie de página
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text(
    `${settings.institutionName} • ${address} • Tel. ${phone} • ${email}`,
    pageWidth / 2,
    288,
    { align: 'center' }
  );

  return pdf;
}

export async function downloadBulletinPdf(input: BulletinPdfInput): Promise<void> {
  const pdf = await buildBulletinPdf(input);
  const safe = `Boletin_RITE_${input.enrollment.academicYearId}_${input.student.apellido}_${input.student.dni}`.replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  pdf.save(`${safe}.pdf`);
}

export async function printBulletinPdf(input: BulletinPdfInput): Promise<void> {
  const pdf = await buildBulletinPdf(input);
  const blob = pdf.output('blob');
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
