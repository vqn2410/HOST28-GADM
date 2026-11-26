import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import {
  Users,
  GraduationCap,
  FileBadge2,
  Layers,
  UserPlus,
  ClipboardList,
  Search,
  ArrowRight,
  UserCheck,
  UserMinus,
  Download,
  Eye,
} from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { listStudents } from '@/repositories/studentRepository';
import { listCourses, listEnrollments, listMovements } from '@/repositories/academicRepository';
import { listCertificates } from '@/repositories/certificateRepository';
import { downloadCertificatePdf } from '@/templates/pdf/certificatePdfGenerator';
import { formatDateAR, formatDniDisplay, getArgentinaDateISO } from '@/lib/utils/formatters';
import { Badge, Button, Card, StatCard } from '@/components/ui/Primitives';

const PIE_COLORS = ['#2f5499', '#00a059', '#fcd055', '#64748b'];

export const DashboardPage: React.FC = () => {
  const { user, can } = useAuth();
  const { selectedYearId, settings } = useAcademicYear();

  const studentsQuery = useQuery({ queryKey: ['students'], queryFn: listStudents });
  const coursesQuery = useQuery({
    queryKey: ['courses', selectedYearId],
    queryFn: () => listCourses(selectedYearId),
  });
  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', selectedYearId],
    queryFn: () => listEnrollments(selectedYearId),
  });
  const certsQuery = useQuery({
    queryKey: ['certificates', selectedYearId],
    queryFn: () => listCertificates({ academicYearId: selectedYearId }),
  });
  const movementsQuery = useQuery({
    queryKey: ['movements', selectedYearId],
    queryFn: () => listMovements({ academicYearId: selectedYearId }),
  });

  const students = studentsQuery.data ?? [];
  const courses = coursesQuery.data ?? [];
  const enrollments = enrollmentsQuery.data ?? [];
  const certs = certsQuery.data ?? [];
  const movements = movementsQuery.data ?? [];

  const stats = useMemo(() => {
    const activeEnrollments = enrollments.filter((e) => e.status === 'activa');
    const yearNum = Number(selectedYearId);
    const currentMonthPrefix = getArgentinaDateISO().slice(0, 7);

    const byYearMap = new Map<number, number>();
    const byShiftMap = new Map<string, number>();
    const byDivisionMap = new Map<string, { label: string; shift: string; count: number }>();

    activeEnrollments.forEach((e) => {
      byYearMap.set(e.yearNumber, (byYearMap.get(e.yearNumber) || 0) + 1);
      byShiftMap.set(e.shiftName, (byShiftMap.get(e.shiftName) || 0) + 1);
      const cur = byDivisionMap.get(e.courseId) || {
        label: e.courseLabel,
        shift: e.shiftName,
        count: 0,
      };
      cur.count += 1;
      byDivisionMap.set(e.courseId, cur);
    });

    const chartByYear = [1, 2, 3, 4, 5, 6].map((y) => ({
      anio: `${y}° año`,
      estudiantes: byYearMap.get(y) || 0,
    }));

    const chartByShift = Array.from(byShiftMap.entries()).map(([name, value]) => ({
      name,
      value,
    }));

    return {
      totalStudents: students.length,
      activeEnrollmentCount: activeEnrollments.length,
      ingresantes: students.filter((s) => s.anioIngreso === yearNum).length,
      egresados: students.filter((s) => s.estadoInstitucional === 'egresado').length,
      conPase: students.filter((s) => s.estadoInstitucional === 'pase').length,
      desvinculados: students.filter((s) => s.estadoInstitucional === 'desvinculado').length,
      activeCourses: courses.filter((c) => c.status === 'activo').length,
      totalCerts: certs.length,
      monthCerts: certs.filter((c) => c.issueDate.startsWith(currentMonthPrefix)).length,
      chartByYear,
      chartByShift,
      byDivision: Array.from(byDivisionMap.values()).sort((a, b) =>
        a.label.localeCompare(b.label, 'es', { numeric: true })
      ),
    };
  }, [students, courses, enrollments, certs, selectedYearId]);

  return (
    <div className="space-y-6">
      {/* Banner Institucional */}
      <div className="institutional-banner rounded-2xl p-6 sm:p-7 text-white shadow-md">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white p-2 shadow-lg shrink-0">
              <img
                src={settings.logoUrl || '/logo.png'}
                alt="Logo institucional"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-blue-200 font-semibold">
                {settings.letterheadHeader}
              </p>
              <h1 className="text-xl sm:text-2xl font-extrabold font-display tracking-tight">
                {settings.institutionName}
              </h1>
              <p className="text-xs text-blue-100 mt-0.5">
                Panel administrativo · Ciclo lectivo {selectedYearId} · Bienvenido/a,{' '}
                <strong>{user?.nombre}</strong>
              </p>
            </div>
          </div>

          {/* Accesos rápidos */}
          <div className="flex flex-wrap gap-2">
            {can('students:create') && (
              <Link to="/estudiantes/nuevo">
                <Button size="sm" className="bg-white text-brand-700 hover:bg-blue-50 border-0">
                  <UserPlus size={14} /> Cargar estudiante
                </Button>
              </Link>
            )}
            {can('enrollments:manage') && (
              <Link to="/matricula">
                <Button
                  size="sm"
                  className="bg-white/15 hover:bg-white/25 text-white border-white/20"
                >
                  <GraduationCap size={14} /> Matricular
                </Button>
              </Link>
            )}
            {can('certificates:issue') && (
              <Link to="/certificados/alumno-regular">
                <Button size="sm" variant="emerald">
                  <FileBadge2 size={14} /> Emitir certificado
                </Button>
              </Link>
            )}
            <Link to="/reportes/nominas">
              <Button
                size="sm"
                className="bg-white/15 hover:bg-white/25 text-white border-white/20"
              >
                <ClipboardList size={14} /> Nóminas
              </Button>
            </Link>
            <Link to="/estudiantes">
              <Button
                size="sm"
                className="bg-white/15 hover:bg-white/25 text-white border-white/20"
              >
                <Search size={14} /> Buscar
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Base general de estudiantes"
          value={stats.totalStudents}
          hint={`Ingresantes ${selectedYearId}: ${stats.ingresantes}`}
          icon={<Users size={20} />}
          accent="brand"
        />
        <StatCard
          label={`Matrícula activa ${selectedYearId}`}
          value={stats.activeEnrollmentCount}
          hint={`${stats.activeCourses} cursos activos`}
          icon={<GraduationCap size={20} />}
          accent="emerald"
        />
        <StatCard
          label="Certificados emitidos"
          value={stats.totalCerts}
          hint={`${stats.monthCerts} emitidos este mes`}
          icon={<FileBadge2 size={20} />}
          accent="amber"
        />
        <StatCard
          label="Egresados / Pases / Bajas"
          value={`${stats.egresados} / ${stats.conPase} / ${stats.desvinculados}`}
          hint="Estado histórico institucional"
          icon={<UserMinus size={20} />}
          accent="slate"
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-8 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-bold text-base text-ink-primary">
                Matrícula Activa por Año de Cursada
              </h2>
              <p className="text-xs text-ink-muted">Ciclo lectivo {selectedYearId}</p>
            </div>
            <Link
              to="/reportes/matricula"
              className="text-xs font-semibold text-brand-500 hover:underline inline-flex items-center gap-1"
            >
              Ver reporte completo <ArrowRight size={13} />
            </Link>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chartByYear}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="anio" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="estudiantes" fill="#2f5499" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-4 p-5">
          <h2 className="font-display font-bold text-base text-ink-primary mb-1">
            Distribución por Turno
          </h2>
          <p className="text-xs text-ink-muted mb-4">Matrícula activa {selectedYearId}</p>
          {stats.chartByShift.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-ink-muted">
              Sin matrículas activas en este ciclo.
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.chartByShift}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={76}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {stats.chartByShift.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Últimas Constancias Generadas con descarga directa */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display font-bold text-sm flex items-center gap-2">
            <FileBadge2 size={16} className="text-brand-500" />
            Últimas Constancias Generadas ({selectedYearId})
          </h2>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <Link to="/emision" className="text-emerald-brand-600 hover:underline">
              Portal Preceptoría (/emision)
            </Link>
            <Link to="/certificados" className="text-brand-500 hover:underline">
              Ver historial completo
            </Link>
          </div>
        </div>
        {certs.length === 0 ? (
          <p className="p-6 text-xs text-ink-muted text-center">
            Todavía no se emitieron constancias en el ciclo {selectedYearId}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle text-ink-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5">N.º Certificado</th>
                  <th className="px-4 py-2.5">Estudiante</th>
                  <th className="px-4 py-2.5">Tipo / Curso</th>
                  <th className="px-4 py-2.5">Emisión</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5 text-right">Descargar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {certs.slice(0, 8).map((c) => (
                  <tr key={c.id} className="hover:bg-surface-subtle/40">
                    <td className="px-4 py-2.5 font-mono font-bold text-brand-600 dark:text-brand-300">
                      {c.certificateNumber}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-ink-primary">
                        {c.snapshot.apellidoNombre}
                      </span>
                      <span className="block text-[11px] font-mono text-ink-muted">
                        DNI {formatDniDisplay(c.studentDni)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{c.typeName}</span>
                      <span className="block text-[11px] text-ink-muted">
                        {c.snapshot.anio} {c.snapshot.division} · {c.snapshot.turno}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{formatDateAR(c.issueDate)}</td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant={
                          c.status === 'emitido'
                            ? 'success'
                            : c.status === 'anulado'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="emerald"
                          onClick={() => void downloadCertificatePdf(c, settings)}
                        >
                          <Download size={13} /> PDF
                        </Button>
                        <Link to={`/certificados/${c.id}`}>
                          <Button size="sm" variant="ghost" title="Ver detalle">
                            <Eye size={14} />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Tablas resumen: Matrícula por división y últimos movimientos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-5 overflow-hidden">
          <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
            <h2 className="font-display font-bold text-sm flex items-center gap-2">
              <Layers size={16} className="text-brand-500" /> Matrícula por División
            </h2>
            <Badge variant="neutral">{stats.byDivision.length} divisiones</Badge>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-border-subtle text-sm">
            {stats.byDivision.length === 0 ? (
              <p className="p-6 text-xs text-ink-muted text-center">
                Sin matrículas activas registradas aún.
              </p>
            ) : (
              stats.byDivision.map((d) => (
                <div key={`${d.label}_${d.shift}`} className="px-5 py-2.5 flex justify-between">
                  <span>
                    <strong>{d.label}</strong>{' '}
                    <span className="text-xs text-ink-muted">· {d.shift}</span>
                  </span>
                  <Badge variant="brand">{d.count} est.</Badge>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="lg:col-span-7 overflow-hidden">
          <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
            <h2 className="font-display font-bold text-sm flex items-center gap-2">
              <UserCheck size={16} className="text-emerald-brand-500" /> Últimos Movimientos
              Administrativos
            </h2>
            <Link
              to="/matricula/movimientos"
              className="text-xs font-semibold text-brand-500 hover:underline"
            >
              Ver todos
            </Link>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-border-subtle text-xs">
            {movements.length === 0 ? (
              <p className="p-6 text-ink-muted text-center">
                Sin movimientos registrados en el ciclo {selectedYearId}.
              </p>
            ) : (
              movements.slice(0, 8).map((m) => (
                <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink-primary">{m.studentFullName}</p>
                    <p className="text-ink-muted">
                      {m.type.replace(/_/g, ' ')} ·{' '}
                      {m.toCourseLabel ? `→ ${m.toCourseLabel} (${m.toShiftName})` : 'Cierre'}
                    </p>
                  </div>
                  <span className="text-ink-muted shrink-0">{formatDateAR(m.effectiveDate)}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
