import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Download, FileArchive, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FieldLabel,
  Input,
  PageHeader,
  Select,
} from '@/components/ui/Primitives';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { listStudents } from '@/repositories/studentRepository';
import { listCourses, listEnrollments } from '@/repositories/academicRepository';
import { issueCertificate, listTemplates } from '@/repositories/certificateRepository';
import { logAudit } from '@/repositories/auditRepository';
import {
  downloadCertificatesZip,
  downloadConsolidatedCertificatesPdf,
} from '@/templates/pdf/certificatePdfGenerator';
import { formatDniDisplay, getArgentinaDateISO } from '@/lib/utils/formatters';
import type { Certificate, Student } from '@/types/domain';

export const BulkCertificatesPage: React.FC = () => {
  const { user } = useAuth();
  const { selectedYearId, settings } = useAcademicYear();
  const queryClient = useQueryClient();

  const [typeCode, setTypeCode] = useState('alumno_regular');
  const [courseFilter, setCourseFilter] = useState('todos');
  const [shiftFilter, setShiftFilter] = useState('todos');
  const [issueDate, setIssueDate] = useState(getArgentinaDateISO());
  const [destinatario, setDestinatario] = useState('ante quien corresponda');
  const [motivo, setMotivo] = useState('');
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({});

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [generatedCerts, setGeneratedCerts] = useState<Certificate[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const templatesQuery = useQuery({ queryKey: ['templates'], queryFn: listTemplates });
  const studentsQuery = useQuery({ queryKey: ['students'], queryFn: listStudents });
  const coursesQuery = useQuery({
    queryKey: ['courses', selectedYearId],
    queryFn: () => listCourses(selectedYearId),
  });
  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', selectedYearId],
    queryFn: () => listEnrollments(selectedYearId),
  });

  const studentMap = useMemo(() => {
    const m = new Map<string, Student>();
    (studentsQuery.data ?? []).forEach((s) => m.set(s.dni, s));
    return m;
  }, [studentsQuery.data]);

  const candidates = useMemo(() => {
    return (enrollmentsQuery.data ?? [])
      .filter((e) => {
        if (e.status !== 'activa') return false;
        if (courseFilter !== 'todos' && e.courseId !== courseFilter) return false;
        if (shiftFilter !== 'todos' && e.shiftName !== shiftFilter) return false;
        return true;
      })
      .map((e) => ({ enrollment: e, student: studentMap.get(e.studentDni) }))
      .filter(
        (item): item is { enrollment: typeof item.enrollment; student: Student } =>
          Boolean(item.student)
      )
      .sort((a, b) => a.student.apellido.localeCompare(b.student.apellido, 'es'));
  }, [enrollmentsQuery.data, courseFilter, shiftFilter, studentMap]);

  const selectedCandidates = candidates.filter((c) => selectedMap[c.student.dni]);
  const activeTemplate = (templatesQuery.data ?? []).find((t) => t.code === typeCode) ?? null;

  const handleBulkEmit = async () => {
    if (!user || !activeTemplate || selectedCandidates.length === 0) return;
    setRunning(true);
    setGeneratedCerts([]);
    setErrors([]);
    setProgress({ current: 0, total: selectedCandidates.length });

    // Clave de lote para idempotencia ante doble clic accidental
    const batchKey = `bulk_${selectedYearId}_${typeCode}_${issueDate}_${selectedCandidates.length}`;
    const emitted: Certificate[] = [];
    const errList: string[] = [];

    for (let i = 0; i < selectedCandidates.length; i++) {
      const { student, enrollment } = selectedCandidates[i];
      try {
        const cert = await issueCertificate({
          template: activeTemplate,
          student,
          enrollment,
          settings,
          issueDate,
          destinatario,
          motivo,
          textoPersonalizado: '',
          observaciones: '',
          autoridadFirmante: settings.directorName || 'Dirección',
          issuedByDni: user.dni,
          issuedByName: `${user.apellido}, ${user.nombre}`,
          idempotencyKey: `${batchKey}_${student.dni}`,
        });
        emitted.push(cert);
      } catch (err) {
        errList.push(
          `${student.nombre} (${student.dni}): ${err instanceof Error ? err.message : 'Error'}`
        );
      }
      setProgress({ current: i + 1, total: selectedCandidates.length });
    }

    await logAudit({
      userDni: user.dni,
      userName: `${user.apellido}, ${user.nombre}`,
      userRole: user.roleId,
      operation: 'certificate_issue_bulk',
      entity: 'sgae_certificates',
      entityId: batchKey,
      newSummary: { emittedCount: emitted.length, errorCount: errList.length, typeCode },
    });

    await queryClient.invalidateQueries({ queryKey: ['certificates'] });
    setGeneratedCerts(emitted);
    setErrors(errList);
    setRunning(false);
    toast.success(`Emisión masiva finalizada: ${emitted.length} certificados generados.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Emisión Masiva de Certificados"
        subtitle="Generá certificados individuales con numeración correlativa y QR único por estudiante, descargables en ZIP o PDF consolidado."
      />

      <Card className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
            <FieldLabel>Filtrar por curso</FieldLabel>
            <Select
              value={courseFilter}
              onChange={(e) => {
                setCourseFilter(e.target.value);
                setSelectedMap({});
              }}
            >
              <option value="todos">Todos los cursos</option>
              {(coursesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} — {c.shiftName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel>Filtrar por turno</FieldLabel>
            <Select
              value={shiftFilter}
              onChange={(e) => {
                setShiftFilter(e.target.value);
                setSelectedMap({});
              }}
            >
              <option value="todos">Todos los turnos</option>
              <option value="Mañana">Mañana</option>
              <option value="Tarde">Tarde</option>
              <option value="Vespertino">Vespertino</option>
            </Select>
          </div>
          <div>
            <FieldLabel required>Fecha de emisión</FieldLabel>
            <Input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Destinatario</FieldLabel>
            <Input
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
            />
          </div>
        </div>
        <div>
          <FieldLabel>Motivo (opcional)</FieldLabel>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. Acreditación anual de escolaridad"
          />
        </div>
      </Card>

      {/* Progreso y resultados */}
      {(running || generatedCerts.length > 0) && (
        <Card className="p-5 space-y-3 border-emerald-brand-500/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-brand-500" />
              <span className="font-bold text-sm">
                {running
                  ? `Generando ${progress.current} de ${progress.total}...`
                  : `${generatedCerts.length} certificados emitidos con éxito`}
              </span>
            </div>
            {!running && generatedCerts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="emerald"
                  onClick={() =>
                    void downloadConsolidatedCertificatesPdf(
                      generatedCerts,
                      settings,
                      `certificados_${typeCode}_${selectedYearId}.pdf`
                    )
                  }
                >
                  <Download size={14} /> PDF Consolidado ({generatedCerts.length} págs.)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void downloadCertificatesZip(
                      generatedCerts,
                      settings,
                      `certificados_${typeCode}_${selectedYearId}.zip`
                    )
                  }
                >
                  <FileArchive size={14} /> Descargar ZIP individual
                </Button>
              </div>
            )}
          </div>
          {progress.total > 0 && (
            <div className="w-full h-2 rounded-full bg-surface-subtle overflow-hidden">
              <div
                className="h-full bg-emerald-brand-500 transition-all"
                style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
              />
            </div>
          )}
          {errors.length > 0 && (
            <div className="text-xs text-red-600 space-y-1">
              {errors.map((e, i) => (
                <p key={i}>• {e}</p>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Selección de estudiantes */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b border-border-subtle flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers size={17} className="text-brand-500" />
            <h2 className="font-bold text-ink-primary">
              Estudiantes matriculados ({candidates.length})
            </h2>
            <Badge variant="brand">{selectedCandidates.length} seleccionados</Badge>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const all: Record<string, boolean> = {};
                candidates.forEach((c) => (all[c.student.dni] = true));
                setSelectedMap(all);
              }}
              disabled={candidates.length === 0}
            >
              Seleccionar todos
            </Button>
            <Button
              size="sm"
              loading={running}
              disabled={selectedCandidates.length === 0 || !activeTemplate}
              onClick={handleBulkEmit}
            >
              Emitir {selectedCandidates.length} certificados
            </Button>
          </div>
        </div>

        {candidates.length === 0 ? (
          <EmptyState
            title="Sin estudiantes para este filtro"
            description="Ajustá el curso o turno seleccionado."
          />
        ) : (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-subtle sticky top-0 text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-4 py-2.5 w-10">Sel.</th>
                  <th className="px-4 py-2.5">Estudiante</th>
                  <th className="px-4 py-2.5">DNI</th>
                  <th className="px-4 py-2.5">Curso</th>
                  <th className="px-4 py-2.5">Turno</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {candidates.map(({ student, enrollment }) => (
                  <tr key={student.dni}>
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedMap[student.dni])}
                        onChange={(e) =>
                          setSelectedMap((p) => ({ ...p, [student.dni]: e.target.checked }))
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5 font-medium">
                      {student.apellido}, {student.nombres}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {formatDniDisplay(student.dni)}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{enrollment.courseLabel}</td>
                    <td className="px-4 py-2.5 text-xs">{enrollment.shiftName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
