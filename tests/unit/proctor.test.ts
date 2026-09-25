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
  isClipboardExempt,
  isExamPageReload,
  claimReloadReport,
  clipboardShortcut,
  cameraStateFromEvents,
  eventLabel,
  CAMERA_TYPES,
  type ProctorEventType,
} from '@/lib/proctor';
import { proctorEventInput } from '@/lib/validation';

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
    const decision = shouldRecordEvent(
      { type: 'COPY', occurredAt: at(200) },
      { type: 'COPY', occurredAt: at(0) },
    );
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
      shouldRecordEvent(
        { type: 'TAB_HIDDEN', occurredAt: at(-500) },
        { type: 'TAB_HIDDEN', occurredAt: at(0) },
      ).accept,
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

describe('isClipboardExempt (accommodation replaces the hard-coded email bypass)', () => {
  it('exempts nobody by default', () => {
    for (const t of ['COPY', 'CUT', 'PASTE'] as const) {
      expect(isClipboardExempt(t, { allowClipboard: false })).toBe(false);
    }
  });

  it('with the accommodation, exempts clipboard events only', () => {
    for (const t of ['COPY', 'CUT', 'PASTE'] as const) {
      expect(isClipboardExempt(t, { allowClipboard: true })).toBe(true);
    }
    for (const t of [
      'TAB_HIDDEN',
      'WINDOW_BLUR',
      'FULLSCREEN_EXIT',
      'PAGE_RELOAD',
      'HEARTBEAT_LOST',
    ] as const) {
      expect(isClipboardExempt(t, { allowClipboard: true })).toBe(false);
    }
  });
});

describe('page reload detection (B5)', () => {
  const exam = 'https://app.test/exam/exam-1';

  it('reports a reload of the exam page itself', () => {
    expect(isExamPageReload({ type: 'reload', name: exam }, exam)).toBe(true);
    expect(isExamPageReload({ type: 'reload', name: `${exam}?q=2` }, exam)).toBe(true);
  });

  it('ignores normal navigations and a dashboard reload followed by client-side navigation', () => {
    expect(isExamPageReload({ type: 'navigate', name: exam }, exam)).toBe(false);
    expect(isExamPageReload({ type: 'reload', name: 'https://app.test/dashboard' }, exam)).toBe(false);
  });

  it('falls back to the legacy navigation API when Navigation Timing is unavailable', () => {
    expect(isExamPageReload(undefined, exam, 1)).toBe(true);
    expect(isExamPageReload(undefined, exam, 0)).toBe(false);
  });

  it('reports once per exam per document, however many times the check re-runs (question switches)', () => {
    const entry = { type: 'reload', name: exam };
    const reports = [0, 1, 2, 3, 4].filter(
      () => isExamPageReload(entry, exam) && claimReloadReport('exam-b5'),
    ).length;
    expect(reports).toBe(1);
    expect(claimReloadReport('another-exam')).toBe(true);
  });
});

describe('clipboard shortcuts are recognised, ordinary typing is not', () => {
  const key = (
    k: string,
    mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {},
  ) => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });
  it('Ctrl/Cmd + C, X, V (and with Shift)', () => {
    expect(clipboardShortcut(key('c', { ctrlKey: true }))).toBe('COPY');
    expect(clipboardShortcut(key('C', { metaKey: true }))).toBe('COPY');
    expect(clipboardShortcut(key('x', { metaKey: true }))).toBe('CUT');
    expect(clipboardShortcut(key('v', { ctrlKey: true }))).toBe('PASTE');
    expect(clipboardShortcut(key('V', { ctrlKey: true, shiftKey: true }))).toBe('PASTE');
  });
  it('the legacy Insert/Delete bindings', () => {
    expect(clipboardShortcut(key('Insert', { ctrlKey: true }))).toBe('COPY');
    expect(clipboardShortcut(key('Insert', { shiftKey: true }))).toBe('PASTE');
    expect(clipboardShortcut(key('Delete', { shiftKey: true }))).toBe('CUT');
  });
  it('typing, undo, select-all, save and AltGr combinations are untouched', () => {
    for (const k of [
      key('c'),
      key('v'),
      key('C', { shiftKey: true }),
      key('z', { ctrlKey: true }),
      key('a', { metaKey: true }),
      key('s', { metaKey: true }),
      key('Delete'),
      key('v', { ctrlKey: true, altKey: true }),
    ]) {
      expect(clipboardShortcut(k)).toBeNull();
    }
  });
});

