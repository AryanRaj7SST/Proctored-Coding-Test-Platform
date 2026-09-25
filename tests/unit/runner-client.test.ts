import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RunnerRequest } from '@/lib/runner-client';
import { runOnRunner, RunnerError } from '@/lib/runner-client';
import { logger } from '@/lib/logger';

// Ensure environment variables are set for testing
process.env.RUNNER_URL = 'https://runner.example.com';
process.env.RUNNER_SECRET = 'test-secret-at-least-32-chars-long-123456';

const dummyRequest: RunnerRequest = {
  runId: 'test-run-123',
  html: '<div>Hello</div>',
  css: 'div { color: red; }',
  js: '',
  spec: {
    version: 1,
    viewport: { width: 1280, height: 720 },
    tests: [],
  },
};

const dummySuccessResponse = {
  runId: 'test-run-123',
  status: 'COMPLETED',
  results: [{ id: 't1', testName: 'Test 1', passed: true, durationMs: 10 }],
  durationMs: 50,
  consoleLogs: [],
};

describe('runOnRunner retry and error handling', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('succeeds on first attempt without retrying or logging retry warnings', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => dummySuccessResponse,
    });
    global.fetch = fetchMock;

    const warnSpy = vi.spyOn(logger, 'warn');
    const infoSpy = vi.spyOn(logger, 'info');

    const result = await runOnRunner(dummyRequest, 5000, 0);
    expect(result.status).toBe('COMPLETED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalledWith('runner.retry', expect.anything());
    expect(infoSpy).not.toHaveBeenCalledWith('runner.retry_succeeded', expect.anything());
  });

  it('retries once on transient network failure and succeeds if retry passes', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new TypeError('fetch failed: ECONNREFUSED');
      }
      return {
        ok: true,
        status: 200,
        json: async () => dummySuccessResponse,
      };
    });
    global.fetch = fetchMock;

    const warnSpy = vi.spyOn(logger, 'warn');
    const infoSpy = vi.spyOn(logger, 'info');
    const errorSpy = vi.spyOn(logger, 'error');

    const result = await runOnRunner(dummyRequest, 5000, 0);
    expect(result.status).toBe('COMPLETED');
    expect(callCount).toBe(2);
    expect(warnSpy).toHaveBeenCalledWith('runner.retry', expect.objectContaining({ attempt: 1 }));
    expect(infoSpy).toHaveBeenCalledWith('runner.retry_succeeded', expect.objectContaining({ attempt: 2 }));
    expect(errorSpy).not.toHaveBeenCalledWith('runner.retry_failed', expect.anything());
  });

  it('retries once on fetch timeout (AbortError) and succeeds if retry passes', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      return {
        ok: true,
        status: 200,
        json: async () => dummySuccessResponse,
      };
    });
    global.fetch = fetchMock;

    const warnSpy = vi.spyOn(logger, 'warn');
    const infoSpy = vi.spyOn(logger, 'info');

    const result = await runOnRunner(dummyRequest, 5000, 0);
    expect(result.status).toBe('COMPLETED');
    expect(callCount).toBe(2);
    expect(warnSpy).toHaveBeenCalledWith('runner.retry', expect.objectContaining({ attempt: 1 }));
    expect(infoSpy).toHaveBeenCalledWith('runner.retry_succeeded', expect.objectContaining({ attempt: 2 }));
  });

  it('fails both times and surfaces UNAVAILABLE error when network failure persists', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed: ECONNREFUSED'));
    global.fetch = fetchMock;

    const warnSpy = vi.spyOn(logger, 'warn');
    const errorSpy = vi.spyOn(logger, 'error');

    await expect(runOnRunner(dummyRequest, 5000, 0)).rejects.toThrow(RunnerError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith('runner.retry', expect.objectContaining({ attempt: 1 }));
    expect(errorSpy).toHaveBeenCalledWith('runner.retry_failed', expect.objectContaining({ attempt: 2 }));
  });

  it('does NOT retry on 429 QUEUE_FULL (surfaces BUSY error immediately)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'queue full' }),
    });
    global.fetch = fetchMock;

    const warnSpy = vi.spyOn(logger, 'warn');
    const errorSpy = vi.spyOn(logger, 'error');

    await expect(runOnRunner(dummyRequest, 5000, 0)).rejects.toMatchObject({
      name: 'RunnerError',
      code: 'BUSY',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalledWith('runner.retry_failed', expect.anything());
  });

  it('does NOT retry on 400 Bad Request (surfaces INVALID error immediately)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid payload' }),
    });
    global.fetch = fetchMock;

    const warnSpy = vi.spyOn(logger, 'warn');

    await expect(runOnRunner(dummyRequest, 5000, 0)).rejects.toMatchObject({
      name: 'RunnerError',
      code: 'INVALID',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does NOT retry on 401 / 403 Unauthorized (surfaces REJECTED error immediately)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized' }),
    });
    global.fetch = fetchMock;

    const warnSpy = vi.spyOn(logger, 'warn');

    await expect(runOnRunner(dummyRequest, 5000, 0)).rejects.toMatchObject({
      name: 'RunnerError',
      code: 'REJECTED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does NOT retry on 500 HTTP response from runner (runner was reachable and responded)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'internal error' }),
    });
    global.fetch = fetchMock;

    const warnSpy = vi.spyOn(logger, 'warn');

    await expect(runOnRunner(dummyRequest, 5000, 0)).rejects.toMatchObject({
      name: 'RunnerError',
      code: 'UNAVAILABLE',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
