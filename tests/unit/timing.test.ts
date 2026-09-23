import { describe, it, expect } from 'vitest';
import {
  computeExpiry,
  msRemaining,
  isExpired,
  examAvailability,
  canModifyAttempt,
  withinSubmitDeadline,
  SUBMIT_GRACE_MS,
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