describe('camera events', () => {
  it('only a camera stopping mid-test is a violation', () => {
    expect(isViolation('CAMERA_STREAM_STOPPED')).toBe(true);
    for (const t of [
      'CAMERA_PERMISSION_GRANTED',
      'CAMERA_PERMISSION_DENIED',
      'CAMERA_UNAVAILABLE',
      'CAMERA_RESTORED',
    ] as const) {
      expect(isViolation(t)).toBe(false);
    }
    expect(violationMessage('CAMERA_STREAM_STOPPED')).toMatch(
      /Camera access is required while taking this test/,
    );
  });

  it('the newest camera event decides what the live monitor shows', () => {
    expect(cameraStateFromEvents([])).toBeNull();
    expect(cameraStateFromEvents([{ type: 'TAB_HIDDEN' }])).toBeNull();
    expect(cameraStateFromEvents([{ type: 'CAMERA_PERMISSION_GRANTED' }])).toBe('ON');
    expect(
      cameraStateFromEvents([{ type: 'CAMERA_STREAM_STOPPED' }, { type: 'CAMERA_PERMISSION_GRANTED' }]),
    ).toBe('OFF');
    expect(
      cameraStateFromEvents([
        { type: 'COPY' },
        { type: 'CAMERA_RESTORED' },
        { type: 'CAMERA_STREAM_STOPPED' },
      ]),
    ).toBe('ON');
  });

  it('every event type has a readable label for administrators', () => {
    for (const t of [...VIOLATION_TYPES, ...INFO_TYPES]) {
      expect(eventLabel(t)).not.toMatch(/_/);
    }
    expect(eventLabel('CAMERA_PERMISSION_GRANTED')).toBe('Camera enabled');
    expect(eventLabel('FULLSCREEN_EXIT')).toBe('Fullscreen exited');
    expect(eventLabel('PASTE')).toBe('Paste blocked');
  });

  it('the proctor API accepts the camera facts, but never server-only events', () => {
    const base = { examId: 'c0000000000000000000000000' };
    for (const type of CAMERA_TYPES)
      expect(proctorEventInput.safeParse({ ...base, type }).success).toBe(true);
    for (const type of ['EXAM_STARTED', 'EXAM_SUBMITTED']) {
      expect(proctorEventInput.safeParse({ ...base, type }).success).toBe(false);
    }
  });
});

describe('one browser action is one event', () => {
  const at = (ms: number) => new Date(1_700_000_000_000 + ms);
  it('a tab switch (visibilitychange + blur together) is one violation', () => {
    expect(
      shouldRecordEvent(
        { type: 'WINDOW_BLUR', occurredAt: at(40) },
        { type: 'TAB_HIDDEN', occurredAt: at(0) },
      ),
    ).toEqual({
      accept: false,
      reason: 'duplicate-leave',
    });
  });
  it('a repeated camera report inside the window is dropped; a later one is kept', () => {
    const stopped = { type: 'CAMERA_STREAM_STOPPED' as ProctorEventType, occurredAt: at(0) };
    expect(shouldRecordEvent({ ...stopped, occurredAt: at(300) }, stopped).accept).toBe(false);
    expect(shouldRecordEvent({ ...stopped, occurredAt: at(DEDUPE_WINDOW_MS + 1) }, stopped).accept).toBe(
      true,
    );
    expect(shouldRecordEvent({ type: 'CAMERA_RESTORED', occurredAt: at(300) }, stopped).accept).toBe(true);
  });
  it('the camera is not in the tab/window leave family', () => {
    expect(dedupeFamily('CAMERA_STREAM_STOPPED')).toEqual(['CAMERA_STREAM_STOPPED']);
  });
});
