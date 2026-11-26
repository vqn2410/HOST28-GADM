import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const ARGENTINA_TIMEZONE = 'America/Argentina/Buenos_Aires';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normaliza un DNI dejando exclusivamente dígitos (sin puntos ni espacios). */
export function normalizeDni(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).replace(/\D/g, '').trim();
}

/** Formatea DNI con separadores de miles para lectura humana (ej. 45.123.456). */
export function formatDniDisplay(dni: string): string {
  const clean = normalizeDni(dni);
  if (!clean) return '';
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Enmascara el DNI según principio de minimización de datos (Ley 25.326). */
export function maskDni(dni: string): string {
  const clean = normalizeDni(dni);
  if (clean.length <= 3) return '***';
  const visible = clean.slice(-3);
  const masked = '*'.repeat(Math.max(clean.length - 3, 2));
  return `${masked}${visible}`;
}

/** Minimiza nombre y apellido para vista pública QR antes de confirmar DNI (ej. "ÁLVAREZ, M***"). */
export function maskStudentName(apellido: string, nombres: string): string {
  const maskWord = (w: string) => {
    const t = w.trim();
    if (!t) return '';
    if (t.length <= 2) return `${t[0]}*`;
    return `${t.slice(0, 2)}${'*'.repeat(Math.min(t.length - 2, 4))}`;
  };
  const ap = apellido
    .split(/\s+/)
    .filter(Boolean)
    .map(maskWord)
    .join(' ');
  const nom = nombres
    .split(/\s+/)
    .filter(Boolean)
    .map(maskWord)
    .join(' ');
  return `${ap}, ${nom}`.trim();
}

/** Parsea el campo heredado `nombre` de HOST28_EF ("Álvarez, Martín" o "Pérez Juan"). */
export function parseLegacyName(rawName: string): { apellido: string; nombres: string } {
  const trimmed = (rawName || '').trim();
  if (!trimmed) return { apellido: '', nombres: '' };
  if (trimmed.includes(',')) {
    const [ap, ...rest] = trimmed.split(',');
    return {
      apellido: ap.trim(),
      nombres: rest.join(',').trim(),
    };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { apellido: parts[0], nombres: '' };
  return {
    apellido: parts[0],
    nombres: parts.slice(1).join(' '),
  };
}

/** Construye el formato compatible con HOST28_EF: "Apellido, Nombres". */
export function buildLegacyFullName(apellido: string, nombres: string): string {
  const ap = apellido.trim();
  const nom = nombres.trim();
  if (!ap) return nom;
  if (!nom) return ap;
  return `${ap}, ${nom}`;
}

/** Calcula la edad actual en años cumplidos a partir de fecha YYYY-MM-DD (sin guardar valor fijo). */
export function calculateAge(birthDate?: string | null, referenceDate?: Date): number | null {
  if (!birthDate) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const ref = referenceDate ?? new Date();
  // Usar fecha local de Argentina para evitar desfasajes UTC
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARGENTINA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ref);

  const curYear = Number(parts.find((p) => p.type === 'year')?.value ?? ref.getFullYear());
  const curMonth = Number(parts.find((p) => p.type === 'month')?.value ?? ref.getMonth() + 1);
  const curDay = Number(parts.find((p) => p.type === 'day')?.value ?? ref.getDate());

  let age = curYear - year;
  if (curMonth < month || (curMonth === month && curDay < day)) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

/** Devuelve la fecha actual en zona horaria America/Argentina/Buenos_Aires como YYYY-MM-DD. */
export function getArgentinaDateISO(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ARGENTINA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Devuelve fecha y hora ISO con offset -03:00 (Argentina). */
export function getArgentinaNowISO(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ARGENTINA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}-03:00`;
}

/** Formatea YYYY-MM-DD a DD/MM/YYYY. */
export function formatDateAR(isoDate?: string | null): string {
  if (!isoDate) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Formatea YYYY-MM-DD a formato documental largo: "25 de noviembre de 2026". */
export function formatDateLongAR(isoDate?: string | null): string {
  if (!isoDate) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const day = Number(m[3]);
  const monthName = months[Number(m[2]) - 1] ?? m[2];
  return `${day} de ${monthName} de ${m[1]}`;
}

/** Formatea timestamp ISO a fecha y hora Argentina legible. */
export function formatDateTimeAR(isoTimestamp?: string | null): string {
  if (!isoTimestamp) return '—';
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return isoTimestamp;
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: ARGENTINA_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Interpola variables `{{clave}}` en plantillas documentales sin permitir inyección de código. */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number | undefined | null>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const val = variables[key];
    return val === undefined || val === null ? '' : String(val);
  });
}

/** Genera un token criptográficamente seguro (base64url) usando Web Crypto API. */
export function generateSecureToken(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Construye la etiqueta de curso formal (ej. "1° 1ª") y legacy (ej. "1°1°"). */
export function formatCourseLabels(yearNumber: number, division: string): {
  label: string;
  legacyCode: string;
} {
  const divClean = division.trim();
  const isNumericDiv = /^\d+/.test(divClean);
  const numericOnly = divClean.replace(/\D/g, '');
  const legacyCode = isNumericDiv && numericOnly ? `${yearNumber}°${numericOnly}°` : `${yearNumber}°${divClean}`;
  const label = `${yearNumber}° ${divClean}`;
  return { label, legacyCode };
}

/** Parsea un código legacy de HOST28_EF ("1°1°", "3°2°") a año y división. */
export function parseLegacyCourseCode(code?: string): { yearNumber: number; division: string } | null {
  if (!code) return null;
  const match = /^(\d+)\s*[°º]?\s*([0-9A-Za-z]+)\s*[°ºª]?$/.exec(code.trim());
  if (!match) return null;
  const yearNumber = Number(match[1]);
  const divRaw = match[2];
  const division = /^\d+$/.test(divRaw) ? `${divRaw}ª` : divRaw.toUpperCase();
  return { yearNumber, division };
}

/** Construye la URL pública de validación desde configuración de entorno (sin hardcodear). */
export function buildValidationUrl(token: string): string {
  const envUrl = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
  const origin =
    envUrl && envUrl.trim().length > 0
      ? envUrl.trim().replace(/\/+$/, '')
      : typeof window !== 'undefined'
        ? window.location.origin
        : '';
  return `${origin}/validar/${encodeURIComponent(token)}`;
}
