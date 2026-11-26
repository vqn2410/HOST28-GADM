import type {
  AcademicYear,
  CertificateTemplate,
  Course,
  SchoolSettings,
  Shift,
} from '@/types/domain';
import { formatCourseLabels, getArgentinaNowISO } from '@/lib/utils/formatters';

export const DEFAULT_VALIDATION_DISCLAIMER =
  'El presente sistema permite verificar el registro de emisión del documento por parte de la institución educativa. La firma del documento es de carácter ológrafo. La validación mediante código QR no sustituye ni autentica la firma manuscrita ni el sello de la autoridad escolar.';

export const DEFAULT_SCHOOL_SETTINGS: SchoolSettings = {
  institutionName: 'Escuela de Educación Secundaria N° 28 "Gustavo Cerati"',
  schoolNumber: '28',
  cue: '0617791-00',
  cueAnexo: '',
  educationRegion: 'Región Educativa 2',
  district: 'Lanús',
  province: 'Buenos Aires',
  locality: 'Lanús Este',
  issuePlace: 'Lanús, Provincia de Buenos Aires',
  educationLevel: 'Secundario',
  address: 'Ituzaingó 1762 – Lanús Este',
  phone: '4225-2086',
  email: 'secundaria28lanus@abc.gob.ar',
  logoUrl: '/logo.png',
  secondaryLogoUrl: '',
  primaryColor: '#2f5499',
  accentColor: '#00a059',
  directorName: '',
  secretaryName: '',
  authorizedSigners: ['Dirección', 'Vicedirección', 'Secretaría'],
  letterheadHeader:
    'Provincia de Buenos Aires. Dirección General de Cultura y Educación. Dirección Provincial de Educación Secundaria.',
  numberingFormat: '{YYYY}-{NNNNNN}',
  validationDisclaimer: DEFAULT_VALIDATION_DISCLAIMER,
  customStudentStatuses: [],
  updatedAt: getArgentinaNowISO(),
  updatedBy: 'sistema',
};

export const DEFAULT_SHIFTS: Shift[] = [
  { id: 'manana', name: 'Mañana', code: 'M', startTime: '07:30', endTime: '12:00', active: true },
  { id: 'tarde', name: 'Tarde', code: 'T', startTime: '13:00', endTime: '17:30', active: true },
  { id: 'vespertino', name: 'Vespertino', code: 'V', startTime: '17:45', endTime: '22:00', active: true },
  { id: 'noche', name: 'Noche', code: 'N', startTime: '18:30', endTime: '22:30', active: false },
];

export const DEFAULT_ACADEMIC_YEAR_2026: AcademicYear = {
  id: '2026',
  year: 2026,
  startDate: '2026-03-02',
  endDate: '2026-12-18',
  status: 'activo',
  isDefault: true,
  createdAt: getArgentinaNowISO(),
  createdBy: 'sistema',
};

/** Cursos oficiales de E.E.S. N° 28 (1° y 2° con 3 divisiones; 3° a 6° con 2 divisiones). */
export function buildDefaultCoursesForYear(academicYearId: string): Course[] {
  const now = getArgentinaNowISO();
  const defs: { year: number; divs: string[] }[] = [
    { year: 1, divs: ['1ª', '2ª', '3ª'] },
    { year: 2, divs: ['1ª', '2ª', '3ª'] },
    { year: 3, divs: ['1ª', '2ª'] },
    { year: 4, divs: ['1ª', '2ª'] },
    { year: 5, divs: ['1ª', '2ª'] },
    { year: 6, divs: ['1ª', '2ª'] },
  ];

  const courses: Course[] = [];
  for (const def of defs) {
    for (const div of def.divs) {
      const { label, legacyCode } = formatCourseLabels(def.year, div);
      const isManana = div.startsWith('1');
      const shiftId = isManana ? 'manana' : 'tarde';
      const shiftName = isManana ? 'Mañana' : 'Tarde';
      const divNum = div.replace(/\D/g, '') || div;
      courses.push({
        id: `${academicYearId}_${def.year}_${divNum}`,
        academicYearId,
        yearNumber: def.year,
        division: div,
        legacyCode,
        label,
        shiftId,
        shiftName,
        orientation: def.year >= 4 ? 'Ciclo Superior' : 'Ciclo Básico',
        capacity: 35,
        status: 'activo',
        createdAt: now,
      });
    }
  }
  return courses;
}

