import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

import { rateLimit, resetRateLimits } from '@/lib/rate-limit';

describe('rateLimit', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetRateLimits();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetRateLimits();
  });

  describe('when Upstash env vars are missing (local dev / fail-open)', () => {
    it('fails open and returns allowed: true with full remaining limit', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await rateLimit('test-key', 5, 60_000);

      expect(result).toEqual({
        allowed: true,
        remaining: 5,
        resetInMs: 0,
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const firstCall = warnSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      expect(firstCall?.[0]).toContain('failing open');
    });

    it('warns only once across multiple calls when env vars are missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await rateLimit('key-1', 5, 60_000);
      await rateLimit('key-2', 5, 60_000);
      await rateLimit('key-3', 10, 60_000);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('when Upstash is configured', () => {
    it('uses Ratelimit and returns allowed: true when under limit', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example-mock.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token';

      const resetTimestamp = Date.now() + 45_000;
      mockLimit.mockResolvedValueOnce({
        success: true,
        limit: 10,
        remaining: 9,
        reset: resetTimestamp,
        pending: Promise.resolve(),
      });

      const result = await rateLimit('student:123', 10, 60_000);

      expect(mockLimit).toHaveBeenCalledWith('student:123');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.resetInMs).toBeGreaterThan(0);
      expect(result.resetInMs).toBeLessThanOrEqual(45_000);
    });

    it('returns allowed: false when limit is exceeded', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example-mock.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token';

      const resetTimestamp = Date.now() + 30_000;
      mockLimit.mockResolvedValueOnce({
        success: false,
        limit: 5,
        remaining: 0,
        reset: resetTimestamp,
        pending: Promise.resolve(),
      });

      const result = await rateLimit('student:456', 5, 60_000);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.resetInMs).toBeGreaterThan(0);
    });

    it('fails open gracefully if Upstash throws an error', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example-mock.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockLimit.mockRejectedValueOnce(new Error('Upstash connection timeout'));

      const result = await rateLimit('student:789', 10, 60_000);

      expect(result).toEqual({
        allowed: true,
        remaining: 10,
        resetInMs: 0,
      });
      expect(warnSpy).toHaveBeenCalled();
      const firstCall = warnSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      expect(firstCall?.[0]).toContain('Upstash rate limit error');
    });
  });
});
