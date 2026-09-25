import { describe, it, expect } from 'vitest';
import {
  computeExpiry,
  msRemaining,
  sittingRemainingMs,
  isExpired,
  examAvailability,
  canModifyAttempt,
  withinSubmitDeadline,
  sittingNeedsFinalization,
  canAutosaveAttempt,
  timerPhase,
  timerAnnouncement,
  SUBMIT_GRACE_MS,
  testPhase,
  isValidTimeZone,
  type ExamWindow,
} from '@/lib/timing';

const D = (iso: string) => new Date(iso);

describe('computeExpiry', () => {
  it('adds the duration to the start time', () => {
    expect(computeExpiry(D('2026-01-01T10:00:00Z'), 60, null).toISOString()).toBe('2026-01-01T11:00:00.000Z');
  });

  it('never runs past the exam close time', () => {
    const expiry = computeExpiry(D('2026-01-01T10:00:00Z'), 120, D('2026-01-01T10:30:00Z'));
    expect(expiry.toISOString()).toBe('2026-01-01T10:30:00.000Z');
  });

  it('keeps the full duration when the window closes later', () => {
    const expiry = computeExpiry(D('2026-01-01T10:00:00Z'), 30, D('2026-01-01T23:00:00Z'));
    expect(expiry.toISOString()).toBe('2026-01-01T10:30:00.000Z');
  });
});

describe('msRemaining / isExpired', () => {
  it('clamps at zero rather than going negative', () => {
    expect(msRemaining(D('2026-01-01T10:00:00Z'), D('2026-01-01T11:00:00Z'))).toBe(0);
  });

  it('treats the exact deadline as expired', () => {
    expect(isExpired(D('2026-01-01T10:00:00Z'), D('2026-01-01T10:00:00Z'))).toBe(true);
  });
});

describe('examAvailability', () => {
  const exam: ExamWindow = {
    status: 'PUBLISHED',
    startTime: null,
    endTime: null,
    durationMinutes: 60,
  };

  it('is AVAILABLE for a published exam with no sitting yet', () => {
    expect(examAvailability(exam, null)).toBe('AVAILABLE');
  });

  it('hides DRAFT and ARCHIVED exams', () => {
    expect(examAvailability({ ...exam, status: 'DRAFT' }, null)).toBe('UNPUBLISHED');
    expect(examAvailability({ ...exam, status: 'ARCHIVED' }, null)).toBe('UNPUBLISHED');
  });

  it('respects the scheduled window', () => {
    const now = D('2026-01-01T09:00:00Z');
    expect(examAvailability({ ...exam, startTime: D('2026-01-01T10:00:00Z') }, null, { now })).toBe(
      'NOT_STARTED',
    );
    expect(examAvailability({ ...exam, endTime: D('2026-01-01T08:00:00Z') }, null, { now })).toBe('ENDED');
  });

  it('is IN_PROGRESS for a live sitting and EXPIRED once its clock runs out', () => {
    const session = {
      startedAt: D('2026-01-01T10:00:00Z'),
      expiresAt: D('2026-01-01T11:00:00Z'),
      endedAt: null,
    };
    expect(examAvailability(exam, session, { now: D('2026-01-01T10:30:00Z') })).toBe('IN_PROGRESS');
    expect(examAvailability(exam, session, { now: D('2026-01-01T11:30:00Z') })).toBe('EXPIRED');
  });

  it('reports SUBMITTED once everything is handed in, whatever the clock says', () => {
    expect(examAvailability(exam, null, { submitted: true, now: D('2026-01-01T10:00:00Z') })).toBe(
      'SUBMITTED',
    );
  });
});

describe('examAvailability: retakes (Exam.maxAttempts)', () => {
  const open: ExamWindow = {
    status: 'PUBLISHED',
    startTime: D('2026-01-01T09:00:00Z'),
    endTime: D('2026-01-01T18:00:00Z'),
    durationMinutes: 30,
  };
  const finished = {
    startedAt: D('2026-01-01T10:00:00Z'),
    expiresAt: D('2026-01-01T10:30:00Z'),
    endedAt: D('2026-01-01T10:20:00Z'),
  };
  const now = D('2026-01-01T12:00:00Z');

  it('a finished sitting with no attempts left is SUBMITTED', () => {
    expect(examAvailability(open, finished, { now, attemptsRemaining: 0 })).toBe('SUBMITTED');
    expect(examAvailability(open, finished, { now })).toBe('SUBMITTED');
  });

  it('a finished sitting with attempts left makes the test AVAILABLE again', () => {
    expect(examAvailability(open, finished, { now, attemptsRemaining: 1 })).toBe('AVAILABLE');
  });

  it('a retake still respects the window', () => {
    expect(examAvailability(open, finished, { now: D('2026-01-01T19:00:00Z'), attemptsRemaining: 1 })).toBe(
      'ENDED',
    );
    expect(examAvailability({ ...open, status: 'ENDED' }, finished, { now, attemptsRemaining: 1 })).toBe(
      'ENDED',
    );
  });

  it('attempts left never reopen an unpublished test', () => {
    expect(examAvailability({ ...open, status: 'ARCHIVED' }, finished, { now, attemptsRemaining: 3 })).toBe(
      'UNPUBLISHED',
    );
  });

  it('an open sitting is unaffected by remaining attempts', () => {
    const active = { ...finished, endedAt: null, expiresAt: D('2026-01-01T12:30:00Z') };
    expect(examAvailability(open, active, { now, attemptsRemaining: 2 })).toBe('IN_PROGRESS');
  });
});

