import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock, UserCheck, QrCode, AlertCircle, ShieldCheck, Building2 } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { isFirebaseConfigured } from '@/lib/database/firebase';
import { Button, FieldLabel, Input } from '@/components/ui/Primitives';

export const LoginPage: React.FC = () => {
  const { login, loading } = useAuth();
  const { settings } = useAcademicYear();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/dashboard';

  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = await login(dni, password);
    if (result.success) {
      navigate(from, { replace: true });
    } else {
      setError(result.message || 'No se pudo iniciar sesión.');
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-surface-canvas">
      {/* Panel institucional izquierdo (Banner Design) */}
      <div className="hidden lg:flex lg:col-span-7 institutional-banner text-white p-12 flex-col justify-between">
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white p-2 shadow-lg flex items-center justify-center">
            <img
              src={settings.logoUrl || '/logo.png'}
              alt="Logo institucional"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-blue-200 font-semibold">
              Provincia de Buenos Aires · DGCyE
            </p>
            <h1 className="text-xl font-bold font-display text-white">
              {settings.institutionName}
            </h1>
          </div>
        </div>

        <div className="relative z-10 max-w-xl space-y-6">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-emerald-300">
            <ShieldCheck size={14} /> Sistema de Gestión Administrativa Escolar (SGAE)
          </span>
          <h2 className="text-4xl font-extrabold font-display leading-tight tracking-tight">
            Gestión integral de matrícula, trayectorias y documentación institucional.
          </h2>
          <p className="text-sm text-blue-100/90 leading-relaxed">
            Infraestructura compartida con el Host de Educación Física sobre fuente única de
            estudiantes, con trazabilidad anual, emisión de certificados A4 con validación QR y
            protección de datos personales (Ley 25.326).
          </p>

          <div className="grid grid-cols-3 gap-4 pt-4">
            <div className="rounded-2xl bg-white/8 border border-white/12 p-4">
              <p className="text-xs text-blue-200">Distrito</p>
              <p className="font-display font-bold text-base mt-0.5">{settings.district}</p>
            </div>
            <div className="rounded-2xl bg-white/8 border border-white/12 p-4">
              <p className="text-xs text-blue-200">Nivel</p>
              <p className="font-display font-bold text-base mt-0.5">{settings.educationLevel}</p>
            </div>
            <div className="rounded-2xl bg-white/8 border border-white/12 p-4">
              <p className="text-xs text-blue-200">Validación</p>
              <p className="font-display font-bold text-base mt-0.5">QR + Token</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-blue-200/80 border-t border-white/10 pt-5">
          <span className="flex items-center gap-1.5">
            <Building2 size={14} /> {settings.issuePlace}
          </span>
          <Link
            to="/validar"
            className="inline-flex items-center gap-1.5 text-white hover:text-emerald-300 font-semibold transition-colors"
          >
            <QrCode size={14} /> Verificar un certificado
          </Link>
        </div>
      </div>

      {/* Formulario de acceso */}
      <div className="lg:col-span-5 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-white p-1.5 border border-border-subtle shadow-xs">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="font-display font-bold text-base text-ink-primary">
                SGAE · E.E.S. N° {settings.schoolNumber}
              </p>
              <p className="text-xs text-ink-muted">{settings.issuePlace}</p>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold font-display text-ink-primary">
              Acceso Administrativo
            </h2>
            <p className="text-sm text-ink-secondary mt-1">
              Ingresá con tu DNI y la misma contraseña que utilizás en HOST28_EF.
            </p>
          </div>

          {!isFirebaseConfigured && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
              <div>
                <strong>Firebase no configurado:</strong> creá <code>.env.local</code> a partir de{' '}
                <code>.env.example</code> con las claves del proyecto <code>partesees28</code>.
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs font-medium flex items-start gap-2.5"
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <FieldLabel htmlFor="login-dni" required>
                DNI del personal
              </FieldLabel>
              <Input
                id="login-dni"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                placeholder="Sin puntos ni espacios"
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                required
              />
            </div>

            <div>
              <FieldLabel htmlFor="login-pass" required>
                Contraseña
              </FieldLabel>
              <Input
                id="login-pass"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              <Lock size={16} />
              Ingresar al sistema
            </Button>
          </form>

          <div className="pt-4 border-t border-border-subtle flex flex-col gap-3 text-xs text-ink-muted">
            <div className="flex items-start gap-2">
              <UserCheck size={15} className="text-brand-500 shrink-0 mt-0.5" />
              <span>
                El acceso se encuentra controlado por roles y permisos independientes del Host de
                Educación Física.
              </span>
            </div>
            <Link
              to="/emision"
              className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-brand-200 bg-brand-50/70 hover:bg-brand-100/70 dark:bg-brand-900/30 dark:border-brand-700 text-brand-700 dark:text-brand-200 font-semibold transition-colors"
            >
              <UserCheck size={15} />
              Preceptoría: Emitir constancias sin registro (/emision)
            </Link>
            <Link
              to="/validar"
              className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-border-strong bg-surface-card hover:bg-surface-subtle text-ink-primary font-medium transition-colors"
            >
              <QrCode size={15} className="text-emerald-brand-500" />
              Validar un certificado por código o QR
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
