import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Select,
} from '@/components/ui/Primitives';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { listMovements } from '@/repositories/academicRepository';
import { formatDateAR, formatDateTimeAR, formatDniDisplay } from '@/lib/utils/formatters';

export const MovementsPage: React.FC = () => {
  const { selectedYearId } = useAcademicYear();
  const [typeFilter, setTypeFilter] = useState('todos');

  const movementsQuery = useQuery({
    queryKey: ['movements', selectedYearId],
    queryFn: () => listMovements({ academicYearId: selectedYearId }),
  });

  const filtered = useMemo(() => {
    return (movementsQuery.data ?? []).filter(
      (m) => typeFilter === 'todos' || m.type === typeFilter
    );
  }, [movementsQuery.data, typeFilter]);

  return (
    <div>
      <PageHeader
        title={`Movimientos de Matrícula — Ciclo ${selectedYearId}`}
        subtitle="Historial completo de altas, cambios de curso/división/turno, bajas, pases y migraciones anuales."
        actions={
          <Select
            aria-label="Filtrar por tipo de movimiento"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-56"
          >
            <option value="todos">Todos los movimientos</option>
            <option value="alta">Altas</option>
            <option value="cambio_curso">Cambios de curso</option>
            <option value="cambio_division">Cambios de división</option>
            <option value="cambio_turno">Cambios de turno</option>
            <option value="baja">Bajas</option>
            <option value="pase">Pases</option>
            <option value="egreso">Egresos</option>
            <option value="migracion_anual">Migración anual</option>
          </Select>
        }
      />

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            title="Sin movimientos registrados"
            description={`No existen movimientos registrados para el ciclo lectivo ${selectedYearId}.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-surface-subtle/70 text-xs uppercase text-ink-muted border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3">Vigencia</th>
                  <th className="px-4 py-3">Estudiante</th>
                  <th className="px-4 py-3">Movimiento</th>
                  <th className="px-4 py-3">Detalle</th>
                  <th className="px-4 py-3">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <p className="font-semibold text-ink-primary">{formatDateAR(m.effectiveDate)}</p>
                      <p className="text-ink-muted">{formatDateTimeAR(m.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/estudiantes/${m.studentDni}`}
                        className="font-semibold hover:text-brand-600"
                      >
                        {m.studentFullName}
                      </Link>
                      <p className="text-xs font-mono text-ink-muted">
                        DNI {formatDniDisplay(m.studentDni)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="brand" className="capitalize">
                        {m.type.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-secondary">
                      {m.fromCourseLabel ? `${m.fromCourseLabel} (${m.fromShiftName}) → ` : ''}
                      <strong>
                        {m.toCourseLabel ? `${m.toCourseLabel} (${m.toShiftName})` : 'Sin curso'}
                      </strong>
                      {m.reason && <p className="text-ink-muted mt-0.5">{m.reason}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-secondary">{m.performedByName}</td>
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
