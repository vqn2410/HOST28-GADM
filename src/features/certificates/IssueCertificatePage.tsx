import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileBadge2,
  Download,
  CheckCircle2,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { listStudents } from '@/repositories/studentRepository';
import { listStudentEnrollments } from '@/repositories/academicRepository';
import {
  buildCertificateSnapshot,
  issueCertificate,
  listTemplates,
} from '@/repositories/certificateRepository';
import { logAudit } from '@/repositories/auditRepository';
import { downloadCertificatePdf } from '@/templates/pdf/certificatePdfGenerator';
import {
  formatDateLongAR,
  formatDniDisplay,
  getArgentinaDateISO,
} from '@/lib/utils/formatters';
import type { Certificate } from '@/types/domain';

export const IssueCertificatePage: React.FC<{ defaultTypeCode?: string }> = ({
  defaultTypeCode,
}) => {
  const { user } = useAuth();
  const { academicYears, selectedYearId, settings } = useAcademicYear();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const preselectedDni = searchParams.get('dni') || '';
  const replacesCertId = searchParams.get('reemplaza') || null;

  const [typeCode, setTypeCode] = useState(defaultTypeCode || 'alumno_regular');
  const [studentQueryText, setStudentQueryText] = useState(preselectedDni);
  const [selectedDni, setSelectedDni] = useState(preselectedDni);
  const [academicYearId, setAcademicYearId] = useState(selectedYearId);
  const [issueDate, setIssueDate] = useState(getArgentinaDateISO());
  const [destinatario, setDestinatario] = useState('ante quien corresponda');
  const [motivo, setMotivo] = useState('');
  const [textoPersonalizado, setTextoPersonalizado] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [autoridadFirmante, setAutoridadFirmante] = useState(
    settings.directorName || settings.authorizedSigners[0] || 'Dirección'
  );
  const [issuing, setIssuing] = useState(false);
  const [issuedCert, setIssuedCert] = useState<Certificate | null>(null);

  const templatesQuery = useQuery({ queryKey: ['templates'], queryFn: listTemplates });
  const studentsQuery = useQuery({ queryKey: ['students'], queryFn: listStudents });
  const studentEnrollmentsQuery = useQuery({
    queryKey: ['student-enrollments', selectedDni],
    queryFn: () => listStudentEnrollments(selectedDni),
    enabled: Boolean(selectedDni),
  });

  const templates = (templatesQuery.data ?? []).filter((t) => t.active);
  const activeTemplate =
    templates.find((t) => t.code === typeCode) ?? templates[0] ?? null;

  const matchingStudents = useMemo(() => {
    const q = studentQueryText.trim().toLowerCase();
    if (!q) return (studentsQuery.data ?? []).slice(0, 8);
    return (studentsQuery.data ?? [])
      .filter((s) => `${s.apellido} ${s.nombres} ${s.dni}`.toLowerCase().includes(q))
      .slice(0, 10);
  }, [studentsQuery.data, studentQueryText]);

  const selectedStudent = useMemo(
    () => (studentsQuery.data ?? []).find((s) => s.dni === selectedDni) ?? null,
    [studentsQuery.data, selectedDni]
  );

  // Recuperar automáticamente la matrícula correspondiente al ciclo lectivo seleccionado
  const activeEnrollment = useMemo(() => {
    const list = (studentEnrollmentsQuery.data ?? []).filter(
      (e) => e.academicYearId === academicYearId
    );
    return list.find((e) => e.status === 'activa') ?? list[0] ?? null;
  }, [studentEnrollmentsQuery.data, academicYearId]);

  const todayISO = getArgentinaDateISO();
  const isHistoricalDate = issueDate !== todayISO;

  // Vista previa en vivo del contenido renderizado
  const previewSnapshot = useMemo(() => {
    if (!activeTemplate || !selectedStudent || !activeEnrollment) return null;
    return buildCertificateSnapshot(
      {
        template: activeTemplate,
        student: selectedStudent,
        enrollment: activeEnrollment,
        settings,
        issueDate,
        destinatario,
        motivo,
        textoPersonalizado,
        observaciones,
        autoridadFirmante,
        issuedByDni: user?.dni || '',
        issuedByName: user ? `${user.apellido}, ${user.nombre}` : '',
      },
      `${issueDate.slice(0, 4)}-XXXXXX`,
      'VISTA-PREVIA-QR',
      'https://validacion-institucional/validar/...'
    );
  }, [
    activeTemplate,
    selectedStudent,
    activeEnrollment,
    settings,
    issueDate,
    destinatario,
    motivo,
    textoPersonalizado,
    observaciones,
    autoridadFirmante,
    user,
  ]);

  const handleConfirmIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeTemplate || !selectedStudent || !activeEnrollment) {
      toast.error('Completá estudiante, matrícula válida y tipo de certificado.');
      return;
    }
    setIssuing(true);
    try {
      const cert = await issueCertificate({
        template: activeTemplate,
        student: selectedStudent,
        enrollment: activeEnrollment,
        settings,
        issueDate,
        destinatario,
        motivo,
        textoPersonalizado,
        observaciones,
        autoridadFirmante,
        issuedByDni: user.dni,
        issuedByName: `${user.apellido}, ${user.nombre}`,
        replacesCertificateId: replacesCertId,
      });

      await logAudit({
        userDni: user.dni,
        userName: `${user.apellido}, ${user.nombre}`,
        userRole: user.roleId,
        operation: replacesCertId
          ? 'certificate_replace'
          : isHistoricalDate
            ? 'certificate_issue_custom_date'
            : 'certificate_issue',
        entity: 'sgae_certificates',
        entityId: cert.id,
        newSummary: {
          certificateNumber: cert.certificateNumber,
          typeCode: cert.typeCode,
          issueDate: cert.issueDate,
          studentDni: cert.studentDni,
        },
      });

      await queryClient.invalidateQueries({ queryKey: ['certificates'] });
      setIssuedCert(cert);
      toast.success(`Certificado ${cert.certificateNumber} emitido con éxito.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al emitir certificado.');
    } finally {
      setIssuing(false);
    }
  };

  if (issuedCert) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <Card className="p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-brand-50 dark:bg-emerald-950/40 text-emerald-brand-600 flex items-center justify-center mx-auto">
            <CheckCircle2 size={28} />
          </div>
          <h2 className="text-2xl font-bold font-display text-ink-primary">
            Certificado Emitido y Registrado
          </h2>
          <p className="text-sm text-ink-secondary">
            N.º <strong className="font-mono">{issuedCert.certificateNumber}</strong> ·{' '}
            {issuedCert.typeName} para <strong>{issuedCert.snapshot.apellidoNombre}</strong>
          </p>
          <div className="p-3 rounded-xl bg-surface-subtle text-xs font-mono text-ink-secondary break-all">
            Token QR: {issuedCert.token}
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button
              variant="emerald"
              onClick={() => void downloadCertificatePdf(issuedCert, settings)}
            >
              <Download size={16} /> Descargar PDF A4 con QR
            </Button>
            <Button variant="outline" onClick={() => navigate(`/certificados/${issuedCert.id}`)}>
              Ver detalle documental
            </Button>
            <Button variant="ghost" onClick={() => setIssuedCert(null)}>
              Emitir otro certificado
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={replacesCertId ? 'Emitir Certificado de Reemplazo' : 'Emisión de Certificados y Constancias'}
        subtitle="Los datos personales y la matrícula se recuperan automáticamente. El documento genera numeración correlativa y código QR verificable."
        actions={
          <Link to="/certificados">
            <Button variant="outline" size="sm">
              <ArrowLeft size={15} /> Ir al historial
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Formulario */}
        <form onSubmit={handleConfirmIssue} className="xl:col-span-6 space-y-5">
          <Card className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Tipo de certificado</FieldLabel>
                <Select value={typeCode} onChange={(e) => setTypeCode(e.target.value)}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.code}>
                      {t.name} (v{t.version})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <FieldLabel required>Ciclo lectivo</FieldLabel>
                <Select
                  value={academicYearId}
                  onChange={(e) => setAcademicYearId(e.target.value)}
                >
                  {academicYears.map((y) => (
                    <option key={y.id} value={y.id}>
                      Ciclo {y.year}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Buscador de estudiante */}
            <div>
              <FieldLabel required>Buscar estudiante (DNI, apellido o nombre)</FieldLabel>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-3 text-ink-muted" />
                <Input
                  value={studentQueryText}
                  onChange={(e) => setStudentQueryText(e.target.value)}
                  placeholder="Escribí DNI o apellido..."
                  className="pl-9"
                />
              </div>
              <div className="mt-2 max-h-40 overflow-y-auto border border-border-subtle rounded-xl divide-y divide-border-subtle">
                {matchingStudents.map((s) => (
                  <button
                    key={s.dni}
                    type="button"
                    onClick={() => {
                      setSelectedDni(s.dni);
                      setStudentQueryText(`${s.apellido}, ${s.nombres} (${s.dni})`);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-surface-subtle cursor-pointer ${
                      selectedDni === s.dni ? 'bg-brand-50 dark:bg-brand-900/40 font-semibold' : ''
                    }`}
                  >
                    <span>
                      {s.apellido}, {s.nombres}
                    </span>
                    <span className="font-mono text-ink-muted">DNI {s.dni}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Datos recuperados automáticamente */}
            {selectedStudent && (
              <div className="p-3.5 rounded-xl bg-surface-subtle border border-border-subtle text-xs space-y-1">
                <p className="font-bold text-ink-primary">
                  Datos recuperados: {selectedStudent.apellido}, {selectedStudent.nombres} · DNI{' '}
                  {formatDniDisplay(selectedStudent.dni)}
                </p>
                {activeEnrollment ? (
                  <p className="text-emerald-brand-600 font-semibold">
                    Matrícula {academicYearId}: {activeEnrollment.yearNumber}° año,{' '}
                    {activeEnrollment.division} división — Turno {activeEnrollment.shiftName}
                  </p>
                ) : (
                  <p className="text-amber-600 font-semibold flex items-center gap-1.5">
                    <AlertTriangle size={14} /> El estudiante no posee matrícula registrada en el
                    ciclo {academicYearId}. Matriculalo antes de emitir.
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
                {isHistoricalDate && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    Fecha distinta a hoy: verificá que la matrícula corresponda a esa fecha. La hora
                    real de generación se registra por separado.
                  </p>
                )}
              </div>
              <div>
                <FieldLabel>Autoridad firmante</FieldLabel>
                <Input
                  value={autoridadFirmante}
                  onChange={(e) => setAutoridadFirmante(e.target.value)}
                  placeholder="Ej. Prof. Patricia González — Directora"
                />
              </div>
            </div>

            <div>
              <FieldLabel>Destinatario</FieldLabel>
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
                placeholder="Ej. Trámite obra social / Asignación familiar"
              />
            </div>

            {typeCode === 'constancia_general' && (
              <div>
                <FieldLabel required>Texto personalizado</FieldLabel>
                <Textarea
                  value={textoPersonalizado}
                  onChange={(e) => setTextoPersonalizado(e.target.value)}
                  placeholder="Escribí el detalle específico de la constancia..."
                  required
                />
              </div>
            )}

            <div>
              <FieldLabel>Observaciones (opcional)</FieldLabel>
              <Input
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Se incluirá al pie del cuerpo documental"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={issuing}
              disabled={!selectedStudent || !activeEnrollment || !activeTemplate}
            >
              <FileBadge2 size={16} /> Confirmar emisión y generar PDF con QR
            </Button>
          </Card>
        </form>

        {/* Vista Previa Institucional A4 */}
        <div className="xl:col-span-6">
          <Card className="p-6 sm:p-8 bg-white dark:bg-slate-900 border-2 border-brand-500/20">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4 mb-5">
              <div className="flex items-center gap-3">
                <img
                  src={settings.logoUrl || '/logo.png'}
                  alt="Logo"
                  className="w-11 h-11 object-contain"
                />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">
                    Provincia de Buenos Aires · DGCyE
                  </p>
                  <p className="font-display font-bold text-sm text-ink-primary">
                    {settings.institutionName}
                  </p>
                  <p className="text-[11px] text-ink-secondary">
                    Distrito de {settings.district} · CUE {settings.cue}
                  </p>
                </div>
              </div>
              <Badge variant="brand">Vista previa A4</Badge>
            </div>

            {previewSnapshot ? (
              <div className="space-y-5 text-sm text-ink-primary">
                <h3 className="text-center font-display font-extrabold text-base uppercase tracking-wide">
                  {previewSnapshot.renderedTitle}
                </h3>

                <div className="p-3.5 rounded-xl bg-surface-subtle grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-ink-muted block">Estudiante</span>
                    <strong>{previewSnapshot.apellidoNombre}</strong>
                  </div>
                  <div>
                    <span className="text-ink-muted block">DNI</span>
                    <strong className="font-mono">{formatDniDisplay(previewSnapshot.dni)}</strong>
                  </div>
                  <div>
                    <span className="text-ink-muted block">Curso y división</span>
                    <strong>
                      {previewSnapshot.anio} año — {previewSnapshot.division}
                    </strong>
                  </div>
                  <div>
                    <span className="text-ink-muted block">Turno / Ciclo</span>
                    <strong>
                      {previewSnapshot.turno} · {previewSnapshot.cicloLectivo}
                    </strong>
                  </div>
                </div>

                <div className="whitespace-pre-line leading-relaxed text-justify text-ink-secondary">
                  {previewSnapshot.renderedBody}
                </div>

                {observaciones.trim() && (
                  <p className="text-xs italic text-ink-muted">
                    Observaciones: {observaciones.trim()}
                  </p>
                )}

                <p className="text-xs text-ink-secondary pt-2">
                  {settings.issuePlace}, {formatDateLongAR(issueDate)}.
                </p>

                <div className="grid grid-cols-2 gap-8 pt-10 text-center text-xs text-ink-muted">
                  <div className="border-t border-border-strong pt-2">Sello Institucional</div>
                  <div className="border-t border-border-strong pt-2">
                    {autoridadFirmante || 'Firma y sello de la autoridad escolar'}
                    <span className="block text-[10px]">Firma ológrafa</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-border-subtle text-[11px] text-ink-muted">
                  Al confirmar la emisión, el PDF A4 incluirá el código QR único, número correlativo
                  atómico y token de validación pública.
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-ink-muted">
                Seleccioná un estudiante con matrícula activa para visualizar la vista previa del
                certificado.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
