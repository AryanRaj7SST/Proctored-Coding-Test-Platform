/**
 * Fixed-window rate limiter held in process memory.
 *
 * Deliberate scope decision (product requirement #33): a single app instance
 * serving 50-100 students does not need Redis. The interface is intentionally
 * tiny so it can be swapped for a Redis/Upstash implementation when the app is
 * scaled to multiple instances -- see docs/deployment.md.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

export function rateLimit(key: string, limit: number, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetInMs: windowMs };
  }
  existing.count += 1;
  const allowed = existing.count <= limit;
  return { allowed, remaining: Math.max(0, limit - existing.count), resetInMs: existing.resetAt - now };
}

/** Test helper / operational reset. */
export function resetRateLimits(): void {
  buckets.clear();
}
