import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as gradeAttemptModule from '@/server/grading/grade-attempt';
import { gradeAttemptWithRetry, FINALIZATION_MAX_RETRIES } from '@/server/services/finalization';

describe('finalization bounded retry on runner queue saturation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('retries with jittered backoff when queue is full and succeeds once queue clears', async () => {
    let callCount = 0;
    const gradeSpy = vi.spyOn(gradeAttemptModule, 'gradeAttempt').mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        // First attempt: runner queue is full (429 BUSY)
        return { graded: false, error: 'The test runner is busy right now.' };
      }
      // Second attempt: queue has cleared, grading succeeds
      return { graded: true };
    });

    const res = await gradeAttemptWithRetry('attempt-1', { reason: 'auto-submit' }, 3, 5, 5);

    expect(res).toEqual({ graded: true });
    expect(callCount).toBe(2);
    expect(gradeSpy).toHaveBeenCalledTimes(2);
    expect(gradeSpy).toHaveBeenCalledWith('attempt-1', { reason: 'auto-submit' });
  });

  it('stops after max retries when runner queue stays full without marking attempt as 0 or throwing', async () => {
    let callCount = 0;
    const gradeSpy = vi.spyOn(gradeAttemptModule, 'gradeAttempt').mockImplementation(async () => {
      callCount += 1;
      return { graded: false, error: 'Runner queue is full.' };
    });

    // 2 retries configured -> 1 initial + 2 retries = 3 calls
    const res = await gradeAttemptWithRetry('attempt-full', { reason: 'auto-submit' }, 2, 5, 5);

    expect(res.graded).toBe(false);
    expect(res.error).toBe('Runner queue is full.');
    expect(callCount).toBe(3); // 1 initial + 2 retries
    expect(gradeSpy).toHaveBeenCalledTimes(3);
  });

  it('does not retry if another worker is already busy grading the attempt', async () => {
    const gradeSpy = vi.spyOn(gradeAttemptModule, 'gradeAttempt').mockResolvedValue({
      graded: false,
      busy: true,
      error: 'This attempt is already being graded.',
    });

    const res = await gradeAttemptWithRetry('attempt-locked', { reason: 'auto-submit' }, 3, 5, 5);

    expect(res.graded).toBe(false);
    expect(res.busy).toBe(true);
    expect(gradeSpy).toHaveBeenCalledTimes(1);
  });

  it('uses default FINALIZATION_MAX_RETRIES when not explicitly overridden', async () => {
    let callCount = 0;
    vi.spyOn(gradeAttemptModule, 'gradeAttempt').mockImplementation(async () => {
      callCount += 1;
      return { graded: false, error: 'BUSY' };
    });

    const res = await gradeAttemptWithRetry('attempt-default', {}, undefined, 1, 1);

    expect(res.graded).toBe(false);
    expect(callCount).toBe(FINALIZATION_MAX_RETRIES + 1); // 1 initial + 3 retries = 4
  });
});
