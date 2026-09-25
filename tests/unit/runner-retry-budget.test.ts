import { describe, it, expect, vi, afterEach } from 'vitest';
import type { RunnerRequest } from '@/lib/runner-client';
import { runOnRunner, runTimeoutFor, RunnerError } from '@/lib/runner-client';
import { logger } from '@/lib/logger';

/**
 * The retry (tests/unit/runner-client.test.ts) combined with the per-test
 * wait (runTimeoutFor): each attempt waits the full per-test budget, and the
 * retry only uses what is left of the function's time limit.
 */
process.env.RUNNER_URL = 'https://runner.example.com';
process.env.RUNNER_SECRET = 'test-secret-at-least-32-chars-long-123456';

const request = (tests: number): RunnerRequest => ({
  runId: 'budget-run',
  html: '',
  css: '',
  js: '',
  spec: {
    version: 1,
    viewport: { width: 1280, height: 720 },
    tests: Array.from({ length: tests }, (_, i) => ({
      id: `t${i}`,
      name: `T${i}`,
      points: 0,
      hidden: false,
      assertions: [],
    })) as never,
  },
});

const ok = { runId: 'budget-run', status: 'COMPLETED', results: [], durationMs: 1, consoleLogs: [] };

describe('runOnRunner timeouts with retry', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('by default each attempt waits the full per-test budget, not a shortened one', async () => {
    const timeouts: number[] = [];
    const realSetTimeout = global.setTimeout;
    vi.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      timeouts.push(ms ?? 0);
      return realSetTimeout(fn, 0); // record the delay, do not wait it out
    }) as typeof setTimeout);
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed: ECONNREFUSED');
      return { ok: true, status: 200, json: async () => ok } as Response;
    });

    await runOnRunner(request(12), undefined, 0);
    const budget = runTimeoutFor(12);
    expect(budget).toBeGreaterThan(30_000);
    // Both attempts armed their abort timer with the whole budget.
    expect(timeouts.filter((ms) => ms === budget)).toHaveLength(2);
  });

  it('skips the retry when the time limit has no room left for it', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed: ECONNREFUSED'));
    const errorSpy = vi.spyOn(logger, 'error');
    const warnSpy = vi.spyOn(logger, 'warn');

    // A backoff that would use up the whole 280 s allowance leaves no time to retry.
    await expect(runOnRunner(request(1), 5_000, 279_500)).rejects.toBeInstanceOf(RunnerError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('runner.retry_skipped', expect.anything());
    expect(warnSpy).not.toHaveBeenCalledWith('runner.retry', expect.anything());
  });
});
