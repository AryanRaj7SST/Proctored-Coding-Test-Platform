import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { serviceUnavailable } from '@/lib/errors';

/**
 * Sliding-window rate limiter backed by Upstash Redis.
 *
 * Provides distributed, serverless-safe rate limiting across ephemeral
 * Lambda instances on Vercel. In local development without configured
 * Upstash credentials, it fails open with a warning to allow frictionless
 * offline dev.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

let warnedMissingEnv = false;
let redisClient: Redis | null | undefined = undefined;
const limiters = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (!warnedMissingEnv) {
      warnedMissingEnv = true;
      console.warn(
        '[RateLimit] Upstash Redis environment variables (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN) are not set. Rate limiting is disabled (failing open for local development).',
      );
    }
    redisClient = null;
    return null;
  }

  try {
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch (err) {
    console.warn('[RateLimit] Failed to initialize Upstash Redis client, failing open:', err);
    redisClient = null;
    return null;
  }
}

function getLimiter(redis: Redis, limit: number, windowMs: number): Ratelimit {
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      prefix: 'proctored:ratelimit',
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

export interface RateLimitOptions {
  failClosed?: boolean;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
  options?: RateLimitOptions,
): Promise<RateLimitResult> {
  const fallback: RateLimitResult = {
    allowed: true,
    remaining: limit,
    resetInMs: 0,
  };

  const isProd = process.env.NODE_ENV === 'production';
  const redis = getRedis();
  if (!redis) {
    if (options?.failClosed && isProd && process.env.ALLOW_NO_RATE_LIMIT !== 'true') {
      throw serviceUnavailable('Rate limit service is temporarily unavailable. Please try again shortly.');
    }
    return fallback;
  }

  try {
    const limiter = getLimiter(redis, limit, windowMs);
    const res = await limiter.limit(key);
    return {
      allowed: res.success,
      remaining: res.remaining,
      resetInMs: Math.max(0, res.reset - Date.now()),
    };
  } catch (err) {
    if (options?.failClosed && isProd) {
      throw serviceUnavailable('Rate limit service is temporarily unavailable. Please try again shortly.');
    }
    console.warn(`[RateLimit] Upstash rate limit error for key "${key}", failing open:`, err);
    return fallback;
  }
}

/** Test helper / operational reset. */
export function resetRateLimits(): void {
  limiters.clear();
  redisClient = undefined;
  warnedMissingEnv = false;
}
