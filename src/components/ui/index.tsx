'use client';

import * as React from 'react';
import { cn, statusTone, type Tone } from '@/lib/utils';
export { statusTone, type Tone };

/* ------------------------------------------------------------------ Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-500',
  secondary:
    'bg-ink-800 text-slate-100 ring-1 ring-inset ring-ink-600 hover:bg-ink-700 focus-visible:outline-brand-500',
  ghost: 'bg-transparent text-slate-300 hover:bg-ink-800 hover:text-white focus-visible:outline-brand-500',
  danger: 'bg-bad text-white hover:brightness-110 focus-visible:outline-bad',
  success: 'bg-ok text-white hover:brightness-110 focus-visible:outline-ok',
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
    <svg className={cn('animate-spin', className ?? 'h-4 w-4')} viewBox="0 0 24 24" role="status" aria-label="Loading">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
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
          'h-9 w-full rounded-md bg-ink-900 px-3 text-sm text-slate-100 placeholder:text-slate-500',
          'ring-1 ring-inset ring-ink-600 focus:outline-none focus:ring-2 focus:ring-brand-500',
          'disabled:opacity-60',
          className,
        )}
      />
    );
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        {...rest}
        className={cn(
          'w-full rounded-md bg-ink-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500',
          'ring-1 ring-inset ring-ink-600 focus:outline-none focus:ring-2 focus:ring-brand-500',
          className,
        )}
      />
    );
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        {...rest}
        className={cn(
          'h-9 w-full rounded-md bg-ink-900 px-2 text-sm text-slate-100',
          'ring-1 ring-inset ring-ink-600 focus:outline-none focus:ring-2 focus:ring-brand-500',
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
      <label htmlFor={htmlFor} className="block text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
        {required ? <span className="ml-1 text-bad">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-bad" role="alert">
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
  return <div className={cn('rounded-lg bg-ink-850 ring-1 ring-ink-700', className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-700 px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </Card>
  );
}

/* ------------------------------------------------------------------- Badge */


const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-700 text-slate-300',
  ok: 'bg-ok/15 text-ok ring-1 ring-inset ring-ok/30',
  warn: 'bg-warn/15 text-warn ring-1 ring-inset ring-warn/30',
  bad: 'bg-bad/15 text-bad ring-1 ring-inset ring-bad/30',
  info: 'bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/30',
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
    <span className={cn('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>
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
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-ink-600 px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs text-slate-400">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded bg-ink-800', className ?? 'h-4 w-full')}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
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
        'border-b border-ink-700 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn('border-b border-ink-800 px-3 py-2 align-middle text-slate-200', className)}>{children}</td>;
}

/* ------------------------------------------------------------------- Modal */

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  dismissible = true,
}: {
  open: boolean;
  title: string;
  onClose?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dismissible?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

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
        className="absolute inset-0 bg-black/70"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-lg animate-fade-in rounded-lg bg-ink-850 ring-1 ring-ink-600 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          {dismissible && onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded p-1 text-slate-400 hover:bg-ink-800 hover:text-white"
            >
              ✕
            </button>
          ) : null}
        </div>
        <div className="px-4 py-4 text-sm text-slate-300">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-ink-700 px-4 py-3">{footer}</div> : null}
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
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
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
    <div role="tablist" className={cn('flex items-center gap-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'inline-flex items-center gap-2 rounded-t px-3 py-1.5 text-xs font-medium transition',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500',
            active === t.id
              ? 'bg-ink-850 text-white ring-1 ring-inset ring-ink-600'
              : 'text-slate-400 hover:bg-ink-800 hover:text-slate-200',
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
