'use client';

import * as React from 'react';
import { cn, statusTone, type Tone } from '@/lib/utils';
export { statusTone, type Tone };

/* ------------------------------------------------------------------ Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs focus-visible:outline-blue-500',
  secondary:
    'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs focus-visible:outline-blue-500',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-blue-500',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-xs focus-visible:outline-rose-500',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs focus-visible:outline-emerald-500',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-6 text-sm',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? <Spinner className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- Spinner */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className ?? 'h-4 w-4')}
      viewBox="0 0 24 24"
      role="status"
      aria-label="Loading"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/* ------------------------------------------------------------------- Input */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        {...rest}
        className={cn(
          'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400',
          'shadow-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600',
          'disabled:bg-slate-50 disabled:text-slate-400 disabled:opacity-60',
          className,
        )}
      />
    );
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      {...rest}
      className={cn(
        'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400',
        'shadow-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600',
        'disabled:bg-slate-50 disabled:text-slate-400',
        className,
      )}
    />
  );
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        {...rest}
        className={cn(
          'h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900',
          'shadow-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600',
          'disabled:bg-slate-50 disabled:text-slate-400',
          className,
        )}
      >
        {children}
      </select>
    );
  },
);

export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
      >
        {label}
        {required ? <span className="ml-1 text-bad">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-rose-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('shadow-xs rounded-lg border border-slate-200 bg-white', className)}>{children}</div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-3.5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </Card>
  );
}

/* ------------------------------------------------------------------- Badge */

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border border-slate-200',
  ok: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
  warn: 'bg-amber-50 text-amber-800 border border-amber-200/80',
  bad: 'bg-rose-50 text-rose-700 border border-rose-200/80',
  info: 'bg-blue-50 text-blue-700 border border-blue-200/80',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status.replace(/_/g, ' ').toLowerCase()}</Badge>;
}

/* ------------------------------------------------------------- Empty state */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="shadow-xs flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded bg-slate-100', className ?? 'h-4 w-full')}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-slate-200/50 to-transparent" />
    </div>
  );
}

/* ------------------------------------------------------------------- Table */

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)}>{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-slate-200 bg-slate-50/80 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={cn('border-b border-slate-100 px-4 py-3 align-middle text-slate-800', className)}>
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------- Modal */

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  dismissible = true,
  theme = 'light',
  className,
}: {
  open: boolean;
  title: string;
  onClose?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dismissible?: boolean;
  theme?: 'dark' | 'light';
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const isLight = theme === 'light';

  // Focus management: move focus into the dialog, trap Tab, restore on close.
  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute('disabled'));

    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={cn(
          'absolute inset-0 transition-opacity',
          isLight ? 'backdrop-blur-xs bg-slate-900/40' : 'bg-black/70',
        )}
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 w-full max-w-lg animate-fade-in rounded-xl shadow-2xl transition-all',
          isLight ? 'border border-slate-200 bg-white shadow-xl ring-0' : 'bg-ink-850 ring-1 ring-ink-600',
          className,
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between border-b px-5 py-3.5',
            isLight ? 'border-slate-100' : 'border-ink-700',
          )}
        >
          <h2
            className={cn(
              'text-base font-bold',
              isLight ? 'text-slate-900' : 'text-sm font-semibold text-slate-100',
            )}
          >
            {title}
          </h2>
          {dismissible && onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className={cn(
                'rounded p-1 text-xs transition',
                isLight
                  ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                  : 'text-slate-400 hover:bg-ink-800 hover:text-white',
              )}
            >
              ✕
            </button>
          ) : null}
        </div>
        <div
          className={cn('px-5 py-4 text-sm leading-relaxed', isLight ? 'text-slate-600' : 'text-slate-300')}
        >
          {children}
        </div>
        {footer ? (
          <div
            className={cn(
              'flex justify-end gap-2.5 border-t px-5 py-3.5',
              isLight ? 'rounded-b-xl border-slate-100 bg-slate-50/70' : 'border-ink-700',
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  busy,
  onConfirm,
  onCancel,
  theme = 'light',
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  theme?: 'dark' | 'light';
}) {
  const isLight = theme === 'light';

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      theme={theme}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={cn(
              'rounded-md px-3.5 py-2 text-xs font-semibold transition',
              isLight
                ? 'shadow-xs border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50'
                : 'border border-ink-600 bg-ink-800 text-slate-200 hover:bg-ink-700 disabled:opacity-50',
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              'shadow-xs rounded-md px-3.5 py-2 text-xs font-semibold text-white transition disabled:opacity-50',
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700',
            )}
          >
            {busy ? 'Processing…' : confirmLabel}
          </button>
        </>
      }
    >
      {message}
    </Modal>
  );
}

/* -------------------------------------------------------------------- Tabs */

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { id: string; label: string; badge?: React.ReactNode }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('flex items-center gap-1 border-b border-slate-200 bg-white px-1', className)}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500',
            active === t.id
              ? 'border-b-2 border-blue-600 bg-white font-semibold text-blue-600'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
          )}
        >
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}

export { ResizeHandle } from './ResizeHandle';
