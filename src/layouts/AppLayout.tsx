import React, { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  FileBadge2,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  CalendarDays,
  ShieldCheck,
  QrCode,
} from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { ROLE_DEFINITIONS } from '@/lib/permissions/rbac';
import { cn } from '@/lib/utils/formatters';
import type { Permission } from '@/types/domain';

interface NavSubItem {
  label: string;
  to: string;
  permission?: Permission;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  to?: string;
  permission?: Permission;
  children?: NavSubItem[];
}

const BREADCRUMB_LABELS: Record<string, string> = {
  dashboard: 'Inicio',
  estudiantes: 'Estudiantes',
  nuevo: 'Nuevo',
  importar: 'Importación masiva',
  'ciclos-lectivos': 'Ciclos lectivos',
  cursos: 'Cursos y divisiones',
  turnos: 'Turnos',
  matricula: 'Matrícula',
  movimientos: 'Movimientos',
  migracion: 'Migración anual',
  certificados: 'Documentación',
  'alumno-regular': 'Alumno regular',
  'salario-familiar': 'Salario familiar',
  'constancia-general': 'Constancia general',
  'emision-masiva': 'Emisión masiva',
  reportes: 'Reportes',
  nominas: 'Nóminas',
  configuracion: 'Configuración',
  institucion: 'Datos institucionales',
  plantillas: 'Plantillas documentales',
  usuarios: 'Usuarios',
  permisos: 'Roles y permisos',
  auditoria: 'Auditoría',
};

