import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminDb } from '../_lib/firebaseAdmin';

// Rate limiting básico en memoria por IP (ventana de 1 minuto, máximo 30 consultas)
const rateMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count += 1;
  return true;
}

function normalizeDni(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '').trim();
}

function formatDniDisplay(dni: string): string {
  const clean = normalizeDni(dni);
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function maskDni(dni: string): string {
  const clean = normalizeDni(dni);
  if (clean.length <= 3) return '***';
  return `${'*'.repeat(Math.max(clean.length - 3, 2))}${clean.slice(-3)}`;
}

function maskStudentName(apellido: string, nombres: string): string {
  const maskWord = (w: string) => {
    const t = w.trim();
    if (!t) return '';
    if (t.length <= 2) return `${t[0]}*`;
    return `${t.slice(0, 2)}${'*'.repeat(Math.min(t.length - 2, 4))}`;
  };
  const ap = apellido.split(/\s+/).filter(Boolean).map(maskWord).join(' ');
  const nom = nombres.split(/\s+/).filter(Boolean).map(maskWord).join(' ');
  return `${ap}, ${nom}`.trim();
}

const DEFAULT_DISCLAIMER =
  'El presente sistema permite verificar el registro de emisión del documento por parte de la institución educativa. La firma del documento es de carácter ológrafo. La validación mediante código QR no sustituye ni autentica la firma manuscrita ni el sello de la autoridad escolar.';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ state: 'error', message: 'Método no permitido' });
  }

  const ip =
    String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0];
  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      state: 'error',
      message: 'Demasiadas consultas en poco tiempo. Intentá nuevamente en un minuto.',
    });
  }

  const token = String(
    req.method === 'GET' ? req.query.token ?? '' : req.body?.token ?? ''
  ).trim();
  const dniInput = normalizeDni(
    req.method === 'GET' ? req.query.dni ?? '' : req.body?.dni ?? ''
  );

  if (!token || token.length < 8 || token.length > 128) {
    return res.status(404).json({
      state: 'not_found',
      message: 'Token de validación inválido o inexistente.',
    });
  }

  try {
    const db = getAdminDb();
    // IMPORTANTE (Ley 25.326): Nunca consultar la colección general `alumnos`.
    const snap = await db
      .collection('sgae_certificates')
      .where('token', '==', token)
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(404).json({
        state: 'not_found',
        message: 'No se encontró ningún documento institucional registrado con ese token.',
      });
    }

    const cert = snap.docs[0].data();
    const s = cert.snapshot || {};
    const dniMatches = Boolean(dniInput && dniInput === normalizeDni(s.dni));

    const state =
      cert.status === 'anulado'
        ? 'cancelled'
        : cert.status === 'reemplazado'
          ? 'replaced'
          : 'verified';

    return res.status(200).json({
      state,
      verifiedDniMatch: dniMatches,
      certificate: {
        certificateNumber: cert.certificateNumber,
        token: cert.token,
        typeName: cert.typeName,
        status: cert.status,
        signatureType: 'olografa',
        issueDate: cert.issueDate,
        issuePlace: s.lugarEmision || 'Lanús, Provincia de Buenos Aires',
        academicYear: s.cicloLectivo,
        year: s.anio,
        division: s.division,
        shift: s.turno,
        institutionName: s.nombreInstitucion,
        schoolNumber: s.numeroEscuela,
        logoUrl: '/logo.png',
        studentDisplay: dniMatches
          ? s.apellidoNombre
          : maskStudentName(s.apellido || '', s.nombres || ''),
        dniMasked: maskDni(s.dni || ''),
        dniFull: dniMatches ? formatDniDisplay(s.dni || '') : undefined,
        cancellationReason: cert.cancellationReason ?? null,
        replacedByCertificateNumber: cert.replacedByCertificateNumber ?? null,
        disclaimer: DEFAULT_DISCLAIMER,
      },
    });
  } catch (err) {
    console.error('[API /certificates/validate]', err);
    return res.status(500).json({
      state: 'error',
      message: 'Error temporal de validación. Por favor intentá nuevamente.',
    });
  }
}
