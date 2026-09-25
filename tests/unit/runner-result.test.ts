import { describe, it, expect } from 'vitest';
import { RunnerError } from '@/lib/runner-client';
import { outcomeFromError, outcomeFromResult } from '@/server/grading/runner-result';

/** B7: only a complete COMPLETED run may ever become a score. */
const ids = ['t1', 't2'];
const kind = (raw: unknown) => outcomeFromResult(raw, ids).kind;

describe('outcomeFromResult', () => {
  it('SUCCESS: a completed run with a verdict for every test (pass or fail)', () => {
    const outcome = outcomeFromResult(
      {
        status: 'COMPLETED',
        durationMs: 12,
        consoleLogs: ['[log] hi'],
        results: [
          { id: 't1', passed: true, durationMs: 3 },
          {
            id: 't2',
            passed: false,
            message: 'Expected "#out" to read "hi". Found: nothing.',
            expected: 'hi',
            actual: 'nothing',
            durationMs: 4,
          },
        ],
      },
      ids,
    );
    expect(outcome.kind).toBe('SUCCESS');
    if (outcome.kind !== 'SUCCESS') return;
    expect(outcome.verdicts.get('t1')).toEqual({
      passed: true,
      durationMs: 3,
      message: undefined,
      expected: undefined,
      actual: undefined,
    });
    expect(outcome.verdicts.get('t2')).toMatchObject({ passed: false, expected: 'hi', actual: 'nothing' });
    expect(outcome.consoleLogs).toEqual(['[log] hi']);
  });

  it('FAILED: a failed run (browser crash) even when it carries partial results', () => {
    expect(kind({ status: 'FAILED', results: [{ id: 't1', passed: true }] })).toBe('FAILED');
  });

  it('TIMEOUT: a whole-run timeout', () => {
    expect(kind({ status: 'TIMEOUT', results: [] })).toBe('TIMEOUT');
  });

  it('MALFORMED: missing body, results or status', () => {
    expect(kind(null)).toBe('MALFORMED');
    expect(kind({ status: 'COMPLETED' })).toBe('MALFORMED');
    expect(kind({ status: 'COMPLETED', results: 'nope' })).toBe('MALFORMED');
    expect(kind({ results: [] })).toBe('MALFORMED');
  });

  it('MALFORMED: partial results (a test with no verdict)', () => {
    expect(kind({ status: 'COMPLETED', results: [{ id: 't1', passed: true }] })).toBe('MALFORMED');
  });

  it('MALFORMED: a non-boolean verdict', () => {
    expect(
      kind({
        status: 'COMPLETED',
        results: [
          { id: 't1', passed: true },
          { id: 't2', passed: 'yes' },
        ],
      }),
    ).toBe('MALFORMED');
  });

  it('ignores extra results for tests that were not sent', () => {
    expect(
      kind({
        status: 'COMPLETED',
        results: [
          { id: 't1', passed: true },
          { id: 't2', passed: true },
          { id: 'zz', passed: false },
        ],
      }),
    ).toBe('SUCCESS');
  });

  it('caps runner-provided strings and drops non-strings', () => {
    const outcome = outcomeFromResult(
      {
        status: 'COMPLETED',
        results: [
          { id: 't1', passed: false, message: 'x'.repeat(5000), actual: 42 },
          { id: 't2', passed: true },
        ],
      },
      ids,
    );
    if (outcome.kind !== 'SUCCESS') throw new Error('expected success');
    expect(outcome.verdicts.get('t1')?.message).toHaveLength(1000);
    expect(outcome.verdicts.get('t1')?.actual).toBeUndefined();
  });

  it('failure outcomes carry a student-safe message and code, never the raw detail', () => {
    const outcome = outcomeFromResult(
      { status: 'FAILED', error: 'Error at /app/runner/dist/executor.js:227' },
      ids,
    );
    if (outcome.kind === 'SUCCESS') throw new Error('expected failure');
    expect(outcome.code).toBe('RUNNER_UNAVAILABLE');
    expect(outcome.message).not.toContain('/app/runner');
    expect(outcome.detail).toContain('/app/runner');
  });
});

describe('outcomeFromError', () => {
  it('maps each runner client error to an outcome', () => {
    expect(outcomeFromError(new RunnerError('TIMEOUT', 't')).kind).toBe('TIMEOUT');
    expect(outcomeFromError(new RunnerError('INVALID', 'i')).kind).toBe('MALFORMED');
    expect(outcomeFromError(new RunnerError('UNAVAILABLE', 'u')).kind).toBe('UNAVAILABLE');
    expect(outcomeFromError(new RunnerError('REJECTED', 'r')).kind).toBe('UNAVAILABLE');
    expect(outcomeFromError(new Error('ECONNREFUSED')).kind).toBe('UNAVAILABLE');
  });

  it('a busy runner is UNAVAILABLE with the BUSY code', () => {
    const outcome = outcomeFromError(new RunnerError('BUSY', 'queue full'));
    if (outcome.kind === 'SUCCESS') throw new Error('expected failure');
    expect(outcome.kind).toBe('UNAVAILABLE');
    expect(outcome.code).toBe('RUNNER_BUSY');
  });

  it('a timeout carries the RUNNER_TIMEOUT code', () => {
    const outcome = outcomeFromError(new RunnerError('TIMEOUT', 't'));
    if (outcome.kind === 'SUCCESS') throw new Error('expected failure');
    expect(outcome.code).toBe('RUNNER_TIMEOUT');
  });
});
