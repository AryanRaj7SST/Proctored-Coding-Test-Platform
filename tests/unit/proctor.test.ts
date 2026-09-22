import { describe, it, expect } from 'vitest';
import {
  shouldRecordEvent,
  dedupeFamily,
  countViolations,
  deriveSessionStatus,
  isViolation,
  violationMessage,
  DEDUPE_WINDOW_MS,
  VIOLATION_TYPES,
  INFO_TYPES,
} from '@/lib/proctor';

const at = (ms: number) => new Date(1_700_000_000_000 + ms);

describe('event classification', () => {
  it('separates violations from informational events', () => {
    for (const t of VIOLATION_TYPES) expect(isViolation(t)).toBe(true);
    for (const t of INFO_TYPES) expect(isViolation(t)).toBe(false);
  });

  it('never classifies returning to the window as a violation', () => {
    expect(isViolation('WINDOW_FOCUS')).toBe(false);
    expect(isViolation('EXAM_STARTED')).toBe(false);
  });
});

describe('shouldRecordEvent', () => {
  it('accepts the first event of a family', () => {
    expect(shouldRecordEvent({ type: 'TAB_HIDDEN', occurredAt: at(0) }, null).accept).toBe(true);
  });

  it('collapses the blur + visibilitychange pair one tab switch produces', () => {
    const decision = shouldRecordEvent(
      { type: 'WINDOW_BLUR', occurredAt: at(80) },
      { type: 'TAB_HIDDEN', occurredAt: at(0) },
    );
    expect(decision.accept).toBe(false);
    expect(decision.reason).toBe('duplicate-leave');
  });

  it('collapses repeats of the same type inside the window', () => {
    const decision = shouldRecordEvent({ type: 'COPY', occurredAt: at(200) }, { type: 'COPY', occurredAt: at(0) });
    expect(decision.accept).toBe(false);
    expect(decision.reason).toBe('duplicate-same-type');
  });

  it('counts a genuine second tab switch after the window', () => {
    const decision = shouldRecordEvent(
      { type: 'TAB_HIDDEN', occurredAt: at(DEDUPE_WINDOW_MS + 1) },
      { type: 'WINDOW_BLUR', occurredAt: at(0) },
    );
    expect(decision.accept).toBe(true);
  });

  it('does not collapse different families that merely happen together', () => {
    expect(
      shouldRecordEvent({ type: 'PASTE', occurredAt: at(10) }, { type: 'COPY', occurredAt: at(0) }).accept,
    ).toBe(true);
  });

  it('accepts an event whose clock went backwards rather than silently dropping it', () => {
    // Client timestamps are advisory; the server stamps its own time, but the
    // guard must not swallow events if the delta is ever negative.
    expect(
      shouldRecordEvent({ type: 'TAB_HIDDEN', occurredAt: at(-500) }, { type: 'TAB_HIDDEN', occurredAt: at(0) })
        .accept,
    ).toBe(true);
  });
});

describe('dedupeFamily', () => {
  it('looks up both leave events together', () => {
    expect(dedupeFamily('TAB_HIDDEN').sort()).toEqual(['TAB_HIDDEN', 'WINDOW_BLUR']);
    expect(dedupeFamily('WINDOW_BLUR').sort()).toEqual(['TAB_HIDDEN', 'WINDOW_BLUR']);
  });

  it('keeps other types isolated', () => {
    expect(dedupeFamily('PASTE')).toEqual(['PASTE']);
  });
});

describe('countViolations', () => {
  it('counts only violation types', () => {
    expect(
      countViolations([
        { type: 'TAB_HIDDEN' },
        { type: 'WINDOW_FOCUS' },
        { type: 'PASTE' },
        { type: 'EXAM_STARTED' },
      ]),
    ).toBe(2);
  });
});

describe('deriveSessionStatus', () => {
  const base = { lastHeartbeat: at(0), expiresAt: at(60_000), endedAt: null };

  it('is ACTIVE while heartbeats arrive', () => {
    expect(deriveSessionStatus(base, at(5_000), 45)).toBe('ACTIVE');
  });

  it('is AWAY when the last event was a leave', () => {
    expect(deriveSessionStatus({ ...base, lastEventType: 'TAB_HIDDEN' }, at(5_000), 45)).toBe('AWAY');
  });

  it('is DISCONNECTED once heartbeats stop', () => {
    expect(deriveSessionStatus(base, at(50_000), 45)).toBe('DISCONNECTED');
  });

  it('prefers EXPIRED over DISCONNECTED once the deadline passes', () => {
    expect(deriveSessionStatus(base, at(120_000), 45)).toBe('EXPIRED');
  });

  it('reports SUBMITTED for an ended session regardless of the clock', () => {
    expect(deriveSessionStatus({ ...base, endedAt: at(10_000) }, at(999_999), 45)).toBe('SUBMITTED');
  });
});

describe('violationMessage', () => {
  it('has student-facing copy for every violation type', () => {
    for (const t of VIOLATION_TYPES) {
      const message = violationMessage(t);
      expect(message.length).toBeGreaterThan(10);
      // Never leak internals into a student-facing string.
      expect(message).not.toMatch(/undefined|null|Error|stack/i);
    }
  });
});
