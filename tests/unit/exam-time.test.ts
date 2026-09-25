import { describe, it, expect } from 'vitest';
import {
  describeTimeZone,
  examValuesFrom,
  isoToZonedInput,
  windowFieldPayload,
  zonedInputToIso,
} from '@/components/admin/exam-types';

/**
 * A1 regression: editing an exam must never move its window.
 *
 * Before the fix the server built the datetime-local string in ITS zone and the
 * browser re-read it in the admin's zone, so every save shifted the window by
 * the offset (IST admin + UTC server: -5h30 per save), and seconds were lost.
 */

const IST = 'Asia/Kolkata';
const UTC = 'UTC';
const NY = 'America/New_York';

const stored = {
  id: 'exam-1',
  title: 'Mid term',
  description: null,
  durationMinutes: 60,
  startTime: new Date('2026-10-01T11:00:32.288Z'), // seconds on purpose (seed data has them)
  endTime: new Date('2026-10-01T13:30:00.000Z'),
  status: 'PUBLISHED',
  batch: null,
  maxViolations: 0,
  shuffleQuestions: false,
  questionIds: [],
};

/** Run `fn` with the process time zone set to `tz`, then restore it. */
function withProcessTz<T>(tz: string, fn: () => T): T {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

describe('examValuesFrom keeps the stored instant (no server-zone conversion)', () => {
  it('returns identical values whatever time zone the server runs in', () => {
    const onUtcServer = withProcessTz('UTC', () => examValuesFrom(stored));
    const onIstServer = withProcessTz('Asia/Kolkata', () => examValuesFrom(stored));
    expect(onUtcServer.startTime).toBe('2026-10-01T11:00:32.288Z');
    expect(onIstServer).toEqual(onUtcServer);
  });
});

describe('window field conversion in an explicit time zone', () => {
  it('create exam: IST wall time 16:30 is stored as 11:00Z', () => {
    expect(zonedInputToIso('2026-10-01T16:30', IST)).toBe('2026-10-01T11:00:00.000Z');
    expect(zonedInputToIso('2026-10-01T16:30', UTC)).toBe('2026-10-01T16:30:00.000Z');
  });

  it('IST browser vs UTC server: the admin sees their own wall time', () => {
    withProcessTz('UTC', () => {
      // the machine zone is irrelevant
      expect(isoToZonedInput('2026-10-01T11:00:32.288Z', IST)).toBe('2026-10-01T16:30');
      expect(isoToZonedInput('2026-10-01T11:00:32.288Z', UTC)).toBe('2026-10-01T11:00');
    });
  });

  it('edit without changing the time sends the original instant byte for byte', () => {
    const values = examValuesFrom(stored);
    expect(windowFieldPayload(values.startTime, null, IST)).toBe('2026-10-01T11:00:32.288Z');
    expect(windowFieldPayload(values.endTime, null, IST)).toBe('2026-10-01T13:30:00.000Z');
  });

  it('save repeatedly (e.g. only the title changed): the window never moves', () => {
    let start = examValuesFrom(stored).startTime;
    for (let i = 0; i < 10; i += 1) start = windowFieldPayload(start, null, IST) ?? '';
    expect(start).toBe(stored.startTime.toISOString());
  });

  it('display -> re-enter the same wall time is a stable round trip', () => {
    const iso = '2026-10-01T11:00:00.000Z';
    let current = iso;
    for (let i = 0; i < 5; i += 1) current = zonedInputToIso(isoToZonedInput(current, IST), IST);
    expect(current).toBe(iso);
  });

  it('edit start time / end time: only the edited field changes', () => {
    const values = examValuesFrom(stored);
    expect(windowFieldPayload(values.startTime, '2026-10-01T17:00', IST)).toBe('2026-10-01T11:30:00.000Z');
    expect(windowFieldPayload(values.endTime, null, IST)).toBe('2026-10-01T13:30:00.000Z');
    expect(windowFieldPayload(values.endTime, '2026-10-01T20:15', IST)).toBe('2026-10-01T14:45:00.000Z');
  });

  it('clearing a field removes the window bound', () => {
    expect(windowFieldPayload('2026-10-01T11:00:00.000Z', '', IST)).toBeNull();
    expect(windowFieldPayload('', null, IST)).toBeNull();
  });

  it('handles daylight-saving zones on both sides of the change', () => {
    expect(zonedInputToIso('2026-03-07T09:00', NY)).toBe('2026-03-07T14:00:00.000Z'); // EST
    expect(zonedInputToIso('2026-03-09T09:00', NY)).toBe('2026-03-09T13:00:00.000Z'); // EDT
    expect(isoToZonedInput('2026-03-09T13:00:00.000Z', NY)).toBe('2026-03-09T09:00');
  });

  it('rejects malformed input instead of guessing', () => {
    expect(zonedInputToIso('01/10/2026 16:30', IST)).toBe('');
    expect(isoToZonedInput('not a date', IST)).toBe('');
  });

  it('describes the zone explicitly for the form label', () => {
    expect(describeTimeZone(IST)).toBe('Asia/Kolkata (UTC+05:30)');
    expect(describeTimeZone(UTC)).toBe('UTC (UTC+00:00)');
  });
});
