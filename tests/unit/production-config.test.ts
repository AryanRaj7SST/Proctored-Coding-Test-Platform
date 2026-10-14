import { describe, it, expect, vi, afterEach } from 'vitest';
import { env, isPrivateHost, missingServerEnv } from '@/lib/env';

/** A complete, production-grade configuration to vary one field at a time. */
const prod = {
  ...env,
  isProduction: true,
  databaseUrl: 'postgresql://u:p@db.example.com/app',
  authSecret: 'a'.repeat(44),
  googleId: 'id.apps.googleusercontent.com',
  googleSecret: 'google-secret',
  runnerUrl: 'https://runner.example.com',
  runnerUrlConfigured: true,
  runnerSecret: 'r'.repeat(64),
  cronSecret: 'c'.repeat(64),
  upstashRedisRestUrl: 'https://upstash.example.com',
  upstashRedisRestToken: 'token'.repeat(8),
};

describe('production configuration is validated at startup', () => {
  it('a complete production configuration passes', () => {
    expect(missingServerEnv(prod)).toEqual([]);
  });

  it('refuses weak secrets in production only', () => {
    expect(missingServerEnv({ ...prod, authSecret: 'short-but-set' })).toEqual([
      'AUTH_SECRET (min 32 chars in production)',
    ]);
    expect(missingServerEnv({ ...prod, runnerSecret: 'x'.repeat(20) })).toEqual([
      'RUNNER_SECRET (min 32 chars in production)',
    ]);
    expect(missingServerEnv({ ...prod, cronSecret: 'tiny' })).toEqual(['CRON_SECRET (min 16 chars)']);
    // Development keeps working with throwaway values.
    expect(missingServerEnv({ ...prod, isProduction: false, authSecret: 'short-but-set' })).toEqual([]);
  });

  it('a CRON_SECRET is optional (maintenance is simply disabled without it)', () => {
    expect(missingServerEnv({ ...prod, cronSecret: '' })).toEqual([]);
  });

  it('the runner must be set explicitly and reached over https unless it is private', () => {
    expect(
      missingServerEnv({ ...prod, runnerUrlConfigured: false, runnerUrl: 'http://127.0.0.1:4000' }),
    ).toEqual(['RUNNER_URL (must be set in production)']);
    expect(missingServerEnv({ ...prod, runnerUrl: 'http://runner.example.com' })).toEqual([
      'RUNNER_URL (must be https:// unless the runner is on a private network)',
    ]);
    expect(missingServerEnv({ ...prod, runnerUrl: 'http://runner:4000' })).toEqual([]);
    expect(missingServerEnv({ ...prod, runnerUrl: 'http://10.0.3.7:4000' })).toEqual([]);
    expect(missingServerEnv({ ...prod, runnerUrl: 'not a url' })).toContain('RUNNER_URL (not a valid URL)');
  });

  it('validates RUNNER_URLS pool list, http requirements, deduplication, and bounds', () => {
    // Valid list passes
    expect(
      missingServerEnv({ ...prod, runnerUrlsRaw: 'https://r1.example.com, https://r2.example.com' }),
    ).toEqual([]);

    // One bad URL in the list
    expect(
      missingServerEnv({ ...prod, runnerUrlsRaw: 'https://r1.example.com, not a url' }),
    ).toEqual(['RUNNER_URLS[1] (not a valid URL)']);

    // HTTP public host in the list
    expect(
      missingServerEnv({ ...prod, runnerUrlsRaw: 'https://r1.example.com, http://r2.example.com' }),
    ).toEqual(['RUNNER_URLS[1] (must be https:// unless the runner is on a private network)']);

    // Only RUNNER_URL set
    expect(
      missingServerEnv({
        ...prod,
        runnerUrlsRaw: '',
        runnerUrlConfigured: true,
        runnerUrl: 'https://runner.example.com',
      }),
    ).toEqual([]);

    // Neither set
    expect(
      missingServerEnv({
        ...prod,
        runnerUrlsRaw: '',
        runnerUrlConfigured: false,
        runnerUrl: '',
      }),
    ).toEqual(['RUNNER_URL (must be set in production)']);

    // Duplicates removed (passes and deduplicated)
    expect(
      missingServerEnv({
        ...prod,
        runnerUrlsRaw: 'https://r1.example.com, https://r1.example.com',
      }),
    ).toEqual([]);

    // Reject lists longer than 20
    const overTwenty = Array.from({ length: 21 }, (_, i) => `https://r${i}.example.com`).join(', ');
    expect(missingServerEnv({ ...prod, runnerUrlsRaw: overTwenty })).toEqual([
      'RUNNER_URLS (max 20 allowed)',
    ]);
  });

  it('required values are still required everywhere', () => {
    expect(missingServerEnv({ ...prod, isProduction: false, databaseUrl: '', googleSecret: '' })).toEqual([
      'DATABASE_URL',
      'AUTH_GOOGLE_SECRET',
    ]);
  });

  it('private hosts are recognised; public ones are not', () => {
    for (const h of [
      'localhost',
      '127.0.0.1',
      '::1',
      '10.1.2.3',
      '192.168.0.9',
      '172.20.1.1',
      'runner',
      'runner.internal',
    ]) {
      expect(isPrivateHost(h)).toBe(true);
    }
    for (const h of ['runner.example.com', '172.40.1.1', '8.8.8.8', 'my-runner.onrender.com']) {
      expect(isPrivateHost(h)).toBe(false);
    }
  });
});

describe('GET /api/cron/maintenance', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock('@/server/services/maintenance');
  });

  async function load(secret: string | undefined) {
    vi.resetModules();
    if (secret === undefined) vi.stubEnv('CRON_SECRET', '');
    else vi.stubEnv('CRON_SECRET', secret);
    const runMaintenance = vi.fn(async () => ({
      staleSessionsMarked: 0,
      sittingsFinalized: 2,
      practiceRunsDeleted: 5,
      runLogsCleared: 7,
    }));
    vi.doMock('@/server/services/maintenance', () => ({ runMaintenance }));
    const { GET } = await import('@/app/api/cron/maintenance/route');
    const call = (authorization?: string) =>
      GET(
        new Request('http://localhost/api/cron/maintenance', {
          headers: authorization ? { authorization } : {},
        }),
      );
    return { call, runMaintenance };
  }

  it('does not exist without CRON_SECRET', async () => {
    const { call, runMaintenance } = await load(undefined);
    expect((await call('Bearer anything')).status).toBe(404);
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it('refuses a missing or wrong token', async () => {
    const { call, runMaintenance } = await load('s'.repeat(40));
    expect((await call()).status).toBe(401);
    expect((await call(`Bearer ${'t'.repeat(40)}`)).status).toBe(401);
    expect((await call('s'.repeat(40))).status).toBe(401);
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it('runs with the exact bearer token and reports what it did', async () => {
    const { call, runMaintenance } = await load('s'.repeat(40));
    const res = await call(`Bearer ${'s'.repeat(40)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sittingsFinalized: 2, practiceRunsDeleted: 5 });
    expect(runMaintenance).toHaveBeenCalledOnce();
  });
});
