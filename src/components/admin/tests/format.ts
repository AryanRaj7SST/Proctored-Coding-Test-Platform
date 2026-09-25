import type { Tone } from '@/lib/utils';
import { formatInZone, sameDayInZone, utcOffsetLabel } from '../exam-types';
import type { AccessMode, AttemptState, Difficulty, ResultVisibility, TestPhase } from './types';

/* ------------------------------------------------------------ labels */

export const PHASE_LABEL: Record<TestPhase, string> = {
  DRAFT: 'Draft',
  UPCOMING: 'Upcoming',
  ACTIVE: 'Active',
  ENDED: 'Completed',
  ARCHIVED: 'Archived',
};

export const PHASE_TONE: Record<TestPhase, Tone> = {
  DRAFT: 'warn',
  UPCOMING: 'info',
  ACTIVE: 'ok',
  ENDED: 'neutral',
  ARCHIVED: 'neutral',
};

export const DIFFICULTY_TONE: Record<Difficulty, Tone> = { EASY: 'ok', MEDIUM: 'warn', HARD: 'bad' };

export const ACCESS_LABEL: Record<AccessMode, string> = {
  ASSIGNED_USERS_ONLY: 'Assigned students only',
  ANY_AUTHENTICATED_USER: 'Any signed-in student',
};

export const VISIBILITY_LABEL: Record<ResultVisibility, string> = {
  HIDDEN: 'Hidden',
  SCORE_ONLY: 'Score only',
  FULL: 'Full breakdown',
};

export const ATTEMPT_STATE_LABEL: Record<AttemptState, { label: string; tone: Tone }> = {
  NOT_STARTED: { label: 'Not started', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'warn' },
  GRADING_PENDING: { label: 'Grading pending', tone: 'info' },
  SUBMITTED: { label: 'Submitted', tone: 'ok' },
};

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/* -------------------------------------------------------- list links */

export const PHASE_TABS: { id: '' | TestPhase; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'UPCOMING', label: 'Upcoming' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'ENDED', label: 'Completed' },
  { id: 'DRAFT', label: 'Drafts' },
  { id: 'ARCHIVED', label: 'Archived' },
];

/** /admin/exams URL for a tab, search and page (safe to call on the server). */
export function testsHref(params: { phase?: string; q?: string; page?: number }): string {
  const sp = new URLSearchParams();
  if (params.phase) sp.set('phase', params.phase);
  if (params.q) sp.set('q', params.q);
  if (params.page && params.page > 1) sp.set('page', String(params.page));
  const qs = sp.toString();
  return qs ? `/admin/exams?${qs}` : '/admin/exams';
}

/* ------------------------------------------------------------- marks */

/** Marks: 0.01 to 1000 with at most 2 decimal places (same rule as the server). */
export const MARKS_RE = /^\d{1,4}(\.\d{1,2})?$/;
/** Passing percentage: 0 to 100 with at most 2 decimal places. */
export const PERCENT_RE = /^\d{1,3}(\.\d{1,2})?$/;

export function marksError(value: string): string | null {
  const v = value.trim();
  if (v === '') return 'Enter the marks for this question.';
  if (!MARKS_RE.test(v) || Number(v) <= 0 || Number(v) > 1000) {
    return 'Marks must be between 0.01 and 1000, with at most 2 decimal places.';
  }
  return null;
}

export function percentError(value: string): string | null {
  const v = value.trim();
  if (!PERCENT_RE.test(v) || Number(v) > 100)
    return 'Enter a percentage between 0 and 100 (up to 2 decimals).';
  return null;
}

/** Exact hundredths, so totals never pick up float noise (0.1 + 0.2). */
export const toCents = (value: string | number): number => {
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** 40 -> "40", 37.5 -> "37.5", 3.3333 -> "3.33". */
export function formatMarks(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '');
}

export function sumMarks(values: (string | number)[]): number {
  return values.reduce<number>((sum, v) => sum + toCents(v), 0) / 100;
}

/** "40 of 100 marks (40%)" -- '' when the percentage is not a number. */
export function passMarkShort(totalMarks: number, percentage: string | number): string {
  const raw = String(percentage).trim();
  const pct = Number(raw);
  if (raw === '' || !Number.isFinite(pct)) return '';
  const needed = (totalMarks * pct) / 100;
  return `${formatMarks(needed)} of ${formatMarks(totalMarks)} marks (${formatMarks(pct)}%)`;
}

/** "Pass mark: 40 of 100 marks (40%)". */
export function passMarkText(totalMarks: number, percentage: string | number): string {
  const short = passMarkShort(totalMarks, percentage);
  return short ? `Pass mark: ${short}` : 'Enter a passing percentage.';
}

/* ---------------------------------------------------------- schedule */

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '--';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * "Opens 25 Sep 2026, 10:00 AM · Closes 12:00 PM (Asia/Kolkata, UTC+05:30) ·
 * 60 min per attempt" -- every time in the test's own zone.
 */
export function scheduleSummary(input: {
  startIso: string | null;
  endIso: string | null;
  timeZone: string;
  durationMinutes: number;
}): string {
  const { startIso, endIso, timeZone, durationMinutes } = input;
  const at = new Date(startIso || endIso || Date.now()).getTime();
  const zone = `(${timeZone}, ${utcOffsetLabel(timeZone, at)})`;
  const opens = startIso ? `Opens ${formatInZone(startIso, timeZone)}` : 'Opens as soon as it is published';
  const closes = endIso
    ? `Closes ${formatInZone(endIso, timeZone, startIso && sameDayInZone(startIso, endIso, timeZone) ? 'time' : 'datetime')}`
    : 'No closing time';
  const duration =
    Number.isFinite(durationMinutes) && durationMinutes > 0 ? `${durationMinutes} min per attempt` : '';
  return [opens, `${closes} ${zone}`, duration].filter(Boolean).join(' · ');
}

/** "25 Sep 2026, 10:00 AM → 12:00 PM" for tables, in the test's zone. */
export function scheduleRange(startIso: string | null, endIso: string | null, timeZone: string): string {
  const start = startIso ? formatInZone(startIso, timeZone) : 'Opens on publish';
  if (!endIso) return `${start} → no close`;
  const sameDay = startIso ? sameDayInZone(startIso, endIso, timeZone) : false;
  return `${start} → ${formatInZone(endIso, timeZone, sameDay ? 'time' : 'datetime')}`;
}
