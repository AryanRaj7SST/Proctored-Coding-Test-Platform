import type { Tone } from '@/lib/utils';

/**
 * Display helpers for results. Every number shown here comes from the server
 * (stored grading); these functions only format it -- nothing is recomputed.
 */

export type SittingState = 'IN_PROGRESS' | 'GRADING_PENDING' | 'PASSED' | 'FAILED';
export type ResultsView = 'best' | 'all';

const MARKS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** A mark value with at most two decimals (4.6667 -> "4.67"). */
export function formatMarks(value: number): string {
  return MARKS.format(value);
}

/** "8.5 / 10", or "— / 10" while no score exists yet (never shown as 0). */
export function formatScore(score: number | null, maxScore: number): string {
  return `${score === null ? '—' : formatMarks(score)} / ${formatMarks(maxScore)}`;
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${formatMarks(value)}%`;
}

/**
 * Date and time in the test's own time zone (deterministic on server and
 * client, so no hydration drift). Falls back to the runtime zone when the
 * zone is missing or unknown.
 */
export function formatInZone(iso: string | null, timeZone?: string, withZone = false): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(withZone ? { timeZoneName: 'short' } : {}),
  };
  try {
    return date.toLocaleString('en-US', { ...options, timeZone });
  } catch {
    return date.toLocaleString('en-US', options);
  }
}

/* ------------------------------------------------------------ sittings */

export const SITTING_STATE: Record<SittingState, { label: string; tone: Tone }> = {
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  GRADING_PENDING: { label: 'Grading pending', tone: 'warn' },
  PASSED: { label: 'Passed', tone: 'ok' },
  FAILED: { label: 'Failed', tone: 'bad' },
};

export const STATE_OPTIONS: { value: SittingState; label: string }[] = [
  { value: 'PASSED', label: 'Passed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'GRADING_PENDING', label: 'Grading pending' },
  { value: 'IN_PROGRESS', label: 'In progress' },
];

/** State of a sitting listed in `otherSittings` (which carries no explicit state). */
export function otherSittingState(s: { result: 'PASSED' | 'FAILED' | null; submittedAt: string | null }) {
  if (s.result) return SITTING_STATE[s.result];
  return s.submittedAt ? SITTING_STATE.GRADING_PENDING : SITTING_STATE.IN_PROGRESS;
}

/* ------------------------------------------------------------ questions */

const RESULT_STATUS_LABEL: Record<string, string> = {
  PASSED: 'Passed',
  PARTIAL: 'Partial',
  FAILED: 'Failed',
  NOT_RUN: 'Not run',
  RUNNER_ERROR: 'Grading pending',
};

export function resultStatusLabel(status: string): string {
  return RESULT_STATUS_LABEL[status] ?? status.replace(/_/g, ' ').toLowerCase();
}

export interface QuestionStatusView {
  label: string;
  tone: Tone;
  /** Submitted but without a usable grade: show "grading pending", never a score. */
  pending: boolean;
  submitted: boolean;
}

/** How one answered question reads in the breakdown. */
export function questionStatus(q: {
  status: string;
  resultStatus: string;
  graded: boolean;
}): QuestionStatusView {
  if (q.status === 'IN_PROGRESS')
    return { label: 'Not submitted', tone: 'neutral', pending: false, submitted: false };
  if (!q.graded || q.resultStatus === 'RUNNER_ERROR') {
    return { label: 'Grading pending', tone: 'warn', pending: true, submitted: true };
  }
  switch (q.resultStatus) {
    case 'PASSED':
      return { label: 'Passed', tone: 'ok', pending: false, submitted: true };
    case 'PARTIAL':
      return { label: 'Partial', tone: 'warn', pending: false, submitted: true };
    case 'FAILED':
      return { label: 'Failed', tone: 'bad', pending: false, submitted: true };
    default:
      return { label: 'Not run', tone: 'neutral', pending: false, submitted: true };
  }
}

/* ------------------------------------------------------------ list query */

export interface ResultsQuery {
  examId?: string;
  batch?: string;
  q?: string;
  state?: SittingState;
  view?: ResultsView;
  page?: number;
  pageSize?: number;
}

/** Clean query-string params for the results list (defaults omitted). */
export function resultsParams(query: ResultsQuery): Record<string, string | undefined> {
  return {
    examId: query.examId || undefined,
    batch: query.batch || undefined,
    q: query.q?.trim() || undefined,
    state: query.state || undefined,
    view: query.view === 'all' ? 'all' : undefined,
    page: query.page && query.page > 1 ? String(query.page) : undefined,
    pageSize: query.pageSize && query.pageSize !== 50 ? String(query.pageSize) : undefined,
  };
}

export function resultsQueryString(query: ResultsQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resultsParams(query))) if (value) params.set(key, value);
  return params.toString();
}