export const DEFAULT_CERTIFICATE_TEMPLATES: CertificateTemplate[] = [
  {
    id: 'alumno_regular',
    code: 'alumno_regular',
    name: 'Constancia de Estudiante Regular',
    title: 'CONSTANCIA DE ESTUDIANTE REGULAR',
    body: `La Dirección del Establecimiento de la {{nombreInstitucion}}, N.º de CUE: {{cue}}, del distrito de {{distrito}}, deja constancia de que {{apellidoNombre}} (DNI N.º {{dni}}) se encuentra inscripto/a en {{anio}} año, {{division}} división - TURNO {{turno}} - Ciclo Lectivo {{cicloLectivo}} en nuestra institución.

Se extiende la presente a pedido del/la interesado/a para ser presentada ante: {{destinatario}}`,
    footerNote: 'Sello del Establecimiento · Firma y Sello de la autoridad',
    version: 1,
    active: true,
    isSystem: true,
    updatedAt: getArgentinaNowISO(),
    updatedBy: 'sistema',
  },
  {
    id: 'inscripcion_ciclo_lectivo',
    code: 'inscripcion_ciclo_lectivo',
    name: 'Constancia de Alumno Regular v2 (Inscripción Ciclo Lectivo)',
    title: 'CONSTANCIA DE INSCRIPCIÓN — CICLO LECTIVO {{cicloLectivoDestino}}',
    body: `La Dirección del Establecimiento de la {{nombreInstitucion}}, N.º de CUE: {{cue}}, del distrito de {{distrito}}, deja constancia de que {{apellidoNombre}} (DNI N.º {{dni}}) se encuentra inscripto/a en nuestra institución para el Ciclo Lectivo {{cicloLectivoDestino}}.

Se extiende la presente a pedido del/la interesado/a para ser presentada ante: {{destinatario}}`,
    footerNote: 'Sello del Establecimiento · Firma y Sello de la autoridad',
    version: 2,
    active: true,
    isSystem: true,
    updatedAt: getArgentinaNowISO(),
    updatedBy: 'sistema',
  },
  {
    id: 'salario_familiar',
    code: 'salario_familiar',
    name: 'Constancia para Salario Familiar',
    title: 'CONSTANCIA DE ESCOLARIDAD PARA SALARIO FAMILIAR',
    body: `La Dirección del Establecimiento de la {{nombreInstitucion}}, N.º de CUE: {{cue}}, del distrito de {{distrito}}, deja constancia de que {{apellidoNombre}} (DNI N.º {{dni}}) se encuentra matriculado/a y cursa sus estudios en {{anio}} año, {{division}} división - TURNO {{turno}} - Ciclo Lectivo {{cicloLectivo}} en nuestra institución.

Se extiende la presente a pedido del/la interesado/a a los efectos de acreditar la escolaridad para la percepción del salario familiar ante: {{destinatario}}`,
    footerNote: 'Sello del Establecimiento · Firma y Sello de la autoridad',
    version: 1,
    active: true,
    isSystem: true,
    updatedAt: getArgentinaNowISO(),
    updatedBy: 'sistema',
  },
  {
    id: 'constancia_general',
    code: 'constancia_general',
    name: 'Constancia General',
    title: 'CONSTANCIA',
    body: `La Dirección del Establecimiento de la {{nombreInstitucion}}, N.º de CUE: {{cue}}, del distrito de {{distrito}}, deja constancia de que {{apellidoNombre}} (DNI N.º {{dni}}) se encuentra inscripto/a en {{anio}} año, {{division}} división - TURNO {{turno}} - Ciclo Lectivo {{cicloLectivo}} en nuestra institución.

{{textoPersonalizado}}

Se extiende la presente a pedido del/la interesado/a para ser presentada ante: {{destinatario}}`,
    footerNote: 'Sello del Establecimiento · Firma y Sello de la autoridad',
    version: 1,
    active: true,
    isSystem: true,
    updatedAt: getArgentinaNowISO(),
    updatedBy: 'sistema',
  },
];

export const MANUAL_COURSE_OPTIONS = [
  { id: '1_1', yearNumber: 1, division: '1ª', shiftName: 'Mañana', label: '1º 1ª - Turno Mañana' },
  { id: '1_2', yearNumber: 1, division: '2ª', shiftName: 'Tarde', label: '1º 2ª - Turno Tarde' },
  { id: '1_3', yearNumber: 1, division: '3ª', shiftName: 'Tarde', label: '1º 3ª - Turno Tarde' },
  { id: '2_1', yearNumber: 2, division: '1ª', shiftName: 'Mañana', label: '2º 1ª - Turno Mañana' },
  { id: '2_2', yearNumber: 2, division: '2ª', shiftName: 'Tarde', label: '2º 2ª - Turno Tarde' },
  { id: '2_3', yearNumber: 2, division: '3ª', shiftName: 'Tarde', label: '2º 3ª - Turno Tarde' },
  { id: '3_1', yearNumber: 3, division: '1ª', shiftName: 'Mañana', label: '3º 1ª - Turno Mañana' },
  { id: '3_2', yearNumber: 3, division: '2ª', shiftName: 'Tarde', label: '3º 2ª - Turno Tarde' },
  { id: '4_1', yearNumber: 4, division: '1ª', shiftName: 'Mañana', label: '4º 1ª - Turno Mañana' },
  { id: '4_2', yearNumber: 4, division: '2ª', shiftName: 'Tarde', label: '4º 2ª - Turno Tarde' },
  { id: '5_1', yearNumber: 5, division: '1ª', shiftName: 'Mañana', label: '5º 1ª - Turno Mañana' },
  { id: '5_2', yearNumber: 5, division: '2ª', shiftName: 'Tarde', label: '5º 2ª - Turno Tarde' },
  { id: '6_1', yearNumber: 6, division: '1ª', shiftName: 'Mañana', label: '6º 1ª - Turno Mañana' },
  { id: '6_2', yearNumber: 6, division: '2ª', shiftName: 'Tarde', label: '6º 2ª - Turno Tarde' },
] as const;

export const TEMPLATE_VARIABLES = [
  '{{apellido}}',
  '{{nombre}}',
  '{{apellidoNombre}}',
  '{{dni}}',
  '{{anio}}',
  '{{division}}',
  '{{turno}}',
  '{{cicloLectivo}}',
  '{{cicloLectivoDestino}}',
  '{{fechaEmision}}',
  '{{nombreInstitucion}}',
  '{{numeroEscuela}}',
  '{{distrito}}',
  '{{provincia}}',
  '{{cue}}',
  '{{destinatario}}',
  '{{motivo}}',
  '{{textoPersonalizado}}',
  '{{numeroCertificado}}',
  '{{token}}',
  '{{urlValidacion}}',
];
