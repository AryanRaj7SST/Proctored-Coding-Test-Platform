import { describe, it, expect } from 'vitest';
import { MAX_STUDENT_MESSAGE, toStudentOutcome, type ExecutionOutcome } from '@/lib/outcome';

/**
 * What a student's browser learns about a run. Every test and its failure
 * message are visible; runner-internal data (errors, logs, anything else a
 * row happens to carry) never is.
 */
const outcome: ExecutionOutcome = {
  runId: 'run_1',
  status: 'COMPLETED',
  questionStatus: 'PARTIAL',
  score: 10,
  maxScore: 30,
  percentage: 33.3,
  passedCount: 1,
  failedCount: 2,
  totalCount: 3,
  durationMs: 1234,
  error: 'Error: page.goto: net::ERR_ABORTED at /app/runner/dist/executor.js:227',
  results: [
    { testName: 'button exists', passed: true, points: 10, pointsAwarded: 10, durationMs: 5 },
    {
      testName: 'gap is 25px',
      passed: false,
      points: 10,
      pointsAwarded: 0,
      durationMs: 7,
      message: 'Expected ".card" to use a 25px gap. Found: 10px.',
    },
    { testName: 'silent fail', passed: false, points: 10, pointsAwarded: 0, durationMs: 9 },
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

  it('shows every test by name', () => {
    expect(projected.results.map((r) => r.testName)).toEqual(['button exists', 'gap is 25px', 'silent fail']);
  });

  it('never attaches a message to a passing test', () => {
    expect(projected.results[0]?.message).toBeUndefined();
  });

  it('shows the failure message with expected and actual values', () => {
    expect(projected.results[1]?.message).toBe('Expected ".card" to use a 25px gap. Found: 10px.');
  });

  it('always gives a failing test something actionable to read', () => {
    expect(projected.results[2]?.message).toBe('This test did not pass.');
  });

  it('never exposes runner-internal errors, paths or unknown fields', () => {
    const leaky = {
      ...outcome,
      results: outcome.results.map((r) => ({ ...r, stack: 'at executor.ts:1', env: 'RUNNER_SECRET=x' })),
    } as ExecutionOutcome;
    const serialised = JSON.stringify(toStudentOutcome(leaky));
    expect(serialised).not.toContain('ERR_ABORTED');
    expect(serialised).not.toContain('/app/runner');
    expect(serialised).not.toContain('executor');
    expect(serialised).not.toContain('RUNNER_SECRET');
    expect(Object.keys(toStudentOutcome(leaky).results[0] ?? {}).sort()).toEqual(
      ['actual', 'durationMs', 'expected', 'message', 'passed', 'points', 'pointsAwarded', 'testName'].sort(),
    );
  });

  it('caps an oversized failure message', () => {
    const long = toStudentOutcome({
      ...outcome,
      results: [
        {
          testName: 't',
          passed: false,
          points: 1,
          pointsAwarded: 0,
          durationMs: 1,
          message: 'x'.repeat(5000),
        },
      ],
    });
    expect(long.results[0]?.message).toHaveLength(MAX_STUDENT_MESSAGE);
  });
});
