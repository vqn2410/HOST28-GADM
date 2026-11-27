import React, { useMemo, useState } from 'react';
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
import { CheckCircle2, AlertTriangle, AlertOctagon, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { classifyStudentsByRisk, type StudentRiskDetail } from '@/repositories/attendanceRepository';
import { formatDniDisplay } from '@/lib/utils/formatters';
import { Badge, Card, EmptyState, FieldLabel, Select } from '@/components/ui/Primitives';
import type { Course, Student, StudentGradeRecord, Subject } from '@/types/domain';

interface TrajectoryStatsTabProps {
  courses: Course[];
  selectedCourseId: string;
  onSelectCourse: (id: string) => void;
  rosterStudents: Student[];
  courseSubjects: Subject[];
  allGrades: StudentGradeRecord[];
  academicYearId: string;
}

const BUCKET_META: {
  key: StudentRiskDetail['bucket'];
  label: string;
  shortLabel: string;
  color: string;
  badgeVariant: 'success' | 'info' | 'warning' | 'danger';
  icon: React.ReactNode;
}[] = [
  {
    key: 'all_approved',
    label: 'Todas aprobadas',
    shortLabel: 'Todas aprob.',
    color: '#00a059',
    badgeVariant: 'success',
    icon: <CheckCircle2 size={18} />,
  },
  {
    key: 'one_two',
    label: '1 o 2 materias (TEP/TED o 1–6)',
    shortLabel: '1–2 mat.',
    color: '#2f5499',
    badgeVariant: 'info',
    icon: <Users size={18} />,
  },
  {
    key: 'three_four',
    label: '3 o 4 materias (TEP/TED o 1–6)',
    shortLabel: '3–4 mat.',
    color: '#f59e0b',
    badgeVariant: 'warning',
    icon: <AlertTriangle size={18} />,
  },
  {
    key: 'five_plus',
    label: '5 o más materias (Alerta EDTE)',
    shortLabel: '5+ mat.',
    color: '#dc2626',
    badgeVariant: 'danger',
    icon: <AlertOctagon size={18} />,
  },
];

export const TrajectoryStatsTab: React.FC<TrajectoryStatsTabProps> = ({
  courses,
  selectedCourseId,
  onSelectCourse,
  rosterStudents,
  courseSubjects,
  allGrades,
  academicYearId,
}) => {
  const [selectedBucket, setSelectedBucket] = useState<StudentRiskDetail['bucket'] | 'all'>('all');
  const [expandedDni, setExpandedDni] = useState<string | null>(null);

  const { details, counts } = useMemo(
    () => classifyStudentsByRisk(rosterStudents, courseSubjects, allGrades),
    [rosterStudents, courseSubjects, allGrades]
  );

  const chartData = useMemo(() => {
    const total = counts.total || 1;
    return BUCKET_META.map((m) => {
      const value = counts[m.key];
      const pct = counts.total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
      return {
        key: m.key,
        name: m.shortLabel,
        fullLabel: m.label,
        cantidad: value,
        porcentaje: pct,
        color: m.color,
      };
    });
  }, [counts]);

  const filteredDetails = useMemo(() => {
    if (selectedBucket === 'all') return details;
    return details.filter((d) => d.bucket === selectedBucket);
  }, [details, selectedBucket]);

  return (
    <div className="space-y-6">
      <Card className="p-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="w-full sm:w-72">
          <FieldLabel>Curso analizado ({academicYearId})</FieldLabel>
          <Select value={selectedCourseId} onChange={(e) => onSelectCourse(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} — Turno {c.shiftName}
              </option>
            ))}
          </Select>
        </div>
        <div className="text-xs text-ink-secondary">
          Total de estudiantes en el curso: <strong className="text-ink-primary">{counts.total}</strong>
        </div>
      </Card>

      {/* 4 Tarjetas interactivas con cantidad y porcentaje */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {BUCKET_META.map((m) => {
          const val = counts[m.key];
          const pct = counts.total > 0 ? Math.round((val / counts.total) * 1000) / 10 : 0;
          const active = selectedBucket === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setSelectedBucket(active ? 'all' : m.key)}
              className={`text-left p-4 rounded-2xl border transition-all cursor-pointer bg-surface-card ${
                active
                  ? 'ring-2 ring-brand-500 border-brand-500 shadow-sm'
                  : 'border-border-subtle hover:border-brand-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span style={{ color: m.color }}>{m.icon}</span>
                <Badge variant={m.badgeVariant}>{pct}%</Badge>
              </div>
              <p className="text-3xl font-extrabold font-display text-ink-primary mt-2">{val}</p>
              <p className="text-xs font-semibold text-ink-secondary mt-1">{m.label}</p>
              <p className="text-[11px] text-brand-500 mt-1.5">
                {active ? 'Mostrando desglose (clic para ver todos)' : 'Clic para ver estudiantes'}
              </p>
            </button>
          );
        })}
      </div>

      {/* Gráficos con porcentajes */}
      {counts.total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-7 p-5">
            <h3 className="font-bold text-sm text-ink-primary mb-1">
              Porcentaje de Estudiantes por Situación Académica
            </h3>
            <p className="text-xs text-ink-muted mb-4">
              Materias con TEP, TED o calificación numérica de 1 a 6 (Res. 1650/24)
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number, _name, props) => [
                      `${value}% (${props.payload.cantidad} est.)`,
                      props.payload.fullLabel,
                    ]}
                  />
                  <Bar dataKey="porcentaje" radius={[8, 8, 0, 0]}>
                    {chartData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="lg:col-span-5 p-5">
            <h3 className="font-bold text-sm text-ink-primary mb-1">Distribución Porcentual</h3>
            <p className="text-xs text-ink-muted mb-4">Proporción sobre {counts.total} estudiantes</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.filter((d) => d.cantidad > 0)}
                    dataKey="cantidad"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={78}
                    label={({ name, porcentaje }) => `${name}: ${porcentaje}%`}
                  >
                    {chartData
                      .filter((d) => d.cantidad > 0)
                      .map((entry) => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number, _n, p) => [
                      `${val} est. (${p.payload.porcentaje}%)`,
                      p.payload.fullLabel,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* Desglose detallado de estudiantes */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border-subtle flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-sm text-ink-primary">
              Desglose de Estudiantes ({filteredDetails.length})
            </h3>
            <p className="text-xs text-ink-muted">
              {selectedBucket === 'all'
                ? 'Mostrando todo el curso. Hacé clic en una tarjeta superior para filtrar por grupo.'
                : `Filtro activo: ${BUCKET_META.find((b) => b.key === selectedBucket)?.label}`}
            </p>
          </div>
          {selectedBucket !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedBucket('all')}
              className="text-xs font-semibold text-brand-500 hover:underline cursor-pointer"
            >
              Ver todos los grupos
            </button>
          )}
        </div>

        {filteredDetails.length === 0 ? (
          <EmptyState
            title="Sin estudiantes en esta categoría"
            description="Seleccioná otra categoría o cargá calificaciones en la planilla."
          />
        ) : (
          <div className="divide-y divide-border-subtle">
            {filteredDetails.map((d) => {
              const meta = BUCKET_META.find((m) => m.key === d.bucket)!;
              const isOpen = expandedDni === d.student.dni;
              return (
                <div key={d.student.dni} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm text-ink-primary">
                        {d.student.apellido}, {d.student.nombres}
                      </p>
                      <p className="text-xs font-mono text-ink-muted">
                        DNI {formatDniDisplay(d.student.dni)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={meta.badgeVariant}>
                        {d.riskCount === 0
                          ? 'Todas aprobadas'
                          : `${d.riskCount} materia(s) con TEP/TED o 1–6`}
                      </Badge>
                      {d.riskCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedDni(isOpen ? null : d.student.dni)}
                          className="p-1.5 rounded-lg border border-border-subtle hover:bg-surface-subtle cursor-pointer"
                          aria-label="Ver materias"
                        >
                          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      )}
                    </div>
                  </div>

                  {d.riskCount > 0 && (isOpen || selectedBucket !== 'all') && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {d.riskSubjects.map((rs) => (
                        <span
                          key={rs.name}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-subtle border border-border-subtle text-xs"
                        >
                          <strong className="text-ink-primary">{rs.name}</strong>
                          <span className="text-ink-muted">({rs.reason})</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
