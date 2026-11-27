import { describe, it, expect } from 'vitest';
import {
  buildLegacyFullName,
  calculateAge,
  formatCourseLabels,
  formatDniDisplay,
  generateSecureToken,
  maskDni,
  maskStudentName,
  normalizeDni,
  parseLegacyCourseCode,
  parseLegacyName,
  renderTemplate,
} from '@/lib/utils/formatters';
import { studentSchema } from '@/lib/validators/schemas';
import { hasPermission } from '@/lib/permissions/rbac';
import { adaptFirestoreToStudent } from '@/repositories/studentRepository';
import { deriveLegacyEnrollmentForStudent } from '@/repositories/academicRepository';
import {
  buildCertificateSnapshot,
  computeNextSequence,
  formatCertificateNumber,
} from '@/repositories/certificateRepository';
import {
  evaluateRes1650Accreditation,
  evaluateStudentTrajectoryRes1650,
} from '@/repositories/gradesRepository';
import {
  buildDefaultCoursesForYear,
  DEFAULT_CERTIFICATE_TEMPLATES,
  DEFAULT_SCHOOL_SETTINGS,
} from '@/lib/database/defaults';
import type { Enrollment, SgaeUser, Student } from '@/types/domain';

describe('SGAE — Normalización, Edad Dinámica y Privacidad (Ley 25.326)', () => {
  it('normaliza DNI eliminando puntos y espacios', () => {
    expect(normalizeDni(' 45.123.456 ')).toBe('45123456');
    expect(formatDniDisplay('45123456')).toBe('45.123.456');
  });

  it('valida formulario de estudiante con Zod y rechaza DNI inválido', () => {
    const ok = studentSchema.safeParse({
      apellido: 'Álvarez',
      nombres: 'Martín',
      dni: '46.123.456',
      fechaNacimiento: '2011-05-10',
      anioIngreso: 2024,
      estadoInstitucional: 'activo',
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.dni).toBe('46123456');
    }

    const bad = studentSchema.safeParse({
      apellido: 'A',
      nombres: 'B',
      dni: '123',
      anioIngreso: 2026,
      estadoInstitucional: 'activo',
    });
    expect(bad.success).toBe(false);
  });

  it('calcula edad dinámicamente respetando si ya cumplió años', () => {
    const ref = new Date('2026-06-15T12:00:00-03:00');
    expect(calculateAge('2011-06-14', ref)).toBe(15);
    expect(calculateAge('2011-06-15', ref)).toBe(15);
    expect(calculateAge('2011-06-16', ref)).toBe(14);
    expect(calculateAge('', ref)).toBeNull();
  });

  it('enmascara DNI y nombre para minimización de datos en validación pública', () => {
    expect(maskDni('45123456')).toBe('*****456');
    const masked = maskStudentName('Álvarez', 'Martín');
    expect(masked).toContain('*');
    expect(masked).not.toContain('Álvarez');
  });
});

describe('SGAE × HOST28_EF — Compatibilidad no destructiva', () => {
  it('adapta un documento heredado de `alumnos/{dni}` preservando campos de EF', () => {
    const legacyDoc = {
      dni: '20002',
      nombre: 'Flores, Martina',
      cursoOrigen: '2°1°',
      turno: 'Mañana',
      cursoEF: '2°1°',
      recursaCursos: ['1°1°'],
    };

    const adapted = adaptFirestoreToStudent('20002', legacyDoc);
    expect(adapted.dni).toBe('20002');
    expect(adapted.apellido).toBe('Flores');
    expect(adapted.nombres).toBe('Martina');
    expect(adapted.nombre).toBe('Flores, Martina');
    expect(adapted.cursoOrigen).toBe('2°1°');
    expect(adapted.cursoEF).toBe('2°1°');
    expect(adapted.recursaCursos).toEqual(['1°1°']);
    expect(adapted.estadoInstitucional).toBe('activo');
  });

  it('parsea y formatea nombres y códigos de curso compatibles con HOST28_EF', () => {
    expect(parseLegacyName('Cardozo, Lucas')).toEqual({ apellido: 'Cardozo', nombres: 'Lucas' });
    expect(buildLegacyFullName('Cardozo', 'Lucas')).toBe('Cardozo, Lucas');
    expect(formatCourseLabels(3, '2ª')).toEqual({ label: '3° 2ª', legacyCode: '3°2°' });
    expect(parseLegacyCourseCode('3°2°')).toEqual({ yearNumber: 3, division: '2ª' });
  });

  it('toma automáticamente la matrícula oficial (cursoOrigen y turno) desde HOST28_EF', () => {
    const courses2026 = buildDefaultCoursesForYear('2026');
    const st = adaptFirestoreToStudent('20003', {
      dni: '20003',
      nombre: 'Gómez, Alan',
      cursoOrigen: '2°2°',
      turno: 'Tarde',
      cursoEF: '1°1°',
    });

    const enr = deriveLegacyEnrollmentForStudent(st, '2026', courses2026);
    expect(enr).not.toBeNull();
    expect(enr?.courseId).toBe('2026_2_2');
    expect(enr?.courseLabel).toBe('2° 2ª');
    expect(enr?.shiftName).toBe('Tarde');
    expect(enr?.status).toBe('activa');

    const dropped = adaptFirestoreToStudent('10004', {
      dni: '10004',
      nombre: 'Díaz, Florencia',
      cursoOrigen: '1°1°',
      turno: 'Mañana',
      fechaDeBaja: '2026-06-01',
    });
    const enrDropped = deriveLegacyEnrollmentForStudent(dropped, '2026', courses2026);
    expect(enrDropped?.status).toBe('baja');
    expect(enrDropped?.endDate).toBe('2026-06-01');
  });
});