export const AppLayout: React.FC = () => {
  const { user, can, logout } = useAuth();
  const { academicYears, selectedYearId, setSelectedYearId, selectedYear, settings } =
    useAcademicYear();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    estudiantes: true,
    academica: true,
    documentacion: true,
    reportes: false,
    configuracion: false,
  });
  const [globalSearch, setGlobalSearch] = useState('');

  const navGroups: NavGroup[] = useMemo(
    () => [
      {
        id: 'inicio',
        label: 'Inicio',
        icon: <LayoutDashboard size={18} />,
        to: '/dashboard',
      },
      {
        id: 'estudiantes',
        label: 'Estudiantes',
        icon: <Users size={18} />,
        permission: 'students:read',
        children: [
          { label: 'Base general', to: '/estudiantes', permission: 'students:read' },
          { label: 'Nuevo estudiante', to: '/estudiantes/nuevo', permission: 'students:create' },
          { label: 'Importación masiva', to: '/estudiantes/importar', permission: 'students:import' },
        ],
      },
      {
        id: 'academica',
        label: 'Gestión académica',
        icon: <GraduationCap size={18} />,
        children: [
          { label: 'Ciclos lectivos', to: '/ciclos-lectivos' },
          { label: 'Cursos y divisiones', to: '/cursos' },
          { label: 'Turnos', to: '/turnos' },
          { label: 'Matrícula', to: '/matricula' },
          { label: 'Movimientos', to: '/matricula/movimientos' },
          { label: 'Migración anual', to: '/matricula/migracion', permission: 'enrollments:manage' },
        ],
      },
      {
        id: 'documentacion',
        label: 'Documentación',
        icon: <FileBadge2 size={18} />,
        children: [
          { label: 'Historial de certificados', to: '/certificados' },
          { label: 'Alumno regular', to: '/certificados/alumno-regular', permission: 'certificates:issue' },
          { label: 'Salario familiar', to: '/certificados/salario-familiar', permission: 'certificates:issue' },
          { label: 'Constancia general', to: '/certificados/constancia-general', permission: 'certificates:issue' },
          { label: 'Emisión masiva', to: '/certificados/emision-masiva', permission: 'certificates:issue_bulk' },
          { label: 'Validación documental', to: '/validar' },
        ],
      },
      {
        id: 'reportes',
        label: 'Reportes',
        icon: <BarChart3 size={18} />,
        children: [
          { label: 'Matrícula y estadísticas', to: '/reportes/matricula' },
          { label: 'Nóminas de estudiantes', to: '/reportes/nominas' },
        ],
      },
      {
        id: 'configuracion',
        label: 'Configuración',
        icon: <Settings size={18} />,
        children: [
          { label: 'Datos institucionales', to: '/configuracion/institucion', permission: 'settings:manage' },
          { label: 'Plantillas documentales', to: '/configuracion/plantillas', permission: 'templates:manage' },
          { label: 'Usuarios', to: '/configuracion/usuarios', permission: 'users:manage' },
          { label: 'Roles y permisos', to: '/configuracion/permisos', permission: 'users:manage' },
          { label: 'Auditoría', to: '/configuracion/auditoria', permission: 'audit:read' },
        ],
      },
    ],
    []
  );

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const breadcrumbs = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    return segments.map((seg, idx) => ({
      label: BREADCRUMB_LABELS[seg] || decodeURIComponent(seg),
      to: '/' + segments.slice(0, idx + 1).join('/'),
      isLast: idx === segments.length - 1,
    }));
  }, [location.pathname]);

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = globalSearch.trim();
    if (!q) return;
    navigate(`/estudiantes?q=${encodeURIComponent(q)}`);
    setGlobalSearch('');
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-surface-sidebar text-slate-200 select-none">
      {/* Brand header */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-white/10 shrink-0">
        <Link to="/dashboard" className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 shadow-sm">
            <img
              src={settings.logoUrl || '/logo.png'}
              alt="Logo E.E.S. N° 28"
              className="w-full h-full object-contain"
            />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-display font-bold text-sm text-white truncate leading-tight">
                SGAE · E.E.S. N° {settings.schoolNumber}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {settings.district}, {settings.province}
              </p>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
          aria-label="Cerrar menú"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5" aria-label="Navegación principal">
        {navGroups.map((group) => {
          if (group.permission && !can(group.permission)) return null;
          const visibleChildren = group.children?.filter(
            (c) => !c.permission || can(c.permission)
          );
          if (group.children && (!visibleChildren || visibleChildren.length === 0)) {
            return null;
          }

          if (group.to) {
            return (
              <NavLink
                key={group.id}
                to={group.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-white/8 hover:text-white'
                  )
                }
              >
                <span className="shrink-0">{group.icon}</span>
                {!collapsed && <span className="truncate">{group.label}</span>}
              </NavLink>
            );
          }

          const isExpanded = openGroups[group.id] && !collapsed;

          return (
            <div key={group.id} className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  if (collapsed) {
                    setCollapsed(false);
                    setOpenGroups((prev) => ({ ...prev, [group.id]: true }));
                  } else {
                    toggleGroup(group.id);
                  }
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-white/8 hover:text-white transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 text-slate-400">{group.icon}</span>
                  {!collapsed && <span className="truncate">{group.label}</span>}
                </span>
                {!collapsed && (
                  <ChevronDown
                    size={15}
                    className={cn(
                      'shrink-0 text-slate-400 transition-transform',
                      isExpanded && 'rotate-180'
                    )}
                  />
                )}
              </button>

              {isExpanded && visibleChildren && (
                <div className="pl-9 pr-1 space-y-0.5">
                  {visibleChildren.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      end={
                        child.to === '/estudiantes' ||
                        child.to === '/matricula' ||
                        child.to === '/certificados'
                      }
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'block px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                          isActive
                            ? 'bg-brand-500/90 text-white'
                            : 'text-slate-400 hover:text-white hover:bg-white/6'
                        )
                      }
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-3 border-t border-white/10">
          <Link
            to="/validar"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition-colors"
          >
            <QrCode size={15} className="text-emerald-brand-500 shrink-0" />
            <span className="truncate">Portal público de validación QR</span>
          </Link>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex bg-surface-canvas text-ink-primary">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:block shrink-0 sticky top-0 h-screen transition-all duration-200 border-r border-border-subtle z-30',
          collapsed ? 'w-[72px]' : 'w-64'
        )}
      >
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-72 max-w-[85vw] h-full shadow-2xl">{renderSidebarContent()}</div>
          <div
            className="flex-1 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-20 h-16 bg-surface-card/90 backdrop-blur-md border-b border-border-subtle px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl text-ink-secondary hover:bg-surface-subtle cursor-pointer"
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </button>

            {/* Buscador global */}
            <form onSubmit={handleGlobalSearch} className="hidden md:flex items-center relative w-64 xl:w-80">
              <Search
                size={15}
                className="absolute left-3.5 text-ink-muted pointer-events-none"
              />
              <input
                type="search"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Buscar estudiante por DNI o apellido..."
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-surface-subtle border border-border-subtle text-xs text-ink-primary placeholder:text-ink-muted focus:border-brand-500 focus:outline-none"
              />
            </form>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Selector global de Ciclo Lectivo */}
            <div className="flex items-center gap-2 bg-brand-50 dark:bg-brand-900/40 border border-brand-200 dark:border-brand-700 rounded-xl px-2.5 py-1.5">
              <CalendarDays size={15} className="text-brand-600 dark:text-brand-300 shrink-0" />
              <label htmlFor="global-year-select" className="sr-only">
                Ciclo lectivo
              </label>
              <select
                id="global-year-select"
                value={selectedYearId}
                onChange={(e) => setSelectedYearId(e.target.value)}
                className="bg-transparent text-xs font-bold text-brand-700 dark:text-brand-200 focus:outline-none cursor-pointer pr-1"
              >
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id} className="text-slate-900 bg-white">
                    Ciclo {y.year} {y.status === 'cerrado' ? '(Cerrado)' : y.status === 'planificacion' ? '(Plan.)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Modo claro / oscuro */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-xl border border-border-subtle bg-surface-card hover:bg-surface-subtle text-ink-secondary cursor-pointer"
              aria-label="Cambiar tema"
              title={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            {/* Menú de usuario */}
            {user && (
              <div className="flex items-center gap-2.5 pl-2 border-l border-border-subtle">
                <div className="hidden sm:block text-right leading-tight">
                  <p className="text-xs font-semibold text-ink-primary">
                    {user.apellido}, {user.nombre}
                  </p>
                  <p className="text-[11px] text-ink-muted flex items-center justify-end gap-1">
                    <ShieldCheck size={11} className="text-emerald-brand-500" />
                    {ROLE_DEFINITIONS[user.roleId]?.name ?? user.roleId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                  title="Cerrar sesión"
                  aria-label="Cerrar sesión"
                  className="p-2 rounded-xl border border-border-subtle bg-surface-card hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 text-ink-secondary transition-colors cursor-pointer"
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Breadcrumbs + Ciclo cerrado alert */}
        <div className="px-4 sm:px-6 pt-4 flex flex-wrap items-center justify-between gap-2">
          <nav aria-label="Ruta de navegación" className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Link to="/dashboard" className="hover:text-brand-500 font-medium">
              SGAE
            </Link>
            {breadcrumbs.map((bc) => (
              <React.Fragment key={bc.to}>
                <span>/</span>
                {bc.isLast ? (
                  <span className="font-semibold text-ink-primary">{bc.label}</span>
                ) : (
                  <Link to={bc.to} className="hover:text-brand-500">
                    {bc.label}
                  </Link>
                )}
              </React.Fragment>
            ))}
          </nav>

          {selectedYear?.status === 'cerrado' && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              Ciclo {selectedYear.year} cerrado — Modo consulta histórica
            </span>
          )}
        </div>

        {/* Page Outlet */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
