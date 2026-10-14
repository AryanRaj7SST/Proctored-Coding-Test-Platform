import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RunnerRequest } from '@/lib/runner-client';
import { runOnRunner, runnerPoolHealth, runnerHealth, RunnerError } from '@/lib/runner-client';
import { logger } from '@/lib/logger';

const dummyRequest: RunnerRequest = {
  runId: 'test-run-pool-123',
  html: '<div>Hello Pool</div>',
  css: 'div { color: blue; }',
  js: '',
  spec: {
    version: 1,
    viewport: { width: 1280, height: 720 },
    tests: [],
  },
};

const dummySuccessResponse = {
  runId: 'test-run-pool-123',
  status: 'COMPLETED',
  results: [{ id: 't1', testName: 'Test 1', passed: true, durationMs: 10 }],
  durationMs: 40,
  consoleLogs: [],
};

describe('Runner Pool (multi-runner)', () => {
  const originalFetch = global.fetch;
  const originalEnvRunnerUrls = process.env.RUNNER_URLS;
  const originalEnvRunnerUrl = process.env.RUNNER_URL;
  const originalEnvSecret = process.env.RUNNER_SECRET;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.RUNNER_SECRET = 'test-secret-at-least-32-chars-long-123456';
    delete process.env.RUNNER_URLS;
    process.env.RUNNER_URL = 'https://runner-default.example.com';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnvRunnerUrls !== undefined) {
      process.env.RUNNER_URLS = originalEnvRunnerUrls;
    } else {
      delete process.env.RUNNER_URLS;
    }
    if (originalEnvRunnerUrl !== undefined) {
      process.env.RUNNER_URL = originalEnvRunnerUrl;
    } else {
      delete process.env.RUNNER_URL;
    }
    if (originalEnvSecret !== undefined) {
      process.env.RUNNER_SECRET = originalEnvSecret;
    } else {
      delete process.env.RUNNER_SECRET;
    }
  });

  it('all healthy: calls the first selected runner and succeeds without failover', async () => {
    process.env.RUNNER_URLS = 'https://r1.example.com, https://r2.example.com';
    vi.spyOn(Math, 'random').mockReturnValue(0); // starts with r1

    const calledUrls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      calledUrls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => dummySuccessResponse,
      };
    });

    const warnSpy = vi.spyOn(logger, 'warn');
    const result = await runOnRunner(dummyRequest, 5000, 0);

    expect(result.status).toBe('COMPLETED');
    expect(calledUrls).toHaveLength(1);
    expect(calledUrls[0]).toContain('r1.example.com');
    expect(warnSpy).not.toHaveBeenCalledWith('runner.failover', expect.anything());
  });

  it('one down (connect error): fails over to second runner and succeeds', async () => {
    process.env.RUNNER_URLS = 'https://r1.example.com, https://r2.example.com';
    vi.spyOn(Math, 'random').mockReturnValue(0); // starts with r1

    const calledUrls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      calledUrls.push(url);
      if (url.includes('r1.example.com')) {
        throw new TypeError('fetch failed: ECONNREFUSED');
      }
      return {
        ok: true,
        status: 200,
        json: async () => dummySuccessResponse,
      };
    });

    const warnSpy = vi.spyOn(logger, 'warn');
    const result = await runOnRunner(dummyRequest, 5000, 0);

    expect(result.status).toBe('COMPLETED');
    expect(calledUrls.length).toBeGreaterThanOrEqual(2);
    expect(calledUrls.some((u) => u.includes('r1.example.com'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('r2.example.com'))).toBe(true);

    expect(warnSpy).toHaveBeenCalledWith('runner.failover', {
      runId: dummyRequest.runId,
      host: 'r1.example.com',
      reason: 'fetch failed: ECONNREFUSED',
    });
  });

  it('one busy (429): fails over to second runner and succeeds', async () => {
    process.env.RUNNER_URLS = 'https://r1.example.com, https://r2.example.com';
    vi.spyOn(Math, 'random').mockReturnValue(0); // starts with r1

    const calledUrls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      calledUrls.push(url);
      if (url.includes('r1.example.com')) {
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: 'queue full' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => dummySuccessResponse,
      };
    });

    const warnSpy = vi.spyOn(logger, 'warn');
    const result = await runOnRunner(dummyRequest, 5000, 0);

    expect(result.status).toBe('COMPLETED');
    expect(calledUrls.some((u) => u.includes('r1.example.com'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('r2.example.com'))).toBe(true);

    expect(warnSpy).toHaveBeenCalledWith('runner.failover', {
      runId: dummyRequest.runId,
      host: 'r1.example.com',
      reason: '429',
    });
  });

  it('all busy: ends as BUSY without outer retry', async () => {
    process.env.RUNNER_URLS = 'https://r1.example.com, https://r2.example.com';
    vi.spyOn(Math, 'random').mockReturnValue(0);

    let fetchCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return {
        ok: false,
        status: 429,
        json: async () => ({ error: 'busy' }),
      };
    });

    const warnSpy = vi.spyOn(logger, 'warn');
    await expect(runOnRunner(dummyRequest, 5000, 0)).rejects.toMatchObject({
      name: 'RunnerError',
      code: 'BUSY',
    });

    // 2 runners tried in 1 attempt; no outer retry on BUSY
    expect(fetchCount).toBe(2);
    // warn was logged for the failover from r1 to r2
    expect(warnSpy).toHaveBeenCalledWith('runner.failover', {
      runId: dummyRequest.runId,
      host: 'r1.example.com',
      reason: '429',
    });
    // No runner.retry since BUSY is an HttpResponseError
    expect(warnSpy).not.toHaveBeenCalledWith('runner.retry', expect.anything());
  });

  it('mixed 429 + network error: ends as BUSY without outer retry', async () => {
    process.env.RUNNER_URLS = 'https://r1.example.com, https://r2.example.com';
    vi.spyOn(Math, 'random').mockReturnValue(0); // r1 then r2

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('r1.example.com')) {
        throw new TypeError('fetch failed');
      }
      return {
        ok: false,
        status: 429,
        json: async () => ({ error: 'queue full' }),
      };
    });

    const warnSpy = vi.spyOn(logger, 'warn');
    await expect(runOnRunner(dummyRequest, 5000, 0)).rejects.toMatchObject({
      name: 'RunnerError',
      code: 'BUSY',
    });

    // No outer retry because any runner returned 429
    expect(warnSpy).not.toHaveBeenCalledWith('runner.retry', expect.anything());
  });

  it('timeout does not try a second runner', async () => {
    process.env.RUNNER_URLS = 'https://r1.example.com, https://r2.example.com';
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const calledUrls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      calledUrls.push(url);
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });

    const warnSpy = vi.spyOn(logger, 'warn');
    // We expect outer retry for AbortError, so attempt 1 calls r1, attempt 2 calls r1 or r2.
    // BUT within attempt 1, it must abort immediately and NOT try r2 within that attempt!
    await expect(runOnRunner(dummyRequest, 5000, 0)).rejects.toMatchObject({
      name: 'RunnerError',
      code: 'TIMEOUT',
    });

    // None of the attempts should have failed over within the attempt (no runner.failover log)
    expect(warnSpy).not.toHaveBeenCalledWith('runner.failover', expect.anything());
    // Outer retry did happen (attempt 1 and 2)
    expect(warnSpy).toHaveBeenCalledWith('runner.retry', expect.objectContaining({ attempt: 1 }));
  });

  it('503 fails over to next runner and succeeds', async () => {
    process.env.RUNNER_URLS = 'https://r1.example.com, https://r2.example.com';
    vi.spyOn(Math, 'random').mockReturnValue(0);

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('r1.example.com')) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: 'Service Unavailable' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => dummySuccessResponse,
      };
    });

    const warnSpy = vi.spyOn(logger, 'warn');
    const result = await runOnRunner(dummyRequest, 5000, 0);

    expect(result.status).toBe('COMPLETED');
    expect(warnSpy).toHaveBeenCalledWith('runner.failover', {
      runId: dummyRequest.runId,
      host: 'r1.example.com',
      reason: '503',
    });
  });

  it('400 Bad Request does not fail over (surfaces INVALID immediately)', async () => {
    process.env.RUNNER_URLS = 'https://r1.example.com, https://r2.example.com';
    vi.spyOn(Math, 'random').mockReturnValue(0);

    let fetchCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: 'Bad Request' }),
      };
    });

    const warnSpy = vi.spyOn(logger, 'warn');
    await expect(runOnRunner(dummyRequest, 5000, 0)).rejects.toMatchObject({
      name: 'RunnerError',
      code: 'INVALID',
    });

    expect(fetchCount).toBe(1);
    expect(warnSpy).not.toHaveBeenCalledWith('runner.failover', expect.anything());
  });

  it('401 Unauthorized does not fail over (surfaces REJECTED immediately)', async () => {
    process.env.RUNNER_URLS = 'https://r1.example.com, https://r2.example.com';
    vi.spyOn(Math, 'random').mockReturnValue(0);

    let fetchCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      };
    });

    const warnSpy = vi.spyOn(logger, 'warn');
    await expect(runOnRunner(dummyRequest, 5000, 0)).rejects.toMatchObject({
      name: 'RunnerError',
      code: 'REJECTED',
    });

    expect(fetchCount).toBe(1);
    expect(warnSpy).not.toHaveBeenCalledWith('runner.failover', expect.anything());
  });

  it('single RUNNER_URL unchanged behavior', async () => {
    delete process.env.RUNNER_URLS;
    process.env.RUNNER_URL = 'https://single-runner.example.com';

    const calledUrls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      calledUrls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => dummySuccessResponse,
      };
    });

    const result = await runOnRunner(dummyRequest, 5000, 0);
    expect(result.status).toBe('COMPLETED');
    expect(calledUrls).toHaveLength(1);
    expect(calledUrls[0]).toContain('single-runner.example.com');
  });

  it('random start covers all runners (mock Math.random)', async () => {
    process.env.RUNNER_URLS = 'https://r1.example.com, https://r2.example.com, https://r3.example.com';

    // Rotation test 1: index 0
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // floor(0.1 * 3) = 0
    let firstCallUrl = '';
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (!firstCallUrl) firstCallUrl = url;
      return { ok: true, status: 200, json: async () => dummySuccessResponse };
    });
    await runOnRunner(dummyRequest, 5000, 0);
    expect(firstCallUrl).toContain('r1.example.com');

    // Rotation test 2: index 1
    vi.spyOn(Math, 'random').mockReturnValue(0.4); // floor(0.4 * 3) = 1
    firstCallUrl = '';
    await runOnRunner(dummyRequest, 5000, 0);
    expect(firstCallUrl).toContain('r2.example.com');

    // Rotation test 3: index 2
    vi.spyOn(Math, 'random').mockReturnValue(0.8); // floor(0.8 * 3) = 2
    firstCallUrl = '';
    await runOnRunner(dummyRequest, 5000, 0);
    expect(firstCallUrl).toContain('r3.example.com');
  });

  describe('runnerPoolHealth & runnerHealth', () => {
    it('returns ok when all runners are up with valid parsed metrics', async () => {
      process.env.RUNNER_URLS = 'https://r1.example.com, https://r2.example.com';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('r1')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ status: 'ok', active: 2, queued: 0, capacity: 4 }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', active: 1, queued: 1, capacity: 4 }),
        };
      });

      const pool = await runnerPoolHealth();
      expect(pool.status).toBe('ok');
      expect(pool.runners).toHaveLength(2);
      expect(pool.runners[0]).toEqual({
        host: 'r1.example.com',
        ok: true,
        active: 2,
        queued: 0,
        capacity: 4,
      });
      expect(pool.runners[1]).toEqual({
        host: 'r2.example.com',
        ok: true,
        active: 1,
        queued: 1,
        capacity: 4,
      });

      const simple = await runnerHealth();
      expect(simple.ok).toBe(true);
      expect(simple.detail).toBe('2/2 runners up');
    });

    it('returns degraded when some runners are up and some are down', async () => {
      process.env.RUNNER_URLS = 'https://r1.example.com, https://r2.example.com, https://r3.example.com';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('r1')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ status: 'ok' }),
          };
        }
        if (url.includes('r2')) {
          return {
            ok: false,
            status: 503,
            json: async () => ({ error: 'down' }),
          };
        }
        throw new TypeError('ECONNREFUSED');
      });

      const pool = await runnerPoolHealth();
      expect(pool.status).toBe('degraded');
      expect(pool.runners).toHaveLength(3);

      const simple = await runnerHealth();
      expect(simple.ok).toBe(true);
      expect(simple.detail).toBe('1/3 runners up');
    });

    it('returns down when all runners are down', async () => {
      process.env.RUNNER_URLS = 'https://r1.example.com, https://r2.example.com';
      global.fetch = vi.fn().mockRejectedValue(new TypeError('ECONNREFUSED'));

      const pool = await runnerPoolHealth();
      expect(pool.status).toBe('down');

      const simple = await runnerHealth();
      expect(simple.ok).toBe(false);
      expect(simple.detail).toBe('0/2 runners up');
    });
  });
});
