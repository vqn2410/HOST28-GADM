import { z } from 'zod';
import { normalizeDni } from '@/lib/utils/formatters';

export const studentSchema = z.object({
  apellido: z.string().trim().min(2, 'El apellido debe tener al menos 2 caracteres'),
  nombres: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  dni: z
    .string()
    .transform((v) => normalizeDni(v))
    .refine((v) => /^\d{5,9}$/.test(v), 'El DNI debe contener entre 5 y 9 dígitos numéricos'),
  fechaNacimiento: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v),
      'La fecha de nacimiento debe tener formato YYYY-MM-DD'
    ),
  anioIngreso: z.coerce
    .number()
    .int()
    .min(1990, 'Año de ingreso inválido')
    .max(2100, 'Año de ingreso inválido'),
  estadoInstitucional: z.string().min(1, 'Seleccione un estado institucional'),
  observaciones: z.string().max(1000).optional(),
  fechaEgreso: z.string().optional().nullable(),
  fechaPase: z.string().optional().nullable(),
  motivoBaja: z.string().max(500).optional().nullable(),
});

export type StudentFormValues = z.infer<typeof studentSchema>;

export const academicYearSchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de inicio inválida'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de fin inválida'),
    status: z.enum(['planificacion', 'activo', 'cerrado']),
    isDefault: z.boolean().default(false),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'La fecha de finalización debe ser posterior a la de inicio',
    path: ['endDate'],
  });

export const courseSchema = z.object({
  academicYearId: z.string().min(1, 'Seleccione un ciclo lectivo'),
  yearNumber: z.coerce.number().int().min(1).max(7),
  division: z.string().trim().min(1, 'Ingrese la división (ej. 1ª, 2ª, A)'),
  shiftId: z.string().min(1, 'Seleccione un turno'),
  orientation: z.string().trim().max(120).optional().default(''),
  capacity: z.union([z.coerce.number().int().min(1).max(120), z.literal(''), z.null()]).optional(),
  status: z.enum(['activo', 'inactivo']).default('activo'),
});

export const shiftSchema = z.object({
  name: z.string().trim().min(2, 'Ingrese el nombre del turno'),
  code: z.string().trim().min(1, 'Ingrese un código corto').max(5),
  startTime: z.string().optional().default(''),
  endTime: z.string().optional().default(''),
  active: z.boolean().default(true),
});

export const certificateIssueSchema = z.object({
  typeCode: z.string().min(1, 'Seleccione el tipo de certificado'),
  studentDni: z.string().min(1, 'Seleccione un estudiante'),
  academicYearId: z.string().min(1, 'Seleccione el ciclo lectivo'),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de emisión inválida'),
  destinatario: z.string().trim().max(250).optional().default('ante quien corresponda'),
  motivo: z.string().trim().max(250).optional().default(''),
  textoPersonalizado: z.string().trim().max(2000).optional().default(''),
  observaciones: z.string().trim().max(500).optional().default(''),
  autoridadFirmante: z.string().trim().max(160).optional().default(''),
});

export type CertificateIssueFormValues = z.infer<typeof certificateIssueSchema>;
