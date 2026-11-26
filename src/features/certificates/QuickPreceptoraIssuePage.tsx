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
import { downloadCertificatePdf } from '@/templates/pdf/certificatePdfGenerator';
import {
  formatDateAR,
  formatDateLongAR,
  formatDniDisplay,
  getArgentinaDateISO,
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

/**
 * Espacio de emisión rápida para Preceptoría (`/emision`), accesible sin registro
 * ni inicio de sesión, conectado en tiempo real a la matrícula oficial y al sistema
 * de numeración atómica + códigos QR.
 */
export const QuickPreceptoraIssuePage: React.FC = () => {
  const { selectedYearId, settings } = useAcademicYear();
  const queryClient = useQueryClient();

  const [preceptoraName, setPreceptoraName] = useState(
    () => localStorage.getItem('sgae_preceptora_name') || ''
  );
  const [typeCode, setTypeCode] = useState('alumno_regular');
  const [cicloLectivoDestino, setCicloLectivoDestino] = useState(() =>
    String((Number(selectedYearId) || new Date().getFullYear()) + 1)
  );
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedDni, setSelectedDni] = useState('');
  const [issueDate, setIssueDate] = useState(getArgentinaDateISO());
  const [destinatario, setDestinatario] = useState('ante quien corresponda');
  const [textoPersonalizado, setTextoPersonalizado] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [issuing, setIssuing] = useState(false);

  // Evitar indexación en buscadores
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

  const selectedStudent = useMemo(
    () => (studentsQuery.data ?? []).find((s) => s.dni === selectedDni) ?? null,
    [studentsQuery.data, selectedDni]
  );

  const studentEnrollment = useMemo(() => {
    if (!selectedStudent) return null;
    const list = (enrollmentsQuery.data ?? []).filter(
      (e) => e.studentDni === selectedStudent.dni
    );
    return list.find((e) => e.status === 'activa') ?? list[0] ?? null;
  }, [enrollmentsQuery.data, selectedStudent]);

  const previewTitle = useMemo(() => {
    if (!selectedTemplate) return 'CONSTANCIA DE ESTUDIANTE REGULAR';
    return renderTemplate(selectedTemplate.title, {
      cicloLectivo: studentEnrollment?.academicYearId || selectedYearId,
      cicloLectivoDestino,
    });
  }, [selectedTemplate, studentEnrollment, selectedYearId, cicloLectivoDestino]);

  const previewBody = useMemo(() => {
    if (!selectedTemplate || !selectedStudent || !studentEnrollment) return '';
    return renderTemplate(selectedTemplate.body, {
      apellido: selectedStudent.apellido,
      nombre: selectedStudent.nombres,
      apellidoNombre: `${selectedStudent.apellido}, ${selectedStudent.nombres}`,
      dni: formatDniDisplay(selectedStudent.dni),
      anio: `${studentEnrollment.yearNumber}°`,
      division: studentEnrollment.division,
      turno: studentEnrollment.shiftName,
      cicloLectivo: studentEnrollment.academicYearId,
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
    selectedStudent,
    studentEnrollment,
    cicloLectivoDestino,
    issueDate,
    settings,
    destinatario,
    textoPersonalizado,
  ]);

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate || !selectedStudent || !studentEnrollment) {
      toast.error('Seleccioná un estudiante con matrícula activa.');
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
        student: selectedStudent,
        enrollment: studentEnrollment,
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
          via: '/emision',
        },
      });

      await queryClient.invalidateQueries({ queryKey: ['certificates'] });
      await downloadCertificatePdf(cert, settings);
      toast.success(`Constancia ${cert.certificateNumber} generada y descargada.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al emitir la constancia.');
    } finally {
      setIssuing(false);
    }
  };

  const recentCerts = (recentCertsQuery.data ?? []).slice(0, 6);

  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col">
      {/* Encabezado institucional */}
      <header className="institutional-banner text-white py-5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-white p-1.5 shadow-md shrink-0">
              <img
                src={settings.logoUrl || '/logo.png'}
                alt="Logo E.E.S. N° 28"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-blue-200 font-semibold">
                E.E.S. N° {settings.schoolNumber} · {settings.district}, {settings.province} · Ciclo{' '}
                {selectedYearId}
              </p>
              <h1 className="text-lg sm:text-xl font-bold font-display">
                Emisión Rápida de Constancias — Preceptoría
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <Link to="/validar" className="text-blue-100 hover:text-white inline-flex items-center gap-1">
              <QrCode size={14} /> Validar QR
            </Link>
            <Link to="/login" className="text-blue-100 hover:text-white underline underline-offset-4">
              Panel administrativo
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Formulario */}
          <form onSubmit={handleIssue} className="xl:col-span-6 space-y-5">
            <Card className="p-6 space-y-4">
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

              {/* Buscador */}
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
                      className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between hover:bg-surface-subtle cursor-pointer ${
                        selectedDni === s.dni
                          ? 'bg-brand-50 dark:bg-brand-900/30 font-semibold'
                          : ''
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

              {selectedStudent && (
                <div className="p-3.5 rounded-xl bg-surface-subtle border border-border-subtle text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink-primary">
                      {selectedStudent.apellido}, {selectedStudent.nombres} — DNI{' '}
                      {formatDniDisplay(selectedStudent.dni)}
                    </span>
                    {studentEnrollment ? (
                      <Badge variant="success">
                        <CheckCircle2 size={11} /> Matriculado/a
                      </Badge>
                    ) : (
                      <Badge variant="danger">
                        <AlertTriangle size={11} /> Sin curso asignado
                      </Badge>
                    )}
                  </div>
                  {studentEnrollment && (
                    <p className="text-ink-secondary">
                      Curso: <strong>{studentEnrollment.courseLabel}</strong> · Turno{' '}
                      <strong>{studentEnrollment.shiftName}</strong> · Ciclo{' '}
                      <strong>{studentEnrollment.academicYearId}</strong>
                    </p>
                  )}
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
                disabled={!selectedStudent || !studentEnrollment}
              >
                <Download size={16} /> Emitir y descargar PDF con QR
              </Button>
            </Card>
          </form>

          {/* Vista previa A4 */}
          <Card className="xl:col-span-6 p-6 bg-white text-slate-900 border border-slate-300 shadow-md">
            <div className="border border-slate-900 relative overflow-hidden">
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
                      Provincia de {settings.province}.<br />
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

              <div className="p-5 sm:p-6 relative min-h-[320px] flex flex-col justify-between">
                <img
                  src={settings.logoUrl || '/logo.png'}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none select-none opacity-[0.07] w-56 h-56 object-contain absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                />

                {selectedTemplate && selectedStudent && studentEnrollment ? (
                  <div className="relative z-10 space-y-6">
                    <p className="text-right text-xs font-bold italic text-slate-900">
                      {settings.district}, {formatDateAR(issueDate)}
                    </p>
                    <div className="whitespace-pre-line text-sm leading-relaxed text-slate-900">
                      {previewBody}
                    </div>
                    <div className="pt-12 grid grid-cols-2 gap-8 text-center text-xs text-slate-800">
                      <div className="border-t border-slate-900 pt-1.5">Sello del Establecimiento</div>
                      <div className="border-t border-slate-900 pt-1.5">
                        Firma y Sello de la autoridad
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative z-10 py-14 text-center text-sm text-slate-400">
                    Buscá y seleccioná un estudiante para previsualizar la constancia.
                  </div>
                )}
              </div>

              <div className="border-t border-slate-900 px-4 py-2 text-center text-[10px] text-slate-500">
                <p className="uppercase">
                  {settings.institutionName} | {settings.address} | TEL. {settings.phone} | C.E.:{' '}
                  {settings.email}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Últimas constancias emitidas con descarga directa */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border-subtle flex items-center justify-between">
            <h2 className="font-bold text-sm flex items-center gap-2">
              <FileBadge2 size={16} className="text-brand-500" />
              Últimas Constancias Emitidas
            </h2>
            <span className="text-xs text-ink-muted">Descarga directa en PDF</span>
          </div>
          {recentCerts.length === 0 ? (
            <div className="p-6 text-center text-xs text-ink-muted">
              Aún no hay constancias emitidas en este ciclo lectivo.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-subtle text-ink-muted uppercase">
                  <tr>
                    <th className="px-4 py-2.5">N.º Certificado</th>
                    <th className="px-4 py-2.5">Estudiante</th>
                    <th className="px-4 py-2.5">Curso</th>
                    <th className="px-4 py-2.5">Fecha</th>
                    <th className="px-4 py-2.5 text-right">PDF</th>
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
                        <Button
                          size="sm"
                          variant="emerald"
                          onClick={() => void downloadCertificatePdf(c, settings)}
                        >
                          <Download size={13} /> Descargar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};