describe('canModifyAttempt', () => {
  it('allows edits only while in progress and inside the window', () => {
    expect(canModifyAttempt('IN_PROGRESS', 'IN_PROGRESS')).toBe(true);
    expect(canModifyAttempt('AVAILABLE', 'IN_PROGRESS')).toBe(true);
  });

  it('blocks edits after submission or expiry', () => {
    expect(canModifyAttempt('IN_PROGRESS', 'SUBMITTED')).toBe(false);
    expect(canModifyAttempt('EXPIRED', 'IN_PROGRESS')).toBe(false);
    expect(canModifyAttempt('ENDED', 'IN_PROGRESS')).toBe(false);
  });
});

describe('withinSubmitDeadline', () => {
  const expiry = D('2026-01-01T11:00:00Z');

  it('accepts a submit that raced the deadline by less than the grace window', () => {
    expect(withinSubmitDeadline(expiry, new Date(expiry.getTime() + SUBMIT_GRACE_MS - 1))).toBe(true);
  });

  it('rejects a submit beyond the grace window', () => {
    expect(withinSubmitDeadline(expiry, new Date(expiry.getTime() + SUBMIT_GRACE_MS + 1))).toBe(false);
  });
});

/* ---------------------------------------------------------------- B2 */

describe('examAvailability: an expired sitting is not hidden by the exam window (B2)', () => {
  const exam: ExamWindow = {
    status: 'PUBLISHED',
    startTime: D('2026-01-01T09:00:00Z'),
    endTime: D('2026-01-01T12:00:00Z'),
    durationMinutes: 60,
  };
  const open = { startedAt: D('2026-01-01T11:30:00Z'), expiresAt: D('2026-01-01T12:00:00Z'), endedAt: null };

  it('exam active + sitting expired -> EXPIRED', () => {
    const s = { ...open, expiresAt: D('2026-01-01T11:00:00Z') };
    expect(examAvailability(exam, s, { now: D('2026-01-01T11:10:00Z') })).toBe('EXPIRED');
  });

  it('exam endTime passed while the sitting was open -> EXPIRED (so it gets finalised), not ENDED', () => {
    expect(examAvailability(exam, open, { now: D('2026-01-01T12:30:00Z') })).toBe('EXPIRED');
  });

  it('student returns after exam end with a finished sitting -> SUBMITTED', () => {
    const s = { ...open, endedAt: D('2026-01-01T11:50:00Z') };
    expect(examAvailability(exam, s, { now: D('2026-01-01T13:00:00Z') })).toBe('SUBMITTED');
  });

  it('exam ended with no sitting -> ENDED (no new attempt may start)', () => {
    expect(examAvailability(exam, null, { now: D('2026-01-01T12:30:00Z') })).toBe('ENDED');
    expect(examAvailability({ ...exam, status: 'ENDED' }, null, { now: D('2026-01-01T10:00:00Z') })).toBe(
      'ENDED',
    );
  });

  it('admin closed the exam while a sitting still had time -> ENDED', () => {
    expect(examAvailability({ ...exam, status: 'ENDED' }, open, { now: D('2026-01-01T11:40:00Z') })).toBe(
      'ENDED',
    );
  });

  it('an open sitting stays IN_PROGRESS even if startTime was later moved into the future', () => {
    expect(
      examAvailability({ ...exam, startTime: D('2026-01-01T11:45:00Z') }, open, {
        now: D('2026-01-01T11:40:00Z'),
      }),
    ).toBe('IN_PROGRESS');
  });

  it('early start is an explicit opt-in and never overrides an existing sitting', () => {
    const now = D('2026-01-01T08:00:00Z');
    expect(examAvailability(exam, null, { now })).toBe('NOT_STARTED');
    expect(examAvailability(exam, null, { now, allowEarlyStart: true })).toBe('AVAILABLE');
    const expired = { ...open, expiresAt: D('2026-01-01T07:59:00Z') };
    expect(examAvailability(exam, expired, { now, allowEarlyStart: true })).toBe('EXPIRED');
  });
});

