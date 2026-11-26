import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import {
  Search,
  UserPlus,
  Upload,
  Download,
  FileText,
  Eye,
  Archive,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  FileBadge2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  SkeletonBlock,
} from '@/components/ui/Primitives';
import { StudentStatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { archiveStudent, listStudents } from '@/repositories/studentRepository';
import { logAudit } from '@/repositories/auditRepository';
import { exportRowsToExcel, exportTableToPdf } from '@/services/exportService';
import {
  calculateAge,
  formatDateAR,
  formatDniDisplay,
  normalizeDni,
} from '@/lib/utils/formatters';
import type { Student } from '@/types/domain';

const columnHelper = createColumnHelper<Student>();

export const StudentsListPage: React.FC = () => {
  const { user, can } = useAuth();
  const { selectedYearId, settings } = useAcademicYear();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [rawSearch, setRawSearch] = useState(searchParams.get('q') || '');
  const [search, setSearch] = useState(rawSearch);
  const [statusFilter, setStatusFilter] = useState('todos');
  const [yearFilter, setYearFilter] = useState('todos');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'apellido', desc: false }]);
  const [selectedDnis, setSelectedDnis] = useState<Record<string, boolean>>({});
  const [archiveTarget, setArchiveTarget] = useState<Student | null>(null);

  // Debounce en buscador
  useEffect(() => {
    const t = setTimeout(() => setSearch(rawSearch), 200);
    return () => clearTimeout(t);
  }, [rawSearch]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null && q !== rawSearch) {
      setRawSearch(q);
      setSearch(q);
    }
  }, [searchParams]);

  const studentsQuery = useQuery({
    queryKey: ['students'],
    queryFn: listStudents,
    staleTime: 30_000,
  });

  const archiveMutation = useMutation({
    mutationFn: async (st: Student) => {
      await archiveStudent(st.dni, 'Archivado desde Base General de Estudiantes');
      if (user) {
        await logAudit({
          userDni: user.dni,
          userName: `${user.apellido}, ${user.nombre}`,
          userRole: user.roleId,
          operation: 'student_archive',
          entity: 'alumnos',
          entityId: st.dni,
          changedFields: ['estadoInstitucional'],
          previousSummary: { estadoInstitucional: st.estadoInstitucional },
          newSummary: { estadoInstitucional: 'archivado' },
        });
      }
    },
    onSuccess: () => {
      toast.success('Estudiante archivado. Su historial institucional se conserva íntegro.');
      setArchiveTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'No se pudo archivar el estudiante.');
    },
  });

  const students = studentsQuery.data ?? [];

  const admissionYears = useMemo(() => {
    const set = new Set<number>();
    students.forEach((s) => {
      if (s.anioIngreso) set.add(s.anioIngreso);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [students]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDni = normalizeDni(search);
    return students.filter((s) => {
      if (statusFilter !== 'todos' && s.estadoInstitucional !== statusFilter) return false;
      if (yearFilter !== 'todos' && String(s.anioIngreso) !== yearFilter) return false;
      if (q) {
        const matchText =
          s.apellido.toLowerCase().includes(q) ||
          s.nombres.toLowerCase().includes(q) ||
          s.nombre.toLowerCase().includes(q);
        const matchDni = qDni ? s.dni.includes(qDni) : false;
        if (!matchText && !matchDni) return false;
      }
      return true;
    });
  }, [students, search, statusFilter, yearFilter]);

  const selectedList = useMemo(
    () => filtered.filter((s) => selectedDnis[s.dni]),
    [filtered, selectedDnis]
  );

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            aria-label="Seleccionar todos los filtrados"
            checked={filtered.length > 0 && selectedList.length === filtered.length}
            onChange={(e) => {
              if (e.target.checked) {
                const next: Record<string, boolean> = {};
                filtered.forEach((s) => (next[s.dni] = true));
                setSelectedDnis(next);
              } else {
                setSelectedDnis({});
              }
            }}
            className="rounded border-border-strong cursor-pointer"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Seleccionar ${row.original.nombre}`}
            checked={!!selectedDnis[row.original.dni]}
            onChange={(e) =>
              setSelectedDnis((prev) => ({
                ...prev,
                [row.original.dni]: e.target.checked,
              }))
            }
            className="rounded border-border-strong cursor-pointer"
          />
        ),
      }),
      columnHelper.accessor('apellido', {
        header: 'Apellido y Nombre',
        cell: ({ row }) => (
          <div>
            <Link
              to={`/estudiantes/${row.original.dni}`}
              className="font-semibold text-ink-primary hover:text-brand-600 dark:hover:text-brand-300 transition-colors"
            >
              {row.original.apellido}, {row.original.nombres}
            </Link>
            {row.original.cursoOrigen && (
              <p className="text-[11px] text-ink-muted mt-0.5">
                Último curso registrado: {row.original.cursoOrigen}
                {row.original.turno ? ` · ${row.original.turno}` : ''}
              </p>
            )}
          </div>
        ),
      }),
      columnHelper.accessor('dni', {
        header: 'DNI',
        cell: (info) => <span className="font-mono text-xs font-semibold">{formatDniDisplay(info.getValue())}</span>,
      }),
      columnHelper.accessor('fechaNacimiento', {
        header: 'F. Nac. / Edad',
        cell: (info) => {
          const val = info.getValue();
          const age = calculateAge(val);
          return (
            <div className="text-xs">
              <span className="text-ink-primary">{formatDateAR(val)}</span>
              {age !== null && <span className="text-ink-muted ml-1.5">({age} años)</span>}
            </div>
          );
        },
      }),
      columnHelper.accessor('anioIngreso', {
        header: 'Ingreso',
        cell: (info) => <span className="text-xs font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor('estadoInstitucional', {
        header: 'Estado',
        cell: (info) => <StudentStatusBadge status={info.getValue()} />,
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Acciones',
        cell: ({ row }) => (
          <div className="flex items-center gap-1 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/estudiantes/${row.original.dni}`)}
              title="Ver ficha individual"
            >
              <Eye size={14} />
              <span className="hidden xl:inline">Ficha</span>
            </Button>
            {can('certificates:issue') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  navigate(`/certificados/alumno-regular?dni=${row.original.dni}`)
                }
                title="Emitir certificado"
              >
                <FileBadge2 size={14} />
              </Button>
            )}
            {can('students:edit') && row.original.estadoInstitucional !== 'archivado' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setArchiveTarget(row.original)}
                title="Archivar registro"
              >
                <Archive size={14} className="text-ink-muted hover:text-amber-600" />
              </Button>
            )}
          </div>
        ),
      }),
    ],
    [filtered, selectedList.length, selectedDnis, can, navigate]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  const handleExportExcel = () => {
    const source = selectedList.length > 0 ? selectedList : filtered;
    const rows = source.map((s) => ({
      APELLIDO: s.apellido,
      NOMBRES: s.nombres,
      DNI: s.dni,
      FECHA_NACIMIENTO: s.fechaNacimiento || '',
      EDAD: calculateAge(s.fechaNacimiento) ?? '',
      ANIO_INGRESO: s.anioIngreso,
      ESTADO: s.estadoInstitucional,
      CURSO_ACTUAL: s.cursoOrigen || '',
      TURNO: s.turno || '',
    }));
    exportRowsToExcel(rows, 'Estudiantes_SGAE', `base_general_estudiantes_${selectedYearId}.xlsx`);
    toast.success(`Exportados ${rows.length} registros a Excel.`);
  };

  const handleExportPdf = () => {
    const source = selectedList.length > 0 ? selectedList : filtered;
    exportTableToPdf({
      title: 'Base General de Estudiantes',
      subtitle: `Total de registros: ${source.length}`,
      academicYear: selectedYearId,
      settings,
      headers: ['Apellido y Nombre', 'DNI', 'F. Nacimiento', 'Edad', 'Ingreso', 'Estado'],
      rows: source.map((s) => [
        `${s.apellido}, ${s.nombres}`,
        formatDniDisplay(s.dni),
        formatDateAR(s.fechaNacimiento),
        calculateAge(s.fechaNacimiento) !== null ? `${calculateAge(s.fechaNacimiento)}` : '—',
        String(s.anioIngreso),
        s.estadoInstitucional,
      ]),
      filename: `base_general_estudiantes_${selectedYearId}.pdf`,
    });
    toast.success('Listado exportado en formato PDF institucional.');
  };

  return (
    <div>
      <PageHeader
        title="Base General de Estudiantes"
        subtitle="Fuente única institucional compartida con HOST 28 Educación Física. Cada estudiante posee un único registro permanente."
        actions={
          <>
            {can('students:export') && (
              <>
                <Button variant="outline" size="sm" onClick={handleExportExcel}>
                  <Download size={15} />
                  Excel {selectedList.length > 0 ? `(${selectedList.length})` : ''}
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPdf}>
                  <FileText size={15} />
                  PDF
                </Button>
              </>
            )}
            {can('students:import') && (
              <Button variant="secondary" size="sm" onClick={() => navigate('/estudiantes/importar')}>
                <Upload size={15} />
                Importar
              </Button>
            )}
            {can('students:create') && (
              <Button size="sm" onClick={() => navigate('/estudiantes/nuevo')}>
                <UserPlus size={15} />
                Nuevo estudiante
              </Button>
            )}
          </>
        }
      />

      {/* Filters bar */}
      <Card className="p-4 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6 relative">
            <Search size={16} className="absolute left-3.5 top-3 text-ink-muted pointer-events-none" />
            <Input
              value={rawSearch}
              onChange={(e) => {
                setRawSearch(e.target.value);
                if (searchParams.get('q')) setSearchParams({});
              }}
              placeholder="Buscar por apellido, nombre o DNI..."
              className="pl-10"
            />
          </div>
          <div className="md:col-span-3">
            <Select
              aria-label="Filtrar por estado"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="todos">Todos los estados</option>
              <option value="activo">Activos</option>
              <option value="egresado">Egresados</option>
              <option value="pase">Pase a otra institución</option>
              <option value="desvinculado">Desvinculados</option>
              <option value="archivado">Archivados</option>
              {(settings.customStudentStatuses || []).map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </Select>
          </div>
          <div className="md:col-span-3">
            <Select
              aria-label="Filtrar por año de ingreso"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            >
              <option value="todos">Todos los años de ingreso</option>
              {admissionYears.map((y) => (
                <option key={y} value={String(y)}>
                  Ingreso {y}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {studentsQuery.isLoading ? (
          <div className="p-6 space-y-3">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No se encontraron estudiantes"
            description="Ajustá los filtros de búsqueda o cargá un nuevo estudiante en la base general."
            action={
              can('students:create') ? (
                <Button onClick={() => navigate('/estudiantes/nuevo')}>
                  <UserPlus size={16} />
                  Cargar estudiante
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Mobile: tarjetas verticales sin scroll horizontal */}
            <div className="md:hidden divide-y divide-border-subtle">
              {table.getRowModel().rows.map((row) => {
                const st = row.original;
                const age = calculateAge(st.fechaNacimiento);
                return (
                  <div key={st.dni} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          to={`/estudiantes/${st.dni}`}
                          className="font-bold text-sm text-ink-primary hover:text-brand-500 block truncate"
                        >
                          {st.apellido}, {st.nombres}
                        </Link>
                        <p className="text-xs font-mono text-ink-muted">
                          DNI {formatDniDisplay(st.dni)}
                          {age !== null ? ` · ${age} años` : ''}
                        </p>
                      </div>
                      <StudentStatusBadge status={st.estadoInstitucional} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-ink-secondary">
                      <span>
                        {st.cursoOrigen
                          ? `${st.cursoOrigen}${st.turno ? ` · ${st.turno}` : ''}`
                          : 'Sin curso asignado'}
                      </span>
                      <span>Ingreso {st.anioIngreso}</span>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Link to={`/estudiantes/${st.dni}`} className="flex-1">
                        <Button size="sm" variant="outline" className="w-full">
                          <Eye size={13} /> Ver ficha
                        </Button>
                      </Link>
                      {can('certificates:issue') && (
                        <Link
                          to={`/certificados/alumno-regular?dni=${st.dni}`}
                          className="flex-1"
                        >
                          <Button size="sm" variant="emerald" className="w-full">
                            <FileBadge2 size={13} /> Constancia
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: tabla */}
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr
                      key={hg.id}
                      className="border-b border-border-subtle bg-surface-subtle/60 text-xs font-semibold uppercase tracking-wide text-ink-muted"
                    >
                      {hg.headers.map((header) => (
                        <th key={header.id} className="px-4 py-3 whitespace-nowrap">
                          {header.isPlaceholder ? null : header.column.getCanSort() ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="inline-flex items-center gap-1 hover:text-ink-primary cursor-pointer"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              <ArrowUpDown size={12} />
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-border-subtle text-sm">
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-surface-subtle/40 transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 border-t border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-secondary">
              <div>
                Mostrando <strong>{table.getRowModel().rows.length}</strong> de{' '}
                <strong>{filtered.length}</strong> estudiantes
                {selectedList.length > 0 && (
                  <span className="ml-2 text-brand-600 font-semibold">
                    ({selectedList.length} seleccionados)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <ChevronLeft size={14} />
                  Anterior
                </Button>
                <span className="px-2 font-medium">
                  Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Siguiente
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archivar registro de estudiante"
        description={
          archiveTarget
            ? `El estudiante ${archiveTarget.apellido}, ${archiveTarget.nombres} (DNI ${formatDniDisplay(archiveTarget.dni)}) pasará al estado "Archivado". Sus matrículas y certificados históricos no serán eliminados.`
            : ''
        }
        confirmLabel="Archivar registro"
        loading={archiveMutation.isPending}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => {
          if (archiveTarget) archiveMutation.mutate(archiveTarget);
        }}
      />
    </div>
  );
};
