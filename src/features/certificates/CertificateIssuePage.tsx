import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileBadge2,
  AlertTriangle,
  CheckCircle2,
  Search,
  Users,
  UserPen,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { MANUAL_COURSE_OPTIONS } from '@/lib/database/defaults';
import { listStudents } from '@/repositories/studentRepository';
import { listEnrollments } from '@/repositories/academicRepository';
import { issueCertificate, listTemplates } from '@/repositories/certificateRepository';
import { logAudit } from '@/repositories/auditRepository';
import {
  buildLegacyFullName,
  formatCourseLabels,
  formatDateLongAR,
  formatDniDisplay,
  getArgentinaDateISO,
  getArgentinaNowISO,
  normalizeDni,
  renderTemplate,
} from '@/lib/utils/formatters';
import {
  Badge,
  Button,
  Card,
  FieldLabel,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui/Primitives';
import { CertificateSuccessModal } from '@/features/certificates/CertificateSuccessModal';
import type { Certificate, Enrollment, Student } from '@/types/domain';

export const CertificateIssuePage: React.FC<{ defaultTypeCode?: string }> = ({
  defaultTypeCode,
}) => {
  const { user } = useAuth();
  const { academicYears, selectedYearId, settings } = useAcademicYear();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const preselectedDni = searchParams.get('dni') || '';
  const replacesId = searchParams.get('reemplaza') || null;

  const [sourceMode, setSourceMode] = useState<'system' | 'manual'>('system');
  const [typeCode, setTypeCode] = useState(defaultTypeCode || 'alumno_regular');
  const [yearId, setYearId] = useState(selectedYearId);
  const [cicloLectivoDestino, setCicloLectivoDestino] = useState(() =>
    String((Number(selectedYearId) || new Date().getFullYear()) + 1)
  );
  const [studentSearch, setStudentSearch] = useState(preselectedDni);
  const [selectedDni, setSelectedDni] = useState(preselectedDni);

  // Carga manual personalizada
  const [manualApellido, setManualApellido] = useState('');
  const [manualNombre, setManualNombre] = useState('');
  const [manualDni, setManualDni] = useState('');
  const [manualCourseKey, setManualCourseKey] = useState<string>(MANUAL_COURSE_OPTIONS[0].id);

  const [issueDate, setIssueDate] = useState(getArgentinaDateISO());
  const [destinatario, setDestinatario] = useState('ante quien corresponda');
  const [motivo, setMotivo] = useState('');
  const [textoPersonalizado, setTextoPersonalizado] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [generatedCert, setGeneratedCert] = useState<Certificate | null>(null);

  const templatesQuery = useQuery({ queryKey: ['templates'], queryFn: listTemplates });
  const studentsQuery = useQuery({ queryKey: ['students'], queryFn: listStudents });
  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', yearId],
    queryFn: () => listEnrollments(yearId),
  });

  const activeTemplates = (templatesQuery.data ?? []).filter((t) => t.active);
  const selectedTemplate =
    activeTemplates.find((t) => t.code === typeCode) ?? activeTemplates[0];

  const matchingStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    const all = (studentsQuery.data ?? []).filter(
      (s) => s.estadoInstitucional !== 'archivado'
    );
    if (!q) return all.slice(0, 15);
    return all
      .filter((s) => `${s.apellido} ${s.nombres} ${s.dni}`.toLowerCase().includes(q))
      .slice(0, 15);
  }, [studentsQuery.data, studentSearch]);

  const selectedStudent = useMemo(
    () => (studentsQuery.data ?? []).find((s) => s.dni === selectedDni) ?? null,
    [studentsQuery.data, selectedDni]
  );

  // Recuperar matrícula correspondiente al ciclo y a la fecha de emisión (si es histórica)
  const studentEnrollment = useMemo(() => {
    if (!selectedStudent) return null;
    const list = (enrollmentsQuery.data ?? []).filter(
      (e) => e.studentDni === selectedStudent.dni
    );
    if (list.length === 0) return null;
    // Buscar matrícula vigente en la fecha de emisión seleccionada
    const matchingDate = list.find(
      (e) => e.startDate <= issueDate && (!e.endDate || e.endDate >= issueDate)
    );
    return matchingDate ?? list.find((e) => e.status === 'activa') ?? list[0];
  }, [enrollmentsQuery.data, selectedStudent, issueDate]);

  const todayISO = getArgentinaDateISO();
  const isCustomDate = issueDate !== todayISO;

  const { effectiveStudent, effectiveEnrollment } = useMemo((): {
    effectiveStudent: Student | null;
    effectiveEnrollment: Enrollment | null;
  } => {
    if (sourceMode === 'system') {
      return { effectiveStudent: selectedStudent, effectiveEnrollment: studentEnrollment };
    }
    const cleanDni = normalizeDni(manualDni);
    const ap = manualApellido.trim();
    const nom = manualNombre.trim();
    const courseOpt =
      MANUAL_COURSE_OPTIONS.find((c) => c.id === manualCourseKey) ?? MANUAL_COURSE_OPTIONS[0];
    if (!ap || !nom || !cleanDni) {
      return { effectiveStudent: null, effectiveEnrollment: null };
    }
    const now = getArgentinaNowISO();
    const yearNum = courseOpt.yearNumber;
    const { label, legacyCode } = formatCourseLabels(yearNum, courseOpt.division);
    const student: Student = {
      id: `manual_${cleanDni}`,
      dni: cleanDni,
      apellido: ap,
      nombres: nom,
      nombre: buildLegacyFullName(ap, nom),
      anioIngreso: Number(yearId) || new Date().getFullYear(),
      estadoInstitucional: 'activo',
      createdAt: now,
      updatedAt: now,
    };
    const enrollment: Enrollment = {
      id: `manual_enr_${yearId}_${cleanDni}`,
      studentId: student.id,
      studentDni: cleanDni,
      academicYearId: yearId,
      courseId: `manual_${yearNum}_${courseOpt.division}`,
      yearNumber: yearNum,
      division: courseOpt.division,
      courseLabel: label,
      courseLegacyCode: legacyCode,
      shiftId: courseOpt.shiftName.toLowerCase(),
      shiftName: courseOpt.shiftName,
      startDate: issueDate,
      status: 'activa',
      createdBy: user?.dni || 'admin',
      createdAt: now,
      updatedAt: now,
    };
    return { effectiveStudent: student, effectiveEnrollment: enrollment };
  }, [
    sourceMode,
    selectedStudent,
    studentEnrollment,
    manualApellido,
    manualNombre,
    manualDni,
    manualCourseKey,
    yearId,
    issueDate,
    user?.dni,
  ]);

  const previewTitle = useMemo(() => {
    if (!selectedTemplate) return 'CONSTANCIA DE ESTUDIANTE REGULAR';
    return renderTemplate(selectedTemplate.title, {
      cicloLectivo: effectiveEnrollment?.academicYearId || yearId,
      cicloLectivoDestino,
    });
  }, [selectedTemplate, effectiveEnrollment, yearId, cicloLectivoDestino]);

  const previewBody = useMemo(() => {
    if (!selectedTemplate || !effectiveStudent || !effectiveEnrollment) return '';
    return renderTemplate(selectedTemplate.body, {
      apellido: effectiveStudent.apellido,
      nombre: effectiveStudent.nombres,
      apellidoNombre: `${effectiveStudent.apellido}, ${effectiveStudent.nombres}`,
      dni: formatDniDisplay(effectiveStudent.dni),
      anio: `${effectiveEnrollment.yearNumber}°`,
      division: effectiveEnrollment.division,
      turno: effectiveEnrollment.shiftName,
      cicloLectivo: effectiveEnrollment.academicYearId,
      cicloLectivoDestino,
      fechaEmision: formatDateLongAR(issueDate),
      nombreInstitucion: settings.institutionName,
      numeroEscuela: settings.schoolNumber,
      distrito: settings.district,
      provincia: settings.province,
      cue: settings.cue,
      destinatario: destinatario || 'ante quien corresponda',
      motivo,
      textoPersonalizado,
    });
  }, [
    selectedTemplate,
    effectiveStudent,
    effectiveEnrollment,
    cicloLectivoDestino,
    issueDate,
    settings,
    destinatario,
    motivo,
    textoPersonalizado,
  ]);

  const resetForNew = () => {
    setGeneratedCert(null);
    setSelectedDni('');
    setStudentSearch('');
    setManualApellido('');
    setManualNombre('');
    setManualDni('');
    setTextoPersonalizado('');
    setObservaciones('');
  };

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedTemplate || !effectiveStudent || !effectiveEnrollment) {
      toast.error(
        sourceMode === 'manual'
          ? 'Completá apellido, nombre, DNI, curso, división y turno.'
          : 'Seleccioná un estudiante con matrícula registrada en el ciclo elegido.'
      );
      return;
    }

    setIssuing(true);
    try {
      const cert = await issueCertificate({
        template: selectedTemplate,
        student: effectiveStudent,
        enrollment: effectiveEnrollment,
        settings,
        issueDate,
        cicloLectivoDestino,
        destinatario,
        motivo,
        textoPersonalizado,
        observaciones,
        autoridadFirmante: '',
        issuedByDni: user.dni,
        issuedByName: `${user.apellido}, ${user.nombre}`,
        replacesCertificateId: replacesId,
      });

      await logAudit({
        userDni: user.dni,
        userName: `${user.apellido}, ${user.nombre}`,
        userRole: user.roleId,
        operation: replacesId
          ? 'certificate_replace'
          : isCustomDate
            ? 'certificate_issue_custom_date'
            : 'certificate_issue',
        entity: 'certificates',
        entityId: cert.id,
        newSummary: {
          certificateNumber: cert.certificateNumber,
          type: cert.typeCode,
          issueDate: cert.issueDate,
          studentDni: cert.studentDni,
          mode: sourceMode,
        },
      });

      await queryClient.invalidateQueries({ queryKey: ['certificates'] });
      setGeneratedCert(cert);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al emitir certificado.');
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={replacesId ? 'Emitir Certificado de Reemplazo' : 'Emisión de Certificado Institucional'}
        subtitle="Los datos personales y de matrícula se recuperan automáticamente. El documento genera numeración atómica, token seguro y código QR."
        actions={
          <Link to="/certificados">
            <Button variant="outline" size="sm">
              <ArrowLeft size={15} /> Historial
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Formulario */}
        <form onSubmit={handleIssue} className="xl:col-span-6 space-y-5">
          <Card className="p-4 sm:p-6 space-y-4">
            {/* Selector de origen */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-subtle border border-border-subtle">
              <button
                type="button"
                onClick={() => setSourceMode('system')}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  sourceMode === 'system'
                    ? 'bg-brand-500 text-white shadow-xs'
                    : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                <Users size={14} /> Base del sistema
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('manual')}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  sourceMode === 'manual'
                    ? 'bg-brand-500 text-white shadow-xs'
                    : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                <UserPen size={14} /> Carga manual
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Tipo de certificado</FieldLabel>
                <Select value={typeCode} onChange={(e) => setTypeCode(e.target.value)}>
                  {activeTemplates.map((t) => (
                    <option key={t.id} value={t.code}>
                      {t.name} (v{t.version})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <FieldLabel required>Ciclo lectivo</FieldLabel>
                <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
                  {academicYears.map((y) => (
                    <option key={y.id} value={y.id}>
                      Ciclo {y.year}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {sourceMode === 'system' ? (
              <>
                {/* Buscador de estudiante */}
                <div>
                  <FieldLabel required>Buscar estudiante (DNI, apellido o nombre)</FieldLabel>
                  <div className="relative">
                    <Search
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
                    />
                    <Input
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Escribí DNI o apellido..."
                      className="pl-10"
                    />
                  </div>
                  <div className="mt-2 max-h-40 overflow-y-auto border border-border-subtle rounded-xl divide-y divide-border-subtle">
                    {matchingStudents.map((s) => (
                      <button
                        key={s.dni}
                        type="button"
                        onClick={() => {
                          setSelectedDni(s.dni);
                          setStudentSearch(`${s.apellido}, ${s.nombres} (${s.dni})`);
                        }}
                        className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between hover:bg-surface-subtle cursor-pointer ${
                          selectedDni === s.dni ? 'bg-brand-50 dark:bg-brand-900/30 font-semibold' : ''
                        }`}
                      >
                        <span>
                          {s.apellido}, {s.nombres}
                        </span>
                        <span className="font-mono text-ink-muted">{formatDniDisplay(s.dni)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Datos recuperados automáticamente */}
                {selectedStudent && (
                  <div className="p-4 rounded-xl bg-surface-subtle border border-border-subtle text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-ink-primary">
                        {selectedStudent.apellido}, {selectedStudent.nombres} — DNI{' '}
                        {formatDniDisplay(selectedStudent.dni)}
                      </span>
                      {studentEnrollment ? (
                        <Badge variant="success">
                          <CheckCircle2 size={11} /> Matrícula verificada
                        </Badge>
                      ) : (
                        <Badge variant="danger">
                          <AlertTriangle size={11} /> Sin matrícula en {yearId}
                        </Badge>
                      )}
                    </div>
                    {studentEnrollment ? (
                      <p className="text-ink-secondary">
                        Cursada recuperada: <strong>{studentEnrollment.courseLabel}</strong> · Turno{' '}
                        <strong>{studentEnrollment.shiftName}</strong> · Ciclo{' '}
                        <strong>{studentEnrollment.academicYearId}</strong>
                      </p>
                    ) : (
                      <p className="text-red-600 dark:text-red-400">
                        El estudiante no posee matrícula en el ciclo {yearId}. Matriculalo primero en
                        Gestión Académica → Matrícula.
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 rounded-xl bg-surface-subtle/70 border border-border-subtle space-y-3.5">
                <p className="text-xs font-semibold text-brand-700 dark:text-brand-300">
                  Constancia personalizada (sin utilizar datos de la base del sistema)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <FieldLabel required>Apellido</FieldLabel>
                    <Input
                      value={manualApellido}
                      onChange={(e) => setManualApellido(e.target.value)}
                      placeholder="Ej. Pérez"
                      required
                    />
                  </div>
                  <div>
                    <FieldLabel required>Nombre</FieldLabel>
                    <Input
                      value={manualNombre}
                      onChange={(e) => setManualNombre(e.target.value)}
                      placeholder="Ej. Sofía Belén"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <FieldLabel required>DNI</FieldLabel>
                    <Input
                      inputMode="numeric"
                      value={manualDni}
                      onChange={(e) => setManualDni(e.target.value)}
                      placeholder="Sin puntos ni espacios"
                      required
                    />
                  </div>
                  <div>
                    <FieldLabel required>Curso, División y Turno</FieldLabel>
                    <Select
                      value={manualCourseKey}
                      onChange={(e) => setManualCourseKey(e.target.value)}
                    >
                      {MANUAL_COURSE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>
            )}

            <div>
              <FieldLabel required>Fecha de emisión (Argentina)</FieldLabel>
              <Input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
              />
              {isCustomDate && (
                <p className="text-[11px] text-amber-600 mt-1">
                  Fecha distinta a hoy: se registrará auditoría y fecha real de generación por separado.
                </p>
              )}
            </div>

            {typeCode === 'inscripcion_ciclo_lectivo' && (
              <div>
                <FieldLabel required>Ciclo lectivo de inscripción (ej. 2027)</FieldLabel>
                <Input
                  type="number"
                  min={2020}
                  max={2100}
                  value={cicloLectivoDestino}
                  onChange={(e) => setCicloLectivoDestino(e.target.value)}
                  placeholder="2027"
                  required
                />
              </div>
            )}

            <div>
              <FieldLabel>Destinatario / Ante quien corresponda</FieldLabel>
              <Input
                value={destinatario}
                onChange={(e) => setDestinatario(e.target.value)}
                placeholder="Ej. ante ANSES / ante quien corresponda"
              />
            </div>

            <div>
              <FieldLabel>Motivo de emisión (opcional)</FieldLabel>
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Trámite de obra social / boleto estudiantil"
              />
            </div>

            {typeCode === 'constancia_general' && (
              <div>
                <FieldLabel required>Texto personalizado de la constancia</FieldLabel>
                <Textarea
                  value={textoPersonalizado}
                  onChange={(e) => setTextoPersonalizado(e.target.value)}
                  placeholder="Redacte el contenido específico que deberá figurar en la constancia..."
                  required
                />
              </div>
            )}

            <div>
              <FieldLabel>Observaciones adicionales</FieldLabel>
              <Input
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Opcional..."
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              variant="emerald"
              loading={issuing}
              disabled={!effectiveStudent || !effectiveEnrollment}
            >
              <FileBadge2 size={16} /> Emitir
            </Button>
          </Card>
        </form>

        {/* Vista previa institucional A4 (modelo oficial E.E.S. N° 28) */}
        <Card className="xl:col-span-6 p-6 bg-white text-slate-900 border border-slate-300 shadow-md">
          <div className="border border-slate-900 relative overflow-hidden">
            {/* Encabezado en grilla oficial */}
            <div className="grid grid-cols-12 border-b border-slate-900">
              <div className="col-span-3 border-r border-slate-900 p-3 flex items-center justify-center">
                <img
                  src={settings.logoUrl || '/logo.png'}
                  alt="Logo"
                  className="w-16 h-16 object-contain"
                />
              </div>
              <div className="col-span-9 flex flex-col">
                <div className="p-3 border-b border-slate-900">
                  <p className="text-sm font-extrabold tracking-tight text-slate-900">
                    ESCUELA DE EDUCACIÓN SECUNDARIA N° {settings.schoolNumber}
                  </p>
                  <p className="text-xs font-medium text-slate-800">GUSTAVO CERATI</p>
                  <p className="text-[10px] text-slate-600 leading-tight mt-0.5">
                    Provincia de {settings.province} · CUE:{' '}
                    {!settings.cue || settings.cue === '0600028-00' ? '0617791-00' : settings.cue}
                    <br />
                    Dirección General de Cultura y Educación.<br />
                    Dirección Provincial de Educación Secundaria.
                  </p>
                </div>
                <div className="py-2 px-3 text-center">
                  <h3 className="font-bold text-xs sm:text-sm tracking-wide text-slate-900 uppercase">
                    {previewTitle}
                  </h3>
                </div>
              </div>
            </div>

            {/* Cuerpo con marca de agua suave */}
            <div className="p-5 sm:p-6 relative min-h-[340px] flex flex-col justify-between">
              <img
                src={settings.logoUrl || '/logo.png'}
                alt=""
                aria-hidden="true"
                className="pointer-events-none select-none opacity-[0.07] w-56 h-56 object-contain absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              />

              {selectedTemplate && effectiveStudent && effectiveEnrollment ? (
                <div className="relative z-10 space-y-6">
                  <p className="text-right text-xs font-bold italic text-slate-900">
                    {settings.district}, {issueDate.split('-').reverse().join('/')}
                  </p>

                  <div className="whitespace-pre-line text-sm leading-relaxed text-slate-900">
                    {previewBody}
                  </div>

                  {observaciones && (
                    <p className="text-xs italic text-slate-600">Observaciones: {observaciones}</p>
                  )}

                  <div className="pt-12 grid grid-cols-2 gap-8 text-center text-xs text-slate-800">
                    <div className="border-t border-slate-900 pt-1.5">Sello del Establecimiento</div>
                    <div className="border-t border-slate-900 pt-1.5">
                      Firma y Sello de la autoridad
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative z-10 py-16 text-center text-sm text-slate-400">
                  Seleccioná un estudiante con matrícula activa para visualizar la vista previa del
                  documento.
                </div>
              )}
            </div>

            {/* Pie de contacto oficial */}
            <div className="border-t border-slate-900 px-4 py-2.5 text-center text-[10px] text-slate-500 space-y-0.5">
              <p className="uppercase">
                {settings.institutionName} | DIRECCIÓN GENERAL DE CULTURA Y EDUCACIÓN
              </p>
              <p>
                {settings.address} {settings.phone ? `| TEL. ${settings.phone}` : ''}{' '}
                {settings.email ? `| C.E.: ${settings.email}` : ''}
              </p>
            </div>

            {/* Franja QR */}
            <div className="border-t border-slate-900 px-4 py-2.5 flex items-center gap-3 text-[10px] text-slate-500">
              <div className="w-10 h-10 rounded border border-dashed border-slate-300 flex items-center justify-center shrink-0">
                <FileBadge2 size={18} className="text-brand-500" />
              </div>
              <p>
                Al confirmar la emisión se imprimirá el código QR funcional, número correlativo y
                token único de verificación al pie del documento A4.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <CertificateSuccessModal
        certificate={generatedCert}
        settings={settings}
        onGenerateNew={resetForNew}
        onClose={() => setGeneratedCert(null)}
      />
    </div>
  );
};