describe('sittingNeedsFinalization', () => {
  const exam: ExamWindow = { status: 'PUBLISHED', startTime: null, endTime: null, durationMinutes: 60 };
  const s = { startedAt: D('2026-01-01T10:00:00Z'), expiresAt: D('2026-01-01T11:00:00Z'), endedAt: null };
  const at = (ms: number) => new Date(s.expiresAt.getTime() + ms);

  it('waits out the grace window so the final autosave lands first', () => {
    expect(sittingNeedsFinalization(exam, s, at(-1))).toBe(false);
    expect(sittingNeedsFinalization(exam, s, at(SUBMIT_GRACE_MS - 1))).toBe(false);
    expect(sittingNeedsFinalization(exam, s, at(SUBMIT_GRACE_MS))).toBe(true);
  });

  it('is immediate when an administrator ended the exam', () => {
    expect(sittingNeedsFinalization({ ...exam, status: 'ENDED' }, s, at(-30 * 60_000))).toBe(true);
  });

  it('covers an exam whose endTime passed before the sitting expiry', () => {
    const shortened = { ...exam, endTime: D('2026-01-01T10:30:00Z') };
    expect(sittingNeedsFinalization(shortened, s, D('2026-01-01T10:31:00Z'))).toBe(true);
  });

  it('never re-finalises a closed sitting, and ignores students with no sitting', () => {
    expect(sittingNeedsFinalization(exam, { ...s, endedAt: at(0) }, at(60_000))).toBe(false);
    expect(sittingNeedsFinalization(exam, null, at(60_000))).toBe(false);
  });
});

describe('canAutosaveAttempt', () => {
  const expiresAt = D('2026-01-01T11:00:00Z');
  it('accepts the final flush inside the grace window only', () => {
    expect(
      canAutosaveAttempt('EXPIRED', 'IN_PROGRESS', expiresAt, new Date(expiresAt.getTime() + 1000)),
    ).toBe(true);
    expect(
      canAutosaveAttempt(
        'EXPIRED',
        'IN_PROGRESS',
        expiresAt,
        new Date(expiresAt.getTime() + SUBMIT_GRACE_MS + 1),
      ),
    ).toBe(false);
  });
  it('never reopens a submitted attempt or a closed exam', () => {
    expect(canAutosaveAttempt('EXPIRED', 'AUTO_SUBMITTED', expiresAt, expiresAt)).toBe(false);
    expect(canAutosaveAttempt('ENDED', 'IN_PROGRESS', expiresAt, expiresAt)).toBe(false);
  });
});

describe('timerPhase / timerAnnouncement (B13)', () => {
  it('maps remaining time to an urgency phase', () => {
    expect(timerPhase(30 * 60_000)).toBe('normal');
    expect(timerPhase(5 * 60_000)).toBe('low');
    expect(timerPhase(60_000)).toBe('critical');
    expect(timerPhase(1)).toBe('critical');
    expect(timerPhase(0)).toBe('expired');
  });

  it('announces each threshold once in words (not only by colour)', () => {
    expect(timerAnnouncement('normal')).toBeNull();
    expect(timerAnnouncement('low')).toMatch(/five minutes/i);
    expect(timerAnnouncement('critical')).toMatch(/one minute/i);
    expect(timerAnnouncement('expired')).toMatch(/time's up/i);
  });
});

describe('testPhase', () => {
  const at = D('2026-09-25T10:00:00Z');
  const t = (status: ExamWindow['status'], start: string | null, end: string | null) => ({
    status,
    startTime: start ? D(start) : null,
    endTime: end ? D(end) : null,
  });

  it('stored lifecycle states win', () => {
    expect(testPhase(t('DRAFT', null, null), at)).toBe('DRAFT');
    expect(testPhase(t('ARCHIVED', null, null), at)).toBe('ARCHIVED');
    expect(testPhase(t('ENDED', '2026-09-25T09:00:00Z', '2026-09-26T00:00:00Z'), at)).toBe('ENDED');
  });

  it('a published test is upcoming, active or ended by its schedule', () => {
    expect(testPhase(t('PUBLISHED', '2026-09-25T11:00:00Z', '2026-09-25T12:00:00Z'), at)).toBe('UPCOMING');
    expect(testPhase(t('PUBLISHED', '2026-09-25T09:00:00Z', '2026-09-25T12:00:00Z'), at)).toBe('ACTIVE');
    expect(testPhase(t('PUBLISHED', '2026-09-25T08:00:00Z', '2026-09-25T09:00:00Z'), at)).toBe('ENDED');
    expect(testPhase(t('PUBLISHED', null, null), at)).toBe('ACTIVE');
  });

  it('the exact start instant is active; the exact end instant is still active', () => {
    expect(testPhase(t('PUBLISHED', '2026-09-25T10:00:00Z', null), at)).toBe('ACTIVE');
    expect(testPhase(t('PUBLISHED', null, '2026-09-25T10:00:00Z'), at)).toBe('ACTIVE');
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones and UTC', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('x'.repeat(100))).toBe(false);
  });
});

describe('sittingRemainingMs (live monitor)', () => {
  const now = new Date('2026-09-25T10:00:00Z');
  const expiresAt = new Date('2026-09-25T10:20:00Z');

  it('an open sitting shows the time left on the server clock', () => {
    expect(sittingRemainingMs({ expiresAt, endedAt: null }, now)).toBe(20 * 60_000);
    expect(sittingRemainingMs({ expiresAt: new Date('2026-09-25T09:59:00Z'), endedAt: null }, now)).toBe(0);
  });

  it('an ended sitting has no remaining time, even if its deadline is still ahead', () => {
    expect(sittingRemainingMs({ expiresAt, endedAt: new Date('2026-09-25T09:55:00Z') }, now)).toBeNull();
  });
});
