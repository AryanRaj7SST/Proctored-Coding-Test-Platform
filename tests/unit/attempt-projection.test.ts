import { describe, it, expect } from 'vitest';
import { toStudentOutcome, type ExecutionOutcome } from '@/lib/outcome';

/**
 * Guards the single most security-relevant projection in the product: what a
 * student's browser is allowed to learn about the hidden test suite.
 */
const outcome: ExecutionOutcome = {
  runId: 'run_1',
  status: 'COMPLETED',
  score: 10,
  maxScore: 30,
  percentage: 33.3,
  passedCount: 1,
  failedCount: 2,
  totalCount: 3,
  durationMs: 1234,
  results: [
    { testName: 'visible pass', passed: true, points: 10, pointsAwarded: 10, durationMs: 5, hidden: false },
    {
      testName: 'hidden fail',
      passed: false,
      points: 10,
      pointsAwarded: 0,
      durationMs: 7,
      hidden: true,
      message: 'Expected .card gap to be 25px but it was 10px',
    },
    { testName: 'silent fail', passed: false, points: 10, pointsAwarded: 0, durationMs: 9, hidden: true },
  ],
};

describe('toStudentOutcome', () => {
  const projected = toStudentOutcome(outcome);

  it('keeps the score summary intact', () => {
    expect(projected.score).toBe(10);
    expect(projected.maxScore).toBe(30);
    expect(projected.passedCount).toBe(1);
    expect(projected.failedCount).toBe(2);
  });

  it('never attaches a message to a passing test', () => {
    expect(projected.results[0]?.message).toBeUndefined();
  });

  it('always gives a failing test something actionable to read', () => {
    expect(projected.results[2]?.message).toBe('This test did not pass.');
  });

  it('does not expose internal spec fields', () => {
    const serialised = JSON.stringify(projected);
    expect(serialised).not.toContain('testCode');
    expect(serialised).not.toContain('assertions');
    expect(serialised).not.toContain('selector');
  });

  it('reports the number of tests so a student can see the suite size', () => {
    expect(projected.totalCount).toBe(3);
    expect(projected.results).toHaveLength(3);
  });
});
