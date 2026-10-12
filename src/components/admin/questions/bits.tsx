'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Tiny primitives the question editor needs that the shared UI kit does not
 * have. Styled with the same ink/brand/ok/warn/bad tokens.
 */

type NoticeTone = 'info' | 'ok' | 'warn' | 'bad';

const NOTICE_TONES: Record<NoticeTone, string> = {
  info: 'bg-blue-50 text-blue-800 ring-1 ring-blue-200',
  ok: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  bad: 'bg-rose-50 text-rose-800 ring-1 ring-rose-200',
};

export function Notice({
  tone = 'info',
  title,
  children,
  action,
  className,
  role,
}: {
  tone?: NoticeTone;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  role?: 'alert' | 'status';
}) {
  return (
    <div
      role={role}
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 rounded-md p-3 text-xs ring-1 shadow-xs',
        NOTICE_TONES[tone],
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-1 leading-relaxed">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Accessible on/off switch (role="switch"). */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  showLabel = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  showLabel?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 rounded-md text-xs text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition shadow-xs',
          checked ? 'bg-blue-600' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white shadow-xs transition',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </span>
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}

/** A compact label + control pair for dense builder rows. */
export function MiniField({
  label,
  children,
  className,
  hint,
}: {
  label: string;
  children: (id: string) => React.ReactNode;
  className?: string;
  hint?: string;
}) {
  const id = React.useId();
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <label htmlFor={id} className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** Small square icon button for row actions (move, duplicate, delete). */
export function IconButton({
  label,
  onClick,
  disabled,
  tone = 'neutral',
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'bad';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded text-xs transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500',
        tone === 'bad' ? 'text-rose-600 hover:text-rose-700' : 'text-slate-500 hover:text-slate-900',
      )}
    >
      {children}
    </button>
  );
}

/** A numbered section title inside a card. */
export function SectionTitle({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}
