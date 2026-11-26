import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import {
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  FieldLabel,
  PageHeader,
  Select,
} from '@/components/ui/Primitives';
import { downloadImportTemplateExcel } from '@/services/exportService';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import {
  createStudent,
  listStudents,
  updateStudent,
} from '@/repositories/studentRepository';
import { enrollStudent, listCourses } from '@/repositories/academicRepository';
import { logAudit } from '@/repositories/auditRepository';
import { normalizeDni } from '@/lib/utils/formatters';

interface ParsedRow {
  rowNumber: number;
  apellido: string;
  nombre: string;
  dni: string;
  fechaNacimiento: string;
  anioIngreso: number;
  cicloLectivo: string;
  anioCursada: string;
  division: string;
  turno: string;
  status: 'new' | 'existing' | 'error';
  errors: string[];
}

const TARGET_FIELDS = [
  { key: 'APELLIDO', label: 'Apellido *' },
  { key: 'NOMBRE', label: 'Nombre *' },
  { key: 'DNI', label: 'DNI *' },
  { key: 'FECHA_NACIMIENTO', label: 'Fecha de Nacimiento' },
  { key: 'ANIO_INGRESO', label: 'Año de Ingreso' },
  { key: 'CICLO_LECTIVO', label: 'Ciclo Lectivo' },
  { key: 'ANIO_CURSADA', label: 'Año de Cursada' },
  { key: 'DIVISION', label: 'División' },
  { key: 'TURNO', label: 'Turno' },
] as const;