describe('SGAE — Certificados, Plantillas, Snapshot Histórico y Tokens QR', () => {
  it('genera tokens criptográficos únicos e irrepetibles', () => {
    const t1 = generateSecureToken(24);
    const t2 = generateSecureToken(24);
    expect(t1.length).toBeGreaterThanOrEqual(30);
    expect(t1).not.toBe(t2);
  });

  it('renderiza plantillas y congela snapshot histórico inmutable', () => {
    const tpl = DEFAULT_CERTIFICATE_TEMPLATES[0];
    const student: Student = {
      id: 'stu_45111222',
      dni: '45111222',
      apellido: 'Benítez',
      nombres: 'Camila',
      nombre: 'Benítez, Camila',
      anioIngreso: 2024,
      estadoInstitucional: 'activo',
      createdAt: '2026-03-01T10:00:00-03:00',
      updatedAt: '2026-03-01T10:00:00-03:00',
    };
    const enrollment: Enrollment = {
      id: 'enr_1',
      studentId: student.id,
      studentDni: student.dni,
      academicYearId: '2026',
      courseId: '2026_3_1',
      yearNumber: 3,
      division: '1ª',
      courseLabel: '3° 1ª',
      courseLegacyCode: '3°1°',
      shiftId: 'manana',
      shiftName: 'Mañana',
      startDate: '2026-03-02',
      status: 'activa',
      createdBy: '111',
      createdAt: '2026-03-02T08:00:00-03:00',
      updatedAt: '2026-03-02T08:00:00-03:00',
    };

    const snapshot = buildCertificateSnapshot(
      {
        template: tpl,
        student,
        enrollment,
        settings: DEFAULT_SCHOOL_SETTINGS,
        issueDate: '2026-05-15',
        destinatario: 'ante ANSES',
        motivo: 'Escolaridad',
        textoPersonalizado: '',
        observaciones: '',
        autoridadFirmante: 'Patricia González',
        issuedByDni: '111',
        issuedByName: 'González, Patricia',
      },
      '2026-000001',
      'tok_test_1234567890',
      'https://sgae.ees28.edu.ar/validar/tok_test_1234567890'
    );

    expect(snapshot.renderedTitle).toBe('CONSTANCIA DE ESTUDIANTE REGULAR');
    expect(snapshot.renderedBody).toContain('Benítez, Camila');
    expect(snapshot.renderedBody).toContain('45.111.222');
    expect(snapshot.renderedBody).toContain('3° año, 1ª división - TURNO Mañana');
    expect(snapshot.renderedBody).toContain('ante ANSES');
  });

  it('interpola variables sin dejar llaves sueltas cuando falta un valor', () => {
    expect(renderTemplate('Hola {{nombre}} {{inexistente}}', { nombre: 'Ana' })).toBe('Hola Ana ');
  });

  it('renderiza la versión 2 de constancia de inscripción con ciclo lectivo destino (ej. 2027)', () => {
    const tplV2 = DEFAULT_CERTIFICATE_TEMPLATES.find((t) => t.code === 'inscripcion_ciclo_lectivo')!;
    const student: Student = {
      id: 'stu_45111222',
      dni: '45111222',
      apellido: 'Benítez',
      nombres: 'Camila',
      nombre: 'Benítez, Camila',
      anioIngreso: 2024,
      estadoInstitucional: 'activo',
      createdAt: '2026-03-01T10:00:00-03:00',
      updatedAt: '2026-03-01T10:00:00-03:00',
    };
    const enrollment: Enrollment = {
      id: 'enr_1',
      studentId: student.id,
      studentDni: student.dni,
      academicYearId: '2026',
      courseId: '2026_3_1',
      yearNumber: 3,
      division: '1ª',
      courseLabel: '3° 1ª',
      courseLegacyCode: '3°1°',
      shiftId: 'manana',
      shiftName: 'Mañana',
      startDate: '2026-03-02',
      status: 'activa',
      createdBy: '111',
      createdAt: '2026-03-02T08:00:00-03:00',
      updatedAt: '2026-03-02T08:00:00-03:00',
    };

    const snap = buildCertificateSnapshot(
      {
        template: tplV2,
        student,
        enrollment,
        settings: DEFAULT_SCHOOL_SETTINGS,
        issueDate: '2026-11-26',
        cicloLectivoDestino: '2027',
        destinatario: 'ante quien corresponda',
        motivo: '',
        textoPersonalizado: '',
        observaciones: '',
        autoridadFirmante: '',
        issuedByDni: '111',
        issuedByName: 'Preceptoría',
      },
      '2026-023451',
      'tok_v2_test',
      'https://sgae.ees28.edu.ar/validar/tok_v2_test'
    );

    expect(snap.renderedTitle).toBe('CONSTANCIA DE INSCRIPCIÓN — CICLO LECTIVO 2027');
    expect(snap.renderedBody).toContain('se encuentra inscripto/a en nuestra institución para el Ciclo Lectivo 2027');
  });

  it('inicia la numeración correlativa de 2026 en 2026-023451', () => {
    expect(formatCertificateNumber('2026', computeNextSequence('2026', 0))).toBe('2026-023451');
    expect(formatCertificateNumber('2026', computeNextSequence('2026', 3))).toBe('2026-023451');
    expect(formatCertificateNumber('2026', computeNextSequence('2026', 23451))).toBe('2026-023452');
    expect(formatCertificateNumber('2027', computeNextSequence('2027', 0))).toBe('2027-000001');
  });
});

