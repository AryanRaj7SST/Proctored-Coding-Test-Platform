'use client';

import * as React from 'react';
import { Badge, Button, Modal } from '@/components/ui';
import { cn, type Tone } from '@/lib/utils';
import { PHASE_LABEL, PHASE_TONE } from './format';
import type { TestPhase } from './types';

export function PhaseBadge({ phase }: { phase: TestPhase }) {
  return (
    <Badge tone={PHASE_TONE[phase]} className={phase === 'ARCHIVED' ? 'opacity-70' : undefined}>
      {PHASE_LABEL[phase]}
    </Badge>
  );
}

const NOTICE_TONE: Record<Tone, string> = {
  neutral: 'bg-slate-50 text-slate-700 ring-slate-200',
  info: 'bg-blue-50 text-blue-800 ring-blue-200',
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  bad: 'bg-rose-50 text-rose-800 ring-rose-200',
};

/** An inline callout for explanations and warnings. */
export function Notice({
  tone = 'neutral',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-md p-3 text-xs leading-relaxed ring-1', NOTICE_TONE[tone], className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? 'mt-1' : undefined}>{children}</div> : null}
    </div>
  );
}

/** A confirmation dialog whose body can explain consequences in full (lists, emphasis). */
export function ConfirmAction({
  open,
  title,
  children,
  confirmLabel,
  variant = 'primary',
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  variant?: 'primary' | 'danger' | 'success';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? undefined : onCancel}
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-2">{children}</div>
    </Modal>
  );
}

/** A small key/value row used by summaries. */
export function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-slate-800">{children}</dd>
    </div>
  );
}

/**
 * The current time, but only after mount: time-dependent hints ("the end time
 * is in the past") render on the client only, so SSR and hydration agree.
 */
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Debounce a changing value (search boxes). */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/** A labelled choice card for radio groups (access mode, result visibility). */
export function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  title,
  description,
  disabled,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: string;
  description: React.ReactNode;
  disabled?: boolean;
}) {
  const id = `${name}-${value}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        'shadow-xs flex cursor-pointer gap-3 rounded-lg border p-3 transition',
        checked
          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
          : 'border-slate-200 bg-white hover:bg-slate-50',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        type="radio"
        id={id}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
      </span>
    </label>
  );
}
