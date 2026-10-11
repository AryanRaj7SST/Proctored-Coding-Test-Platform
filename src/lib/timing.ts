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
  status: 'DRAFT' | 'PUBLISHED' | 'ENDED' | 'ARCHIVED';
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

/**
 * Time left in a sitting as the live monitor shows it: null once the sitting
 * has ended (submitted, auto-submitted or closed), because the clock no longer
 * means anything for it -- the monitor shows the final state instead.
 */
export function sittingRemainingMs(
  sitting: { expiresAt: Date; endedAt: Date | null },
  now: Date = new Date(),
): number | null {
  if (sitting.endedAt) return null;
  return msRemaining(sitting.expiresAt, now);
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime();
}

/**
 * The window as an account with open test access sees it (see
 * hasOpenTestAccess): no opening or closing time, and a closed test counts
 * as published. Only the account's own sitting clock still applies.
 */
export function unboundedWindow<T extends ExamWindow>(exam: T): T {
  return {
    ...exam,
    status: exam.status === 'ENDED' ? 'PUBLISHED' : exam.status,
    startTime: null,
    endTime: null,
  };
}

/** Has the exam window itself closed (admin ended it, or endTime passed)? */
export function examClosed(exam: ExamWindow, now: Date = new Date()): boolean {
  if (exam.status === 'ENDED') return true;
  return Boolean(exam.endTime && now.getTime() > exam.endTime.getTime());
}

/**
 * The student's personal state for an exam.
 *
 * The sitting is checked BEFORE the exam window: a sitting that ran out must
 * surface as EXPIRED (so it gets finalised) even when the exam has since
 * closed, and a finished sitting is SUBMITTED regardless of the window.
 * ENDED / NOT_STARTED only describe students who have no open sitting.
 *
 * `allowEarlyStart` lets an administrator dry-run an exam before its window
 * opens. It never overrides an existing sitting.
 *
 * `attemptsRemaining` > 0 means a finished sitting may be followed by a new
 * one (Exam.maxAttempts): the student is then judged by the window alone.
 */
export function examAvailability(
  exam: ExamWindow,
  session: SessionState | null,
  opts: { submitted?: boolean; now?: Date; allowEarlyStart?: boolean; attemptsRemaining?: number } = {},
): ExamAvailability {
  const now = opts.now ?? new Date();
  const canRetake = (opts.attemptsRemaining ?? 0) > 0;
  if (opts.submitted && !canRetake) return 'SUBMITTED';
  if (session?.endedAt) {
    if (!canRetake) return 'SUBMITTED';
    session = null; // a new sitting would start: only the window matters
  }
  if (session && isExpired(session.expiresAt, now)) return 'EXPIRED';
  if (examClosed(exam, now)) return 'ENDED';
  if (session) return 'IN_PROGRESS';
  if (exam.status === 'DRAFT' || exam.status === 'ARCHIVED') return 'UNPUBLISHED';
  if (exam.startTime && now.getTime() < exam.startTime.getTime() && !opts.allowEarlyStart) {
    return 'NOT_STARTED';
  }
  return 'AVAILABLE';
}

/**
 * Must the server finalise (grade + close) this sitting now?
 *
 * Expiry waits out SUBMIT_GRACE_MS so the student's last autosave, flushed the
 * moment their countdown hits zero, lands before grading reads the code. An
 * exam closed by an administrator is finalised immediately.
 */
export function sittingNeedsFinalization(
  exam: ExamWindow,
  session: SessionState | null,
  now: Date = new Date(),
): boolean {
  if (!session || session.endedAt) return false;
  if (exam.status === 'ENDED') return true;
  const deadline = session.expiresAt.getTime() + SUBMIT_GRACE_MS;
  if (now.getTime() >= deadline) return true;
  return Boolean(exam.endTime && now.getTime() >= exam.endTime.getTime() + SUBMIT_GRACE_MS);
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

/**
 * Autosave follows the same grace rule as submit: the final flush sent when
 * the countdown reaches zero is still accepted, so auto-grading sees it.
 */
export function canAutosaveAttempt(
  availability: ExamAvailability,
  attemptStatus: 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'EXPIRED',
  expiresAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (canModifyAttempt(availability, attemptStatus)) return true;
  return (
    attemptStatus === 'IN_PROGRESS' &&
    availability === 'EXPIRED' &&
    expiresAt !== null &&
    withinSubmitDeadline(expiresAt, now)
  );
}

/* ------------------------------------------------------------ test phases */

/**
 * Where a test is in its life, for listings and badges. Only DRAFT, PUBLISHED,
 * ENDED and ARCHIVED are stored; UPCOMING / ACTIVE / ENDED for a published
 * test are derived from its schedule, so nothing has to flip a flag on time.
 */
export type TestPhase = 'DRAFT' | 'UPCOMING' | 'ACTIVE' | 'ENDED' | 'ARCHIVED';

export function testPhase(
  exam: Pick<ExamWindow, 'status' | 'startTime' | 'endTime'>,
  now: Date = new Date(),
): TestPhase {
  if (exam.status === 'DRAFT') return 'DRAFT';
  if (exam.status === 'ARCHIVED') return 'ARCHIVED';
  if (exam.status === 'ENDED') return 'ENDED';
  if (exam.endTime && now.getTime() > exam.endTime.getTime()) return 'ENDED';
  if (exam.startTime && now.getTime() < exam.startTime.getTime()) return 'UPCOMING';
  return 'ACTIVE';
}

/** True for an IANA time zone this runtime understands ("Asia/Kolkata", "UTC"). */
export function isValidTimeZone(zone: string): boolean {
  if (!zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------- countdown display */

export type TimerPhase = 'normal' | 'low' | 'critical' | 'expired';

export const TIMER_LOW_MS = 5 * 60_000;
export const TIMER_CRITICAL_MS = 60_000;

/** Urgency of the visible countdown. Display only: the server owns the deadline. */
export function timerPhase(remainingMs: number): TimerPhase {
  if (remainingMs <= 0) return 'expired';
  if (remainingMs <= TIMER_CRITICAL_MS) return 'critical';
  if (remainingMs <= TIMER_LOW_MS) return 'low';
  return 'normal';
}

/**
 * The one-off screen-reader announcement for entering a phase. The ticking
 * clock itself is never live-announced (that would be noise every second).
 */
export function timerAnnouncement(phase: TimerPhase): string | null {
  switch (phase) {
    case 'low':
      return 'Five minutes remaining.';
    case 'critical':
      return 'One minute remaining. Your work will be submitted automatically when time runs out.';
    case 'expired':
      return "Time's up. Submitting your work.";
    default:
      return null;
  }
}