export const StudentImportPage: React.FC = () => {
  const { user } = useAuth();
  const { selectedYearId } = useAcademicYear();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importEnrollment, setImportEnrollment] = useState(true);
  const [reuseExistingForEnrollment, setReuseExistingForEnrollment] = useState(true);
  const [overwriteExistingPersonal, setOverwriteExistingPersonal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [report, setReport] = useState<{
    created: number;
    reused: number;
    enrolled: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const studentsQuery = useQuery({ queryKey: ['students'], queryFn: listStudents });
  const coursesQuery = useQuery({
    queryKey: ['courses', selectedYearId],
    queryFn: () => listCourses(selectedYearId),
  });

  const existingByDni = useMemo(() => {
    const map = new Map<string, boolean>();
    (studentsQuery.data ?? []).forEach((s) => map.set(s.dni, true));
    return map;
  }, [studentsQuery.data]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReport(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (json.length === 0) {
        toast.error('El archivo no contiene filas de datos.');
        return;
      }
      const detectedHeaders = Object.keys(json[0]);
      setHeaders(detectedHeaders);
      setRawRows(json);

      // Mapeo automático por coincidencia de nombres
      const autoMap: Record<string, string> = {};
      TARGET_FIELDS.forEach((tf) => {
        const match = detectedHeaders.find(
          (h) => h.trim().toUpperCase().replace(/\s+/g, '_') === tf.key
        );
        if (match) autoMap[tf.key] = match;
      });
      setMapping(autoMap);
      toast.success(`Archivo cargado: ${json.length} filas detectadas.`);
    } catch {
      toast.error('No se pudo leer el archivo. Verificá que sea XLS, XLSX o CSV válido.');
    }
  };

  const validatedRows: ParsedRow[] = useMemo(() => {
    const seenInFile = new Set<string>();
    return rawRows.map((row, idx) => {
      const getVal = (key: string) => {
        const col = mapping[key];
        return col ? String(row[col] ?? '').trim() : '';
      };

      const apellido = getVal('APELLIDO');
      const nombre = getVal('NOMBRE');
      const dni = normalizeDni(getVal('DNI'));
      const fechaNacimiento = getVal('FECHA_NACIMIENTO');
      const anioIngreso = Number(getVal('ANIO_INGRESO')) || Number(selectedYearId);
      const cicloLectivo = getVal('CICLO_LECTIVO') || selectedYearId;
      const anioCursada = getVal('ANIO_CURSADA');
      const division = getVal('DIVISION');
      const turno = getVal('TURNO');

      const errors: string[] = [];
      if (!apellido) errors.push('Falta Apellido');
      if (!nombre) errors.push('Falta Nombre');
      if (!dni || !/^\d{5,9}$/.test(dni)) errors.push('DNI inválido');
      if (dni && seenInFile.has(dni)) errors.push('DNI duplicado dentro del archivo');
      if (dni) seenInFile.add(dni);

      const existsInDb = dni ? existingByDni.has(dni) : false;
      const status: ParsedRow['status'] =
        errors.length > 0 ? 'error' : existsInDb ? 'existing' : 'new';

      return {
        rowNumber: idx + 2,
        apellido,
        nombre,
        dni,
        fechaNacimiento,
        anioIngreso,
        cicloLectivo,
        anioCursada,
        division,
        turno,
        status,
        errors,
      };
    });
  }, [rawRows, mapping, existingByDni, selectedYearId]);

  const summary = useMemo(() => {
    return {
      total: validatedRows.length,
      newCount: validatedRows.filter((r) => r.status === 'new').length,
      existingCount: validatedRows.filter((r) => r.status === 'existing').length,
      errorCount: validatedRows.filter((r) => r.status === 'error').length,
    };
  }, [validatedRows]);

  const handleRunImport = async () => {
    if (!user) return;
    const validRows = validatedRows.filter((r) => r.status !== 'error');
    if (validRows.length === 0) {
      toast.error('No hay filas válidas para importar.');
      return;
    }

    setIsImporting(true);
    setProgress({ current: 0, total: validRows.length });
    const courses = coursesQuery.data ?? [];
    const results = { created: 0, reused: 0, enrolled: 0, skipped: 0, errors: [] as string[] };

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      setProgress({ current: i + 1, total: validRows.length });
      try {
        let student;
        if (r.status === 'new') {
          student = await createStudent({
            apellido: r.apellido,
            nombres: r.nombre,
            dni: r.dni,
            fechaNacimiento: r.fechaNacimiento,
            anioIngreso: r.anioIngreso,
            estadoInstitucional: 'activo',
          });
          results.created += 1;
        } else if (reuseExistingForEnrollment) {
          if (overwriteExistingPersonal) {
            student = await updateStudent(r.dni, {
              apellido: r.apellido,
              nombres: r.nombre,
              fechaNacimiento: r.fechaNacimiento || undefined,
              anioIngreso: r.anioIngreso,
            });
          } else {
            student = (studentsQuery.data ?? []).find((s) => s.dni === r.dni);
          }
          results.reused += 1;
        } else {
          results.skipped += 1;
          continue;
        }

        if (importEnrollment && student && r.anioCursada && r.division) {
          const yrNum = Number(r.anioCursada.replace(/\D/g, ''));
          const divNum = r.division.replace(/\D/g, '');
          const matchedCourse = courses.find(
            (c) =>
              c.yearNumber === yrNum &&
              (c.division.toLowerCase() === r.division.toLowerCase() ||
                (divNum && c.division.replace(/\D/g, '') === divNum))
          );
          if (matchedCourse) {
            try {
              await enrollStudent({
                student,
                academicYearId: r.cicloLectivo || selectedYearId,
                course: matchedCourse,
                performedByDni: user.dni,
                performedByName: `${user.apellido}, ${user.nombre}`,
              });
              results.enrolled += 1;
            } catch (enrErr) {
              results.errors.push(
                `Fila ${r.rowNumber} (DNI ${r.dni}): ${enrErr instanceof Error ? enrErr.message : 'Error de matrícula'}`
              );
            }
          }
        }
      } catch (err) {
        results.errors.push(
          `Fila ${r.rowNumber} (DNI ${r.dni}): ${err instanceof Error ? err.message : 'Error inesperado'}`
        );
      }
    }

    await logAudit({
      userDni: user.dni,
      userName: `${user.apellido}, ${user.nombre}`,
      userRole: user.roleId,
      operation: 'student_import',
      entity: 'alumnos',
      entityId: `import_${Date.now()}`,
      newSummary: {
        created: results.created,
        reused: results.reused,
        enrolled: results.enrolled,
      },
    });

    setReport(results);
    setIsImporting(false);
    void queryClient.invalidateQueries({ queryKey: ['students'] });
    void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
    toast.success('Importación finalizada.');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importación Masiva de Estudiantes"
        subtitle="Cargá planillas XLS, XLSX o CSV con detección automática de duplicados por DNI y matriculación opcional."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={downloadImportTemplateExcel}>
              <Download size={15} />
              Descargar plantilla XLSX
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/estudiantes')}>
              <ArrowLeft size={15} />
              Volver
            </Button>
          </>
        }
      />

      {/* Step 1: Upload */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-brand-50 dark:bg-brand-900/40 text-brand-600">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink-primary">1. Seleccionar archivo</h2>
              <p className="text-xs text-ink-secondary mt-0.5">
                Formatos admitidos: <code>.xlsx</code>, <code>.xls</code>, <code>.csv</code>.
                Columnas sugeridas: APELLIDO, NOMBRE, DNI, FECHA_NACIMIENTO, ANIO_INGRESO, CICLO_LECTIVO, ANIO_CURSADA, DIVISION, TURNO.
              </p>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium cursor-pointer transition-colors shrink-0">
            <Upload size={16} />
            Cargar archivo
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
        </div>
      </Card>

      {/* Step 2: Column mapping & options */}
      {headers.length > 0 && (
        <Card className="p-6 space-y-5">
          <h2 className="text-base font-bold text-ink-primary">
            2. Mapeo de columnas y opciones de duplicados
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {TARGET_FIELDS.map((tf) => (
              <div key={tf.key}>
                <FieldLabel>{tf.label}</FieldLabel>
                <Select
                  value={mapping[tf.key] || ''}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [tf.key]: e.target.value }))}
                >
                  <option value="">— No mapear —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-border-subtle flex flex-wrap gap-6 text-xs font-medium text-ink-primary">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={importEnrollment}
                onChange={(e) => setImportEnrollment(e.target.checked)}
              />
              Matricular automáticamente cuando se informe Año y División
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={reuseExistingForEnrollment}
                onChange={(e) => setReuseExistingForEnrollment(e.target.checked)}
              />
              Si el DNI ya existe, reutilizar el estudiante y asignar matrícula (sin duplicar)
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-amber-700 dark:text-amber-300">
              <input
                type="checkbox"
                checked={overwriteExistingPersonal}
                onChange={(e) => setOverwriteExistingPersonal(e.target.checked)}
                disabled={!reuseExistingForEnrollment}
              />
              Sobrescribir datos personales de estudiantes ya existentes (requiere confirmación explícita)
            </label>
          </div>
        </Card>
      )}

      {/* Step 3: Preview & validation */}
      {validatedRows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-border-subtle flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-ink-primary mr-2">
                3. Vista previa y validación ({summary.total} filas)
              </h2>
              <Badge variant="success">{summary.newCount} nuevos</Badge>
              <Badge variant="warning">{summary.existingCount} DNI existentes</Badge>
              {summary.errorCount > 0 && (
                <Badge variant="danger">{summary.errorCount} con errores</Badge>
              )}
            </div>

            <Button
              variant="emerald"
              onClick={handleRunImport}
              loading={isImporting}
              disabled={summary.newCount + summary.existingCount === 0}
            >
              Confirmar importación
            </Button>
          </div>

          {isImporting && (
            <div className="px-5 py-3 bg-brand-50 dark:bg-brand-950/30 text-xs font-semibold text-brand-700 dark:text-brand-200">
              Procesando registro {progress.current} de {progress.total}...
            </div>
          )}

          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-surface-subtle sticky top-0">
                <tr className="border-b border-border-subtle text-ink-muted uppercase">
                  <th className="px-4 py-2.5">Fila</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5">Apellido y Nombre</th>
                  <th className="px-4 py-2.5">DNI</th>
                  <th className="px-4 py-2.5">Curso / Turno</th>
                  <th className="px-4 py-2.5">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {validatedRows.slice(0, 100).map((r) => (
                  <tr key={r.rowNumber}>
                    <td className="px-4 py-2 font-mono">{r.rowNumber}</td>
                    <td className="px-4 py-2">
                      {r.status === 'new' && (
                        <Badge variant="success">
                          <CheckCircle2 size={12} /> Nuevo
                        </Badge>
                      )}
                      {r.status === 'existing' && (
                        <Badge variant="warning">
                          <AlertTriangle size={12} /> Existente
                        </Badge>
                      )}
                      {r.status === 'error' && (
                        <Badge variant="danger">
                          <XCircle size={12} /> Error
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 font-medium">
                      {r.apellido}, {r.nombre}
                    </td>
                    <td className="px-4 py-2 font-mono">{r.dni}</td>
                    <td className="px-4 py-2">
                      {r.anioCursada && r.division
                        ? `${r.anioCursada}° ${r.division} (${r.turno || 'auto'})`
                        : 'Solo datos personales'}
                    </td>
                    <td className="px-4 py-2 text-ink-muted">
                      {r.errors.length > 0
                        ? r.errors.join(' · ')
                        : r.status === 'existing'
                          ? 'Se reutilizará el registro existente'
                          : 'Listo para importar'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Step 4: Final Report */}
      {report && (
        <Card className="p-6 border-emerald-brand-500/40">
          <h2 className="text-base font-bold text-ink-primary mb-3">Reporte de Resultados</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-xl bg-surface-subtle">
              <p className="text-2xl font-bold text-emerald-brand-600">{report.created}</p>
              <p className="text-xs text-ink-secondary">Estudiantes creados</p>
            </div>
            <div className="p-3 rounded-xl bg-surface-subtle">
              <p className="text-2xl font-bold text-brand-600">{report.reused}</p>
              <p className="text-xs text-ink-secondary">Existentes reutilizados</p>
            </div>
            <div className="p-3 rounded-xl bg-surface-subtle">
              <p className="text-2xl font-bold text-ink-primary">{report.enrolled}</p>
              <p className="text-xs text-ink-secondary">Matrículas asignadas</p>
            </div>
            <div className="p-3 rounded-xl bg-surface-subtle">
              <p className="text-2xl font-bold text-amber-600">{report.skipped}</p>
              <p className="text-xs text-ink-secondary">Omitidos</p>
            </div>
          </div>
          {report.errors.length > 0 && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300 space-y-1">
              <p className="font-bold">Observaciones ({report.errors.length}):</p>
              {report.errors.map((e, i) => (
                <p key={i}>• {e}</p>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
