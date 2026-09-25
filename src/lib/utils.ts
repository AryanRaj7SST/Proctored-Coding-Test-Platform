import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Marks for display: at most 2 decimals, trailing zeros dropped (2.3333 -> "2.33",
 * 8 -> "8"). Display only -- stored scores keep 4 decimals and are never rounded.
 */
export function displayMarks(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return String(Math.round(value * 100) / 100);
}

/**
 * A date-time in an explicit IANA time zone, with the zone named, e.g.
 * "25 Sep 2026, 10:00 am IST". Schedules are shown in the test's own zone so
 * every reader sees the same wall-clock time.
 */
export function formatDateTimeInZone(value: Date | string | null | undefined, timeZone: string): string {
  if (!value) return '--';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '--';
  try {
    return d.toLocaleString('en-IN', {
      timeZone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return formatDateTime(d);
  }
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
