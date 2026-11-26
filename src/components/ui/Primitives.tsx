import React from 'react';
import { X, AlertTriangle, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils/formatters';

// ────────────────────────── BUTTON ──────────────────────────

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'emerald';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    const variants: Record<string, string> = {
      primary:
        'bg-brand-500 text-white hover:bg-brand-600 shadow-xs border border-brand-600/20',
      emerald:
        'bg-emerald-brand-500 text-white hover:bg-emerald-brand-600 shadow-xs border border-emerald-brand-600/20',
      secondary:
        'bg-surface-subtle text-ink-primary hover:bg-border-subtle border border-border-subtle',
      outline:
        'bg-surface-card text-ink-primary hover:bg-surface-subtle border border-border-strong',
      ghost: 'bg-transparent text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-xs border border-red-700/20',
    };

    const sizes: Record<string, string> = {
      sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
      md: 'h-9.5 px-4 text-sm rounded-xl gap-2',
      lg: 'h-11 px-5 text-sm rounded-xl gap-2',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed active:scale-[0.99]',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {loading && (
          <span className="inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

// ────────────────────────── CARD ──────────────────────────

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div
    className={cn(
      'bg-surface-card border border-border-subtle rounded-2xl shadow-[var(--sgae-shadow-xs)]',
      className
    )}
    {...props}
  />
);

// ────────────────────────── BADGE ──────────────────────────

export type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export const Badge: React.FC<{
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}> = ({ variant = 'neutral', className, children }) => {
  const styles: Record<BadgeVariant, string> = {
    neutral: 'bg-surface-subtle text-ink-secondary border-border-subtle',
    brand: 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-900/40 dark:text-brand-200 dark:border-brand-700',
    success:
      'bg-[var(--sgae-status-success-bg)] text-[var(--sgae-status-success-text)] border-[var(--sgae-status-success-border)]',
    warning:
      'bg-[var(--sgae-status-warning-bg)] text-[var(--sgae-status-warning-text)] border-[var(--sgae-status-warning-border)]',
    danger:
      'bg-[var(--sgae-status-danger-bg)] text-[var(--sgae-status-danger-text)] border-[var(--sgae-status-danger-border)]',
    info:
      'bg-[var(--sgae-status-info-bg)] text-[var(--sgae-status-info-text)] border-[var(--sgae-status-info-border)]',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border',
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
};

// ────────────────────────── FORM CONTROLS ──────────────────────────

const baseInputClass =
  'w-full rounded-xl border border-border-strong bg-surface-card px-3.5 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15 transition-all disabled:opacity-60 disabled:cursor-not-allowed';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(baseInputClass, 'h-10', className)} {...props} />
));
Input.displayName = 'Input';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(baseInputClass, 'h-10 cursor-pointer', className)} {...props} />
));
Select.displayName = 'Select';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(baseInputClass, 'min-h-24 resize-y', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const FieldLabel: React.FC<{
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ htmlFor, required, children }) => (
  <label
    htmlFor={htmlFor}
    className="block text-xs font-semibold uppercase tracking-wide text-ink-secondary mb-1.5"
  >
    {children}
    {required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
);

export const FieldError: React.FC<{ message?: string }> = ({ message }) =>
  message ? <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{message}</p> : null;

// ────────────────────────── PAGE HEADER ──────────────────────────

export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, subtitle, badge, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-border-subtle mb-6">
    <div>
      <div className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-2xl font-bold text-ink-primary tracking-tight">{title}</h1>
        {badge}
      </div>
      {subtitle && <p className="text-sm text-ink-secondary mt-1">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
  </div>
);

// ────────────────────────── STAT CARD ──────────────────────────

export const StatCard: React.FC<{
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ReactNode;
  accent?: 'brand' | 'emerald' | 'amber' | 'rose' | 'slate';
}> = ({ label, value, hint, icon, accent = 'brand' }) => {
  const accentMap = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300',
    emerald: 'bg-emerald-brand-50 text-emerald-brand-600 dark:bg-emerald-950/50 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300',
    slate: 'bg-surface-subtle text-ink-secondary',
  };

  return (
    <Card className="p-4 sm:p-5 hover:border-brand-300/60 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
          <p className="text-2xl sm:text-3xl font-bold text-ink-primary font-display mt-1.5">
            {value}
          </p>
          {hint && <p className="text-xs text-ink-secondary mt-1">{hint}</p>}
        </div>
        <div className={cn('p-2.5 rounded-xl shrink-0', accentMap[accent])}>{icon}</div>
      </div>
    </Card>
  );
};

// ────────────────────────── MODAL & CONFIRM ──────────────────────────

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, size = 'md', children }) => {
  if (!open) return null;
  const widths = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          'bg-surface-card border border-border-subtle rounded-2xl shadow-2xl w-full max-h-[90vh] flex flex-col overflow-hidden',
          widths[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-lg font-bold text-ink-primary">{title}</h2>
            {subtitle && <p className="text-xs text-ink-secondary mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-subtle cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  variant = 'danger',
  loading,
  onCancel,
  onConfirm,
}) => (
  <Modal open={open} onClose={onCancel} title={title} size="md">
    <div className="flex items-start gap-3">
      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 shrink-0">
        <AlertTriangle size={20} />
      </div>
      <p className="text-sm text-ink-secondary leading-relaxed">{description}</p>
    </div>
    <div className="flex justify-end gap-2 mt-6">
      <Button variant="outline" onClick={onCancel} disabled={loading}>
        Cancelar
      </Button>
      <Button variant={variant} onClick={onConfirm} loading={loading}>
        {confirmLabel}
      </Button>
    </div>
  </Modal>
);

// ────────────────────────── EMPTY & SKELETON ──────────────────────────

export const EmptyState: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ title, description, action, icon }) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-6">
    <div className="w-12 h-12 rounded-2xl bg-surface-subtle text-ink-muted flex items-center justify-center mb-3">
      {icon ?? <Inbox size={22} />}
    </div>
    <h3 className="text-base font-semibold text-ink-primary">{title}</h3>
    <p className="text-sm text-ink-secondary mt-1 max-w-md">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const SkeletonBlock: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse rounded-xl bg-surface-subtle', className)} />
);
