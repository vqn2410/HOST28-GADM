import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Files, Archive, FileText, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { listStudents } from '@/repositories/studentRepository';
import { listCourses, listEnrollments, listShifts } from '@/repositories/academicRepository';
import { issueCertificate, listTemplates } from '@/repositories/certificateRepository';
import { logAudit } from '@/repositories/auditRepository';
import {
  downloadCertificatesZip,
  downloadConsolidatedCertificatesPdf,
} from '@/templates/pdf/certificatePdfGenerator';
import { formatDniDisplay, getArgentinaDateISO } from '@/lib/utils/formatters';
import {
  Badge,
  Button,
  Card,
  FieldLabel,
  Input,
  PageHeader,
  Select,
} from '@/components/ui/Primitives';
import type { Certificate } from '@/types/domain';

export const BulkCertificateIssuePage: React.FC = () => {
  const { user } = useAuth();
  const { selectedYearId, settings } = useAcademicYear();
  const queryClient = useQueryClient();

  const [typeCode, setTypeCode] = useState('alumno_regular');
  const [filterMode, setFilterMode] = useState<'course' | 'shift' | 'all'>('course');
  const [courseId, setCourseId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [issueDate, setIssueDate] = useState(getArgentinaDateISO());
  const [destinatario, setDestinatario] = useState('ante quien corresponda');
  const [motivo, setMotivo] = useState('');
  const [selectedDnis, setSelectedDnis] = useState<Record<string, boolean>>({});
  const [batchId] = useState(() => `bulk_${Date.now()}`);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [emittedCerts, setEmittedCerts] = useState<Certificate[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const templatesQuery = useQuery({ queryKey: ['templates'], queryFn: listTemplates });
  const studentsQuery = useQuery({ queryKey: ['students'], queryFn: listStudents });
  const coursesQuery = useQuery({
    queryKey: ['courses', selectedYearId],
    queryFn: () => listCourses(selectedYearId),
  });
  const shiftsQuery = useQuery({ queryKey: ['shifts'], queryFn: listShifts });
  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', selectedYearId],
    queryFn: () => listEnrollments(selectedYearId),
  });

  const studentsByDni = useMemo(
    () => new Map((studentsQuery.data ?? []).map((s) => [s.dni, s])),
    [studentsQuery.data]
  );

  const candidates = useMemo(() => {
    const active = (enrollmentsQuery.data ?? []).filter((e) => e.status === 'activa');
    return active
      .filter((e) => {
        if (filterMode === 'course') return courseId ? e.courseId === courseId : false;
        if (filterMode === 'shift') return shiftId ? e.shiftId === shiftId : false;
        return true;
      })
      .map((e) => ({ enrollment: e, student: studentsByDni.get(e.studentDni) }))
      .filter(
        (x): x is { enrollment: typeof x.enrollment; student: NonNullable<typeof x.student> } =>
          Boolean(x.student)
      )
      .sort((a, b) => a.student.apellido.localeCompare(b.student.apellido, 'es'));
  }, [enrollmentsQuery.data, filterMode, courseId, shiftId, studentsByDni]);

  const selectedItems = candidates.filter((c) => selectedDnis[c.student.dni]);

  const handleBulkIssue = async () => {
    if (!user) return;
    const template = (templatesQuery.data ?? []).find((t) => t.code === typeCode);
    if (!template || selectedItems.length === 0) {
      toast.error('Seleccioná una plantilla y al menos un estudiante.');
      return;
    }

    setRunning(true);
    setProgress({ current: 0, total: selectedItems.length });
    setEmittedCerts([]);
    setErrors([]);

    const created: Certificate[] = [];
    const errs: string[] = [];

    for (let i = 0; i < selectedItems.length; i++) {
      const { student, enrollment } = selectedItems[i];
      try {
        const cert = await issueCertificate({
          template,
          student,
          enrollment,
          settings,
          issueDate,
          destinatario,
          motivo,
          textoPersonalizado: '',
          observaciones: '',
          autoridadFirmante: '',
          issuedByDni: user.dni,
          issuedByName: `${user.apellido}, ${user.nombre}`,
          idempotencyKey: `${batchId}_${typeCode}_${student.dni}_${issueDate}`,
        });
        created.push(cert);
      } catch (err) {
        errs.push(
          `${student.nombre} (${student.dni}): ${err instanceof Error ? err.message : 'Error'}`
        );
      }
      setProgress({ current: i + 1, total: selectedItems.length });
    }

    await logAudit({
      userDni: user.dni,
      userName: `${user.apellido}, ${user.nombre}`,
      userRole: user.roleId,
      operation: 'certificate_issue_bulk',
      entity: 'certificates',
      entityId: batchId,
      newSummary: { emitted: created.length, errors: errs.length, typeCode },
    });

    await queryClient.invalidateQueries({ queryKey: ['certificates'] });
    setEmittedCerts(created);
    setErrors(errs);
    setRunning(false);
    toast.success(`Emisión masiva finalizada: ${created.length} certificados generados.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Emisión Masiva de Certificados — Ciclo ${selectedYearId}`}
        subtitle="Generá certificados individuales con numeración y token QR propios para todo un curso, turno o selección personalizada."
        actions={
          <Link to="/certificados">
            <Button variant="outline" size="sm">
              <ArrowLeft size={15} /> Historial
            </Button>
          </Link>
        }
      />

      <Card className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <FieldLabel required>Tipo de certificado</FieldLabel>
            <Select value={typeCode} onChange={(e) => setTypeCode(e.target.value)}>
              {(templatesQuery.data ?? [])
                .filter((t) => t.active)
                .map((t) => (
                  <option key={t.id} value={t.code}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <FieldLabel required>Alcance de selección</FieldLabel>
            <Select
              value={filterMode}
              onChange={(e) => {
                setFilterMode(e.target.value as 'course' | 'shift' | 'all');
                setSelectedDnis({});
              }}
            >
              <option value="course">Por curso / división</option>
              <option value="shift">Por turno</option>
              <option value="all">Toda la matrícula activa</option>
            </Select>
          </div>

          {filterMode === 'course' && (
            <div>
              <FieldLabel required>Curso</FieldLabel>
              <Select
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  setSelectedDnis({});
                }}
              >
                <option value="">— Seleccionar curso —</option>
                {(coursesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({c.shiftName})
                  </option>
                ))}
              </Select>
            </div>
          )}

          {filterMode === 'shift' && (
            <div>
              <FieldLabel required>Turno</FieldLabel>
              <Select
                value={shiftId}
                onChange={(e) => {
                  setShiftId(e.target.value);
                  setSelectedDnis({});
                }}
              >
                <option value="">— Seleccionar turno —</option>
                {(shiftsQuery.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <FieldLabel required>Fecha de emisión</FieldLabel>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FieldLabel>Destinatario</FieldLabel>
            <Input value={destinatario} onChange={(e) => setDestinatario(e.target.value)} />
          </div>
          <div>
            <FieldLabel>Motivo (opcional)</FieldLabel>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>
      </Card>

      {/* Lista de estudiantes */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border-subtle flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold">
            Estudiantes disponibles: {candidates.length} · Seleccionados:{' '}
            <span className="text-brand-600">{selectedItems.length}</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const all: Record<string, boolean> = {};
                candidates.forEach((c) => (all[c.student.dni] = true));
                setSelectedDnis(all);
              }}
            >
              Seleccionar todos
            </Button>
            <Button
              variant="emerald"
              size="sm"
              loading={running}
              disabled={selectedItems.length === 0}
              onClick={handleBulkIssue}
            >
              <Files size={15} /> Emitir {selectedItems.length} certificado(s)
            </Button>
          </div>
        </div>

        {running && (
          <div className="p-4 bg-brand-50 dark:bg-brand-900/30 border-b border-border-subtle">
            <div className="flex justify-between text-xs font-semibold mb-1.5">
              <span>Generando certificados individuales con token QR...</span>
              <span>
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="w-full h-2 bg-border-subtle rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{
                  width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        <div className="max-h-80 overflow-y-auto divide-y divide-border-subtle">
          {candidates.map(({ student, enrollment }) => (
            <label
              key={student.dni}
              className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface-subtle/50 cursor-pointer"
            >
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={Boolean(selectedDnis[student.dni])}
                  onChange={(e) =>
                    setSelectedDnis((prev) => ({ ...prev, [student.dni]: e.target.checked }))
                  }
                />
                <span className="font-medium">
                  {student.apellido}, {student.nombres}
                </span>
                <span className="text-xs font-mono text-ink-muted">
                  DNI {formatDniDisplay(student.dni)}
                </span>
              </span>
              <Badge variant="neutral">
                {enrollment.courseLabel} ({enrollment.shiftName})
              </Badge>
            </label>
          ))}
        </div>
      </Card>

      {/* Descargas masivas */}
      {emittedCerts.length > 0 && (
        <Card className="p-6 space-y-4 border-emerald-brand-500/40">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={20} className="text-emerald-brand-500" />
              <div>
                <h3 className="font-bold text-ink-primary">
                  {emittedCerts.length} certificados emitidos correctamente
                </h3>
                <p className="text-xs text-ink-secondary">
                  Cada certificado posee su número correlativo y código QR independiente.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  void downloadConsolidatedCertificatesPdf(
                    emittedCerts,
                    settings,
                    `certificados_consolidados_${selectedYearId}.pdf`
                  )
                }
              >
                <FileText size={15} /> Descargar PDF consolidado
              </Button>
              <Button
                variant="emerald"
                size="sm"
                onClick={() =>
                  void downloadCertificatesZip(
                    emittedCerts,
                    settings,
                    `certificados_individuales_${selectedYearId}.zip`
                  )
                }
              >
                <Archive size={15} /> Descargar ZIP (PDFs individuales)
              </Button>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="p-3 rounded-xl bg-red-50 text-xs text-red-700 space-y-1">
              {errors.map((e, i) => (
                <p key={i}>• {e}</p>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