describe('SGAE — Control de Acceso Basado en Roles (RBAC)', () => {
  const makeUser = (roleId: SgaeUser['roleId'], active = true): SgaeUser => ({
    dni: '999',
    apellido: 'Test',
    nombre: 'User',
    correo: 'test@abc.gob.ar',
    roleId,
    active,
    createdAt: '',
    updatedAt: '',
  });

  it('otorga control total a admin y restringe consulta a solo lectura', () => {
    const admin = makeUser('admin');
    const consulta = makeUser('consulta');
    const preceptoria = makeUser('preceptoria');

    expect(hasPermission(admin, 'users:manage')).toBe(true);
    expect(hasPermission(admin, 'audit:read')).toBe(true);
    expect(hasPermission(consulta, 'students:read')).toBe(true);
    expect(hasPermission(consulta, 'certificates:issue')).toBe(false);
    expect(hasPermission(consulta, 'users:manage')).toBe(false);
    expect(hasPermission(preceptoria, 'certificates:issue')).toBe(true);
    expect(hasPermission(preceptoria, 'certificates:cancel')).toBe(false);
  });

  it('bloquea cualquier permiso si el usuario está deshabilitado', () => {
    const disabledAdmin = makeUser('admin', false);
    expect(hasPermission(disabledAdmin, 'students:read')).toBe(false);
    expect(hasPermission(disabledAdmin, 'users:manage')).toBe(false);
  });
});

describe('SGAE — Motor Académico Resolución 1650/24 PBA', () => {
  it('acredita materia con >=7 en ambos cuatrimestres y envía a intensificación si <7', () => {
    expect(
      evaluateRes1650Accreditation({
        nota1: 8,
        nota2: 7,
        intDicEstado: '',
        intDicNota: null,
        intFebEstado: '',
        intFebNota: null,
      })
    ).toEqual({ estadoAcreditacion: 'acreditada', notaFinal: 8 });

    expect(
      evaluateRes1650Accreditation({
        nota1: 6,
        nota2: 8,
        intDicEstado: '',
        intDicNota: null,
        intFebEstado: '',
        intFebNota: null,
      })
    ).toEqual({ estadoAcreditacion: 'intensificacion', notaFinal: null });
  });

  it('acredita en intensificación con AA y nota >=4, y detecta alerta EDTE con 5+ materias', () => {
    expect(
      evaluateRes1650Accreditation({
        nota1: 5,
        nota2: 6,
        intDicEstado: 'AA',
        intDicNota: 6,
        intFebEstado: '',
        intFebNota: null,
      })
    ).toEqual({ estadoAcreditacion: 'acreditada', notaFinal: 6 });

    const fivePending = Array.from({ length: 5 }, (_, i) => ({
      id: `g_${i}`,
      academicYearId: '2026',
      studentDni: '45000001',
      courseId: '2026_1_1',
      subjectId: `s_${i}`,
      subjectName: `Materia ${i}`,
      val1: 'TED' as const,
      nota1: 5,
      val2: 'TEP' as const,
      nota2: 5,
      intDicEstado: 'CCA' as const,
      intDicNota: null,
      intFebEstado: '' as const,
      intFebNota: null,
      notaFinal: null,
      estadoAcreditacion: 'intensificacion' as const,
      updatedAt: '',
      updatedBy: '',
    }));

    const traj = evaluateStudentTrajectoryRes1650(fivePending);
    expect(traj.requiresEDTE).toBe(true);
    expect(traj.totalPendientesOIntensif).toBe(5);
  });
});
