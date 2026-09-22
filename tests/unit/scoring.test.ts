import { describe, it, expect } from 'vitest';
import { summarizeResults, pointsAwarded, aggregateAttempts, toStudentResult } from '@/lib/scoring';

const t = (passed: boolean, points: number, name = 'test') => ({ testName: name, passed, points });

describe('summarizeResults', () => {
  it('awards points only for passing tests', () => {
    const s = summarizeResults([t(true, 10), t(false, 20), t(true, 5)]);
    expect(s.score).toBe(15);
    expect(s.maxScore).toBe(35);
    expect(s.passedCount).toBe(2);
    expect(s.failedCount).toBe(1);
    expect(s.totalCount).toBe(3);
  });

  it('is all-or-nothing per test -- there is no partial credit', () => {
    expect(summarizeResults([t(false, 100)]).score).toBe(0);
    expect(summarizeResults([t(true, 100)]).score).toBe(100);
  });

  it('never divides by zero', () => {
    const s = summarizeResults([]);
    expect(s.percentage).toBe(0);
    expect(s.maxScore).toBe(0);
  });

  it('rounds the percentage to one decimal', () => {
    expect(summarizeResults([t(true, 1), t(false, 2)]).percentage).toBe(33.3);
  });

  it('treats zero-point tests as gradeable but worthless', () => {
    const s = summarizeResults([t(true, 0), t(true, 10)]);
    expect(s.score).toBe(10);
    expect(s.passedCount).toBe(2);
  });
});

describe('pointsAwarded', () => {
  it('returns the full value or nothing', () => {
    expect(pointsAwarded(t(true, 7))).toBe(7);
    expect(pointsAwarded(t(false, 7))).toBe(0);
  });
});

describe('aggregateAttempts', () => {
  it('sums stored attempt scores without re-grading', () => {
    const s = aggregateAttempts([
      { score: 30, maxScore: 40 },
      { score: 25, maxScore: 50 },
    ]);
    expect(s.score).toBe(55);
    expect(s.maxScore).toBe(90);
    expect(s.percentage).toBeCloseTo(61.1, 1);
  });
});

describe('toStudentResult', () => {
  it('projects only the student-visible fields', () => {
    const r = toStudentResult({
      testId: 'internal-id',
      testName: 'hidden check',
      passed: false,
      points: 10,
      hidden: true,
      message: 'selector .x not found',
      durationMs: 12.7,
    });
    expect(r).toEqual({
      testName: 'hidden check',
      passed: false,
      points: 10,
      pointsAwarded: 0,
      message: 'selector .x not found',
      durationMs: 13,
    });
    // The internal test id and the hidden flag are dropped here; whether the
    // message itself is shown is decided by toStudentOutcome in the attempts
    // service, which is covered in tests/unit/attempt-projection.test.ts.
    expect(Object.keys(r)).not.toContain('testId');
    expect(Object.keys(r)).not.toContain('hidden');
  });

  it('never returns a negative duration', () => {
    expect(toStudentResult({ testName: 'x', passed: true, points: 1, durationMs: -5 }).durationMs).toBe(0);
  });
});
