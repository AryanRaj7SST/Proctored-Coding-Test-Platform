/**
 * Server-authoritative exam timing. The client countdown is decoration only;
 * every decision below is made from server time + persisted timestamps.
 */

export type ExamAvailability =
  | 'NOT_STARTED' // before exam.startTime
  | 'AVAILABLE' // inside the window, no session yet
  | 'IN_PROGRESS' // session open and not expired
  | 'EXPIRED' // personal sitting ran out
  | 'ENDED' // exam window closed
  | 'SUBMITTED'
  | 'UNPUBLISHED';

export interface ExamWindow {
  status: 'DRAFT' | 'PUBLISHED' | 'ACTIVE' | 'ENDED' | 'ARCHIVED';
  startTime: Date | null;
  endTime: Date | null;
  durationMinutes: number;
}

export interface SessionState {
  startedAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
}

/** Deadline for one sitting: min(session start + duration, exam endTime). */
export function computeExpiry(startedAt: Date, durationMinutes: number, examEndTime: Date | null): Date {
  const byDuration = new Date(startedAt.getTime() + Math.max(1, durationMinutes) * 60_000);
  if (examEndTime && examEndTime.getTime() < byDuration.getTime()) return new Date(examEndTime.getTime());
  return byDuration;
}

export function msRemaining(expiresAt: Date, now: Date = new Date()): number {
  return Math.max(0, expiresAt.getTime() - now.getTime());
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function examAvailability(
  exam: ExamWindow,
  session: SessionState | null,
  opts: { submitted?: boolean; now?: Date } = {},
): ExamAvailability {
  const now = opts.now ?? new Date();
  if (opts.submitted) return 'SUBMITTED';
  if (exam.status === 'DRAFT' || exam.status === 'ARCHIVED') return 'UNPUBLISHED';
  if (exam.status === 'ENDED') return 'ENDED';
  if (exam.endTime && now.getTime() > exam.endTime.getTime()) return 'ENDED';
  if (exam.startTime && now.getTime() < exam.startTime.getTime()) return 'NOT_STARTED';
  if (session && !session.endedAt) return isExpired(session.expiresAt, now) ? 'EXPIRED' : 'IN_PROGRESS';
  if (session && session.endedAt) return 'SUBMITTED';
  return 'AVAILABLE';
}

/** May the student still mutate an attempt (autosave / run / submit)? */
export function canModifyAttempt(
  availability: ExamAvailability,
  attemptStatus: 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'EXPIRED',
): boolean {
  if (attemptStatus !== 'IN_PROGRESS') return false;
  return availability === 'IN_PROGRESS' || availability === 'AVAILABLE';
}

/**
 * Grace window (ms) allowed for a submit that raced the deadline. Keeps an
 * honest student from losing work to network latency without meaningfully
 * extending the exam.
 */
export const SUBMIT_GRACE_MS = 5_000;

export function withinSubmitDeadline(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() <= expiresAt.getTime() + SUBMIT_GRACE_MS;
}
