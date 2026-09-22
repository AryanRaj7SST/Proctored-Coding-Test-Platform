import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '--';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '--';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return `${m}m ${rest}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function formatClock(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function percentage(score: number, maxScore: number): number {
  if (!maxScore || maxScore <= 0) return 0;
  return Math.round((score / maxScore) * 1000) / 10;
}

export function truncate(value: string, max = 120): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}\u2026`;
}

export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info';

/** Shared mapping so a status looks identical everywhere in the product. */
export function statusTone(status: string): Tone {
  switch (status) {
    case 'ACTIVE':
    case 'PASSED':
    case 'COMPLETED':
    case 'SUBMITTED':
    case 'PUBLISHED':
      return 'ok';
    case 'AWAY':
    case 'PARTIAL':
    case 'NOT_VALIDATED':
    case 'RUNNING':
    case 'QUEUED':
    case 'IN_PROGRESS':
      return 'warn';
    case 'DISCONNECTED':
    case 'EXPIRED':
    case 'FAILED':
    case 'TIMEOUT':
      return 'bad';
    case 'DRAFT':
    case 'ARCHIVED':
    case 'NOT_STARTED':
      return 'neutral';
    default:
      return 'info';
  }
}
