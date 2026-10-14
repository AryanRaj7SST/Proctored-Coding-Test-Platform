import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPreflight } from '../../scripts/loadtest/preflight';

describe('scripts/loadtest/preflight', () => {
  const secret = 'valid-test-secret-at-least-32-chars-long';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('all ok: verifies all healthy runners with warm latency and metrics', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/health')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', capacity: 4, queued: 0, active: 1 }),
        };
      }
      if (url.includes('/auth-check')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        };
      }
      return { ok: false, status: 404 };
    });

    const report = await runPreflight({
      runnerUrlsRaw: 'http://127.0.0.1:4000, http://127.0.0.1:4001',
      secret,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(report.allHealthy).toBe(true);
    expect(report.runners).toHaveLength(2);
    expect(report.runners[0]).toMatchObject({
      url: 'http://127.0.0.1:4000',
      valid: true,
      healthOk: true,
      authStatus: 'OK',
      capacity: 4,
      queued: 0,
      active: 1,
      ok: true,
      isColdStart: false,
    });
    expect(report.runners[1]).toMatchObject({
      url: 'http://127.0.0.1:4001',
      valid: true,
      healthOk: true,
      authStatus: 'OK',
      ok: true,
    });
  });

  it('one down: reports runner as DOWN when unreachable and preflight fails', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('4001')) {
        throw new TypeError('fetch failed: ECONNREFUSED');
      }
      if (url.includes('/health')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', capacity: 4, queued: 0, active: 0 }),
        };
      }
      if (url.includes('/auth-check')) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: false, status: 404 };
    });

    const report = await runPreflight({
      runnerUrlsRaw: 'http://127.0.0.1:4000, http://127.0.0.1:4001',
      secret,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(report.allHealthy).toBe(false);
    expect(report.runners[0]?.ok).toBe(true);
    expect(report.runners[1]?.ok).toBe(false);
    expect(report.runners[1]?.healthOk).toBe(false);
    expect(report.runners[1]?.summary).toContain('DOWN');
  });

  it('secret mismatch: reports secret mismatch on 401/403 and preflight fails', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/health')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', capacity: 4, queued: 0, active: 0 }),
        };
      }
      if (url.includes('/auth-check')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: 'unauthorized' }),
        };
      }
      return { ok: false, status: 404 };
    });

    const report = await runPreflight({
      runnerUrlsRaw: 'http://127.0.0.1:4000',
      secret,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(report.allHealthy).toBe(false);
    expect(report.runners[0]?.healthOk).toBe(true);
    expect(report.runners[0]?.authStatus).toBe('secret mismatch');
    expect(report.runners[0]?.ok).toBe(false);
    expect(report.runners[0]?.summary).toBe('SECRET MISMATCH');
  });

  it('cold start: flags latency > 5s as likely cold start / sleeping instance', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    let healthCall = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/health')) {
        healthCall++;
        if (healthCall === 1) {
          now += 5500; // 5.5s elapsed on first call
        } else {
          now += 50; // warm call
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', capacity: 4, queued: 0, active: 0 }),
        };
      }
      if (url.includes('/auth-check')) {
        now += 40;
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: false, status: 404 };
    });

    const report = await runPreflight({
      runnerUrlsRaw: 'http://127.0.0.1:4000',
      secret,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(report.allHealthy).toBe(true);
    expect(report.runners[0]?.isColdStart).toBe(true);
    expect(report.runners[0]?.firstLatencyMs).toBeGreaterThanOrEqual(5500);
  });

  it('malformed /health JSON: parses defensively without throwing', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/health')) {
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new Error('Unexpected token in JSON');
          },
        };
      }
      if (url.includes('/auth-check')) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: false, status: 404 };
    });

    const report = await runPreflight({
      runnerUrlsRaw: 'http://127.0.0.1:4000',
      secret,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(report.allHealthy).toBe(true);
    expect(report.runners[0]?.healthOk).toBe(true);
    // Malformed JSON gracefully leaves capacity, queued, active undefined without failing
    expect(report.runners[0]?.capacity).toBeUndefined();
    expect(report.runners[0]?.queued).toBeUndefined();
    expect(report.runners[0]?.active).toBeUndefined();
    expect(report.runners[0]?.ok).toBe(true);
  });

  it('checks app-url when provided and detects discrepancies in runner capacities', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('app.local')) {
        return { ok: true, status: 200 };
      }
      if (url.includes('4000') && url.includes('/health')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', capacity: 4, queued: 0 }),
        };
      }
      if (url.includes('4001') && url.includes('/health')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', capacity: 8, queued: 2 }),
        };
      }
      if (url.includes('/auth-check')) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: true, status: 200 };
    });

    const report = await runPreflight({
      runnerUrlsRaw: 'http://127.0.0.1:4000, http://127.0.0.1:4001',
      secret,
      appUrl: 'http://127.0.0.1:3000',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(report.appUrlStatus?.ok).toBe(true);
    expect(report.appUrlStatus?.status).toBe(200);
    expect(report.discrepancies.length).toBeGreaterThan(0);
    expect(report.discrepancies[0]).toContain('capacities differ');
  });
});
