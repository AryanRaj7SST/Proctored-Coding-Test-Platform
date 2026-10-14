import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockLimit = vi.fn();

vi.mock('@upstash/ratelimit', () => {
  class MockRatelimit {
    static slidingWindow = vi.fn().mockReturnValue(() => {});
    limit = mockLimit;
  }
  return { Ratelimit: MockRatelimit };
});

vi.mock('@upstash/redis', () => {
  class MockRedis {}
  return { Redis: MockRedis };
});

import { missingServerEnv, env } from '@/lib/env';
import { rateLimit, resetRateLimits } from '@/lib/rate-limit';
import { AppError } from '@/lib/errors';

describe('Production Env & Rate Limiting Hardening', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetRateLimits();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    resetRateLimits();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  describe('env.ts production Upstash requirements', () => {
    it('requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in production', () => {
      const prodEnv = {
        ...env,
        isProduction: true,
        databaseUrl: 'postgresql://user:pass@localhost:5432/db',
        authSecret: '01234567890123456789012345678901',
        googleId: 'google-id',
        googleSecret: 'google-secret',
        runnerSecret: '01234567890123456789012345678901',
        runnerUrlConfigured: true,
        runnerUrl: 'https://runner.internal',
        cronSecret: '0123456789012345',
        upstashRedisRestUrl: '',
        upstashRedisRestToken: '',
        allowNoRateLimit: false,
      };

      const missing = missingServerEnv(prodEnv as unknown as typeof env);
      expect(missing.some((m) => m.includes('UPSTASH_REDIS_REST_URL'))).toBe(true);
      expect(missing.some((m) => m.includes('UPSTASH_REDIS_REST_TOKEN'))).toBe(true);
    });

    it('allows missing Upstash in production if ALLOW_NO_RATE_LIMIT=true and logs loudly', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const prodEnv = {
        ...env,
        isProduction: true,
        databaseUrl: 'postgresql://user:pass@localhost:5432/db',
        authSecret: '01234567890123456789012345678901',
        googleId: 'google-id',
        googleSecret: 'google-secret',
        runnerSecret: '01234567890123456789012345678901',
        runnerUrlConfigured: true,
        runnerUrl: 'https://runner.internal',
        cronSecret: '0123456789012345',
        upstashRedisRestUrl: '',
        upstashRedisRestToken: '',
        allowNoRateLimit: true,
      };

      const missing = missingServerEnv(prodEnv as unknown as typeof env);
      expect(missing.some((m) => m.includes('UPSTASH_REDIS_REST_URL'))).toBe(false);
      expect(missing.some((m) => m.includes('UPSTASH_REDIS_REST_TOKEN'))).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/ALLOW_NO_RATE_LIMIT/i));
    });
  });

  describe('rate-limit.ts fail-closed vs fail-open', () => {
    it('fails closed with 503 on Redis error in production when failClosed is true (run/submit routes)', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

      mockLimit.mockRejectedValue(new Error('Connection to Upstash timed out'));

      let caughtErr: unknown = null;
      try {
        await rateLimit('run:user123', 10, 60_000, { failClosed: true });
      } catch (err) {
        caughtErr = err;
      }

      expect(caughtErr).toBeInstanceOf(AppError);
      expect((caughtErr as AppError).status).toBe(503);
    });

    it('stays fail-open (allowed: true) on Redis error when failClosed is false/default (proctor events)', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockLimit.mockRejectedValue(new Error('Connection to Upstash timed out'));

      const res = await rateLimit('proctor:user123', 120, 60_000);
      expect(res.allowed).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/failing open/i),
        expect.any(Error),
      );
    });
  });
});
