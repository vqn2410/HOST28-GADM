import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileBadge2,
  QrCode,
  UserCheck,
  UserPen,
  Users,
  Printer,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { listStudents } from '@/repositories/studentRepository';
import { listEnrollments } from '@/repositories/academicRepository';
import {
  issueCertificate,
  listCertificates,
  listTemplates,
} from '@/repositories/certificateRepository';
import { logAudit } from '@/repositories/auditRepository';
import {
  downloadCertificatePdf,
  printCertificatePdf,
} from '@/templates/pdf/certificatePdfGenerator';
import {
  buildLegacyFullName,
  formatCourseLabels,
  formatDateAR,
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
  Select,
  Textarea,
} from '@/components/ui/Primitives';
import { CertificateSuccessModal } from '@/features/certificates/CertificateSuccessModal';
import type { Certificate, Enrollment, Student } from '@/types/domain';

/**
 * Espacio de emisión rápida para Preceptoría (`/emision`), accesible sin registro
 * ni inicio de sesión. Permite emitir constancias usando la matrícula del sistema
 * o mediante carga manual personalizada (apellido, nombre, DNI, curso, división, turno).
 */
export const QuickPreceptoraIssuePage: React.FC = () => {
  const { selectedYearId, settings } = useAcademicYear();
  const queryClient = useQueryClient();

  const [sourceMode, setSourceMode] = useState<'system' | 'manual'>('system');
  const [preceptoraName, setPreceptoraName] = useState(
    () => localStorage.getItem('sgae_preceptora_name') || ''
  );
  const [typeCode, setTypeCode] = useState('alumno_regular');
  const [cicloLectivoDestino, setCicloLectivoDestino] = useState(() =>
    String((Number(selectedYearId) || new Date().getFullYear()) + 1)
  );
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedDni, setSelectedDni] = useState('');

  // Campos para constancia personalizada (sin datos del sistema)
  const [manualApellido, setManualApellido] = useState('');
  const [manualNombre, setManualNombre] = useState('');
  const [manualDni, setManualDni] = useState('');
  const [manualCurso, setManualCurso] = useState('1');
  const [manualDivision, setManualDivision] = useState('1ª');
  const [manualTurno, setManualTurno] = useState('Mañana');

  const [issueDate, setIssueDate] = useState(getArgentinaDateISO());
  const [destinatario, setDestinatario] = useState('ante quien corresponda');
  const [textoPersonalizado, setTextoPersonalizado] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [generatedCert, setGeneratedCert] = useState<Certificate | null>(null);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow, noarchive';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  const templatesQuery = useQuery({ queryKey: ['templates'], queryFn: listTemplates });
  const studentsQuery = useQuery({ queryKey: ['students'], queryFn: listStudents });
  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', selectedYearId],
    queryFn: () => listEnrollments(selectedYearId),
  });
  const recentCertsQuery = useQuery({
    queryKey: ['certificates', selectedYearId],
    queryFn: () => listCertificates({ academicYearId: selectedYearId }),
  });

  const activeTemplates = (templatesQuery.data ?? []).filter((t) => t.active);
  const selectedTemplate =
    activeTemplates.find((t) => t.code === typeCode) ?? activeTemplates[0];

  const matchingStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    const all = (studentsQuery.data ?? []).filter(
      (s) => s.estadoInstitucional !== 'archivado'
    );
    if (!q) return all.slice(0, 12);
    return all
      .filter((s) => `${s.apellido} ${s.nombres} ${s.dni}`.toLowerCase().includes(q))
      .slice(0, 15);
  }, [studentsQuery.data, studentSearch]);

  const systemStudent = useMemo(
    () => (studentsQuery.data ?? []).find((s) => s.dni === selectedDni) ?? null,
    [studentsQuery.data, selectedDni]
  );

  const systemEnrollment = useMemo(() => {
    if (!systemStudent) return null;
    const list = (enrollmentsQuery.data ?? []).filter(
      (e) => e.studentDni === systemStudent.dni
    );
    return list.find((e) => e.status === 'activa') ?? list[0] ?? null;
  }, [enrollmentsQuery.data, systemStudent]);

  // Construcción del estudiante y matrícula efectivos (sistema o carga manual)
  const { effectiveStudent, effectiveEnrollment } = useMemo((): {
    effectiveStudent: Student | null;
    effectiveEnrollment: Enrollment | null;
  } => {
    if (sourceMode === 'system') {
      return { effectiveStudent: systemStudent, effectiveEnrollment: systemEnrollment };
    }
    const cleanDni = normalizeDni(manualDni);
    const ap = manualApellido.trim();
    const nom = manualNombre.trim();
    if (!ap || !nom || !cleanDni || !manualDivision.trim()) {
      return { effectiveStudent: null, effectiveEnrollment: null };
    }
    const now = getArgentinaNowISO();
    const yearNum = Number(manualCurso) || 1;
    const { label, legacyCode } = formatCourseLabels(yearNum, manualDivision.trim());
    const student: Student = {
      id: `manual_${cleanDni}`,
      dni: cleanDni,
      apellido: ap,
      nombres: nom,
      nombre: buildLegacyFullName(ap, nom),
      anioIngreso: Number(selectedYearId) || new Date().getFullYear(),
      estadoInstitucional: 'activo',
      createdAt: now,
      updatedAt: now,
    };
    const enrollment: Enrollment = {
      id: `manual_enr_${selectedYearId}_${cleanDni}`,
      studentId: student.id,
      studentDni: cleanDni,
      academicYearId: selectedYearId,
      courseId: `manual_${yearNum}_${manualDivision.trim()}`,
      yearNumber: yearNum,
      division: manualDivision.trim(),
      courseLabel: label,
      courseLegacyCode: legacyCode,
      shiftId: manualTurno.toLowerCase(),
      shiftName: manualTurno,
      startDate: issueDate,
      status: 'activa',
      createdBy: 'preceptoria_rapida',
      createdAt: now,
      updatedAt: now,
    };
    return { effectiveStudent: student, effectiveEnrollment: enrollment };
  }, [
    sourceMode,
    systemStudent,
    systemEnrollment,
    manualApellido,
    manualNombre,
    manualDni,
    manualCurso,
    manualDivision,
    manualTurno,
    selectedYearId,
    issueDate,
  ]);

  const previewTitle = useMemo(() => {
    if (!selectedTemplate) return 'CONSTANCIA DE ESTUDIANTE REGULAR';
    return renderTemplate(selectedTemplate.title, {
      cicloLectivo: effectiveEnrollment?.academicYearId || selectedYearId,
      cicloLectivoDestino,
    });
  }, [selectedTemplate, effectiveEnrollment, selectedYearId, cicloLectivoDestino]);

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
      motivo: '',
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
    textoPersonalizado,
  ]);

  const resetFormForNew = () => {
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
    if (!selectedTemplate || !effectiveStudent || !effectiveEnrollment) {
      toast.error(
        sourceMode === 'manual'
          ? 'Completá apellido, nombre, DNI, curso, división y turno.'
          : 'Seleccioná un estudiante con matrícula activa.'
      );
      return;
    }

    const issuerLabel = preceptoraName.trim()
      ? `Preceptoría (${preceptoraName.trim()})`
      : 'Preceptoría (Emisión rápida)';
    if (preceptoraName.trim()) {
      localStorage.setItem('sgae_preceptora_name', preceptoraName.trim());
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
        motivo: '',
        textoPersonalizado,
        observaciones,
        autoridadFirmante: '',
        issuedByDni: 'preceptoria_rapida',
        issuedByName: issuerLabel,
      });

      await logAudit({
        userDni: 'preceptoria_rapida',
        userName: issuerLabel,
        userRole: 'preceptoria',
        operation: 'certificate_issue',
        entity: 'certificates',
        entityId: cert.id,
        newSummary: {
          certificateNumber: cert.certificateNumber,
          type: cert.typeCode,
          studentDni: cert.studentDni,
          via: sourceMode === 'manual' ? '/emision (manual)' : '/emision',
        },
      });

      await queryClient.invalidateQueries({ queryKey: ['certificates'] });
      setGeneratedCert(cert);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al emitir la constancia.');
    } finally {
      setIssuing(false);
    }
  };

  const recentCerts = (recentCertsQuery.data ?? []).slice(0, 8);

  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col overflow-x-hidden">
      {/* Encabezado institucional */}
      <header className="institutional-banner text-white py-5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-white p-1.5 shadow-md shrink-0">
              <img
                src={settings.logoUrl || '/logo.png'}
                alt="Logo E.E.S. N° 28"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-blue-200 font-semibold truncate">
                E.E.S. N° {settings.schoolNumber} · {settings.district} · Ciclo {selectedYearId}
              </p>
              <h1 className="text-base sm:text-xl font-bold font-display leading-tight">
                Emisión Rápida de Constancias — Preceptoría
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <Link
              to="/validar"
              className="text-blue-100 hover:text-white inline-flex items-center gap-1"
            >
              <QrCode size={14} /> Validar QR
            </Link>
            <Link
              to="/login"
              className="text-blue-100 hover:text-white underline underline-offset-4"
            >
              Panel administrativo
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Formulario */}
          <form onSubmit={handleIssue} className="xl:col-span-6 space-y-5">
            <Card className="p-4 sm:p-6 space-y-4">
              {/* Selector de origen de datos */}
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
                  <FieldLabel>Preceptora / Responsable (opcional)</FieldLabel>
                  <div className="relative">
                    <UserCheck
                      size={15}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                    />
                    <Input
                      value={preceptoraName}
                      onChange={(e) => setPreceptoraName(e.target.value)}
                      placeholder="Tu nombre y apellido"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel required>Tipo de constancia</FieldLabel>
                  <Select value={typeCode} onChange={(e) => setTypeCode(e.target.value)}>
                    {activeTemplates.map((t) => (
                      <option key={t.id} value={t.code}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {sourceMode === 'system' ? (
                <>
                  {/* Buscador en base del sistema */}
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
                        placeholder="Escribí apellido o DNI..."
                        className="pl-10"
                      />
                    </div>
                    <div className="mt-2 max-h-44 overflow-y-auto border border-border-subtle rounded-xl divide-y divide-border-subtle">
                      {matchingStudents.map((s) => (
                        <button
                          key={s.dni}
                          type="button"
                          onClick={() => {
                            setSelectedDni(s.dni);
                            setStudentSearch(`${s.apellido}, ${s.nombres} (${s.dni})`);
                          }}
                          className={`w-full text-left px-3.5 py-2.5 text-xs flex items-center justify-between gap-2 hover:bg-surface-subtle cursor-pointer ${
                            selectedDni === s.dni
                              ? 'bg-brand-50 dark:bg-brand-900/30 font-semibold'
                              : ''
                          }`}
                        >
                          <span className="truncate">
                            {s.apellido}, {s.nombres}
                          </span>
                          <span className="font-mono text-ink-muted shrink-0">
                            {formatDniDisplay(s.dni)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {systemStudent && (
                    <div className="p-3.5 rounded-xl bg-surface-subtle border border-border-subtle text-xs space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-ink-primary">
                          {systemStudent.apellido}, {systemStudent.nombres} — DNI{' '}
                          {formatDniDisplay(systemStudent.dni)}
                        </span>
                        {systemEnrollment ? (
                          <Badge variant="success">
                            <CheckCircle2 size={11} /> Matriculado/a
                          </Badge>
                        ) : (
                          <Badge variant="danger">
                            <AlertTriangle size={11} /> Sin curso asignado
                          </Badge>
                        )}
                      </div>
                      {systemEnrollment && (
                        <p className="text-ink-secondary">
                          Curso: <strong>{systemEnrollment.courseLabel}</strong> · Turno{' '}
                          <strong>{systemEnrollment.shiftName}</strong> · Ciclo{' '}
                          <strong>{systemEnrollment.academicYearId}</strong>
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                /* Formulario de carga manual personalizada */
                <div className="p-4 rounded-xl bg-surface-subtle/70 border border-border-subtle space-y-3.5">
                  <p className="text-xs font-semibold text-brand-700 dark:text-brand-300">
                    Datos personalizados (no modifica la base del sistema)
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
                      <FieldLabel required>Turno</FieldLabel>
                      <Select value={manualTurno} onChange={(e) => setManualTurno(e.target.value)}>
                        <option value="Mañana">Mañana</option>
                        <option value="Tarde">Tarde</option>
                        <option value="Vespertino">Vespertino</option>
                        <option value="Noche">Noche</option>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel required>Curso (Año)</FieldLabel>
                      <Select value={manualCurso} onChange={(e) => setManualCurso(e.target.value)}>
                        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                          <option key={n} value={String(n)}>
                            {n}° año
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <FieldLabel required>División</FieldLabel>
                      <Input
                        value={manualDivision}
                        onChange={(e) => setManualDivision(e.target.value)}
                        placeholder="Ej. 1ª, 2ª, 3ª"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Fecha de emisión</FieldLabel>
                  <Input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Presentar ante (destinatario)</FieldLabel>
                  <Input
                    value={destinatario}
                    onChange={(e) => setDestinatario(e.target.value)}
                    placeholder="Ej. ANSES / ATE / quien corresponda"
                  />
                </div>
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

              {typeCode === 'constancia_general' && (
                <div>
                  <FieldLabel required>Texto de la constancia</FieldLabel>
                  <Textarea
                    value={textoPersonalizado}
                    onChange={(e) => setTextoPersonalizado(e.target.value)}
                    placeholder="Escribí el texto específico..."
                    required
                  />
                </div>
              )}

              <div>
                <FieldLabel>Observaciones (opcional)</FieldLabel>
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

          {/* Vista previa A4 */}
          <Card className="xl:col-span-6 p-4 sm:p-6 bg-white text-slate-900 border border-slate-300 shadow-md">
            <div className="border border-slate-900 relative overflow-hidden">
              <div className="grid grid-cols-12 border-b border-slate-900">
                <div className="col-span-3 border-r border-slate-900 p-2 sm:p-3 flex items-center justify-center">
                  <img
                    src={settings.logoUrl || '/logo.png'}
                    alt="Logo"
                    className="w-12 h-12 sm:w-16 sm:h-16 object-contain"
                  />
                </div>
                <div className="col-span-9 flex flex-col">
                  <div className="p-2.5 sm:p-3 border-b border-slate-900">
                    <p className="text-xs sm:text-sm font-extrabold tracking-tight text-slate-900">
                      ESCUELA DE EDUCACIÓN SECUNDARIA N° {settings.schoolNumber}
                    </p>
                    <p className="text-[11px] sm:text-xs font-medium text-slate-800">
                      GUSTAVO CERATI
                    </p>
                    <p className="text-[9px] sm:text-[10px] text-slate-600 leading-tight mt-0.5">
                      Provincia de {settings.province}.<br />
                      Dirección General de Cultura y Educación.<br />
                      Dirección Provincial de Educación Secundaria.
                    </p>
                  </div>
                  <div className="py-2 px-2 sm:px-3 text-center">
                    <h3 className="font-bold text-[11px] sm:text-sm tracking-wide text-slate-900 uppercase">
                      {previewTitle}
                    </h3>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 relative min-h-[280px] sm:min-h-[320px] flex flex-col justify-between">
                <img
                  src={settings.logoUrl || '/logo.png'}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none select-none opacity-[0.07] w-44 h-44 sm:w-56 sm:h-56 object-contain absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                />

                {selectedTemplate && effectiveStudent && effectiveEnrollment ? (
                  <div className="relative z-10 space-y-5">
                    <p className="text-right text-xs font-bold italic text-slate-900">
                      {settings.district}, {formatDateAR(issueDate)}
                    </p>
                    <div className="whitespace-pre-line text-xs sm:text-sm leading-relaxed text-slate-900">
                      {previewBody}
                    </div>
                    <div className="pt-10 grid grid-cols-2 gap-6 text-center text-[11px] sm:text-xs text-slate-800">
                      <div className="border-t border-slate-900 pt-1.5">
                        Sello del Establecimiento
                      </div>
                      <div className="border-t border-slate-900 pt-1.5">
                        Firma y Sello de la autoridad
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative z-10 py-14 text-center text-xs sm:text-sm text-slate-400">
                    {sourceMode === 'manual'
                      ? 'Completá los datos del estudiante para previsualizar la constancia.'
                      : 'Buscá y seleccioná un estudiante para previsualizar la constancia.'}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-900 px-3 py-2 text-center text-[9px] sm:text-[10px] text-slate-500">
                <p className="uppercase">
                  {settings.institutionName} | {settings.address} | TEL. {settings.phone} | C.E.:{' '}
                  {settings.email}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Últimas constancias emitidas: tabla en desktop, tarjetas verticales en mobile (sin scroll horizontal) */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border-subtle flex items-center justify-between">
            <h2 className="font-bold text-sm flex items-center gap-2">
              <FileBadge2 size={16} className="text-brand-500" />
              Últimas Constancias Emitidas
            </h2>
            <span className="text-xs text-ink-muted">Descarga e impresión directa</span>
          </div>

          {recentCerts.length === 0 ? (
            <div className="p-6 text-center text-xs text-ink-muted">
              Aún no hay constancias emitidas en este ciclo lectivo.
            </div>
          ) : (
            <>
              {/* Mobile: tarjetas verticales */}
              <div className="md:hidden divide-y divide-border-subtle">
                {recentCerts.map((c) => (
                  <div key={c.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-ink-primary truncate">
                          {c.snapshot.apellidoNombre}
                        </p>
                        <p className="text-xs text-ink-muted font-mono">
                          DNI {formatDniDisplay(c.studentDni)} · N.º {c.certificateNumber}
                        </p>
                      </div>
                      <Badge variant="brand" className="shrink-0">
                        {c.snapshot.anio} {c.snapshot.division}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-ink-secondary">
                      <span>Turno {c.snapshot.turno}</span>
                      <span>Emisión: {formatDateAR(c.issueDate)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void printCertificatePdf(c, settings)}
                      >
                        <Printer size={13} /> Imprimir
                      </Button>
                      <Button
                        size="sm"
                        variant="emerald"
                        onClick={() => void downloadCertificatePdf(c, settings)}
                      >
                        <Download size={13} /> Descargar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: tabla */}
              <div className="hidden md:block">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-subtle text-ink-muted uppercase">
                    <tr>
                      <th className="px-4 py-2.5">N.º Certificado</th>
                      <th className="px-4 py-2.5">Estudiante</th>
                      <th className="px-4 py-2.5">Curso</th>
                      <th className="px-4 py-2.5">Fecha</th>
                      <th className="px-4 py-2.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {recentCerts.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2.5 font-mono font-bold text-brand-600">
                          {c.certificateNumber}
                        </td>
                        <td className="px-4 py-2.5 font-semibold">{c.snapshot.apellidoNombre}</td>
                        <td className="px-4 py-2.5">
                          {c.snapshot.anio} {c.snapshot.division} ({c.snapshot.turno})
                        </td>
                        <td className="px-4 py-2.5">{formatDateAR(c.issueDate)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void printCertificatePdf(c, settings)}
                            >
                              <Printer size={13} /> Imprimir
                            </Button>
                            <Button
                              size="sm"
                              variant="emerald"
                              onClick={() => void downloadCertificatePdf(c, settings)}
                            >
                              <Download size={13} /> Descargar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </main>

      <CertificateSuccessModal
        certificate={generatedCert}
        settings={settings}
        onGenerateNew={resetFormForNew}
        onClose={() => setGeneratedCert(null)}
      />
    </div>
  );
};
