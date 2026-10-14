/**
 * Centralised, validated environment access. SERVER-SIDE ONLY: nothing here
 * may be imported by a client component (secrets would ship to the browser).
 *
 * Values are read once. Missing required values do not throw at import time
 * (`next build` evaluates modules without a full environment); instead
 * `assertServerEnv()` runs at server start (src/instrumentation.ts) and
 * `requireEnv()` guards each use, both failing with a clear message.
 */

function str(name: string, fallback = ''): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

export const env = {
  databaseUrl: str('DATABASE_URL'),
  authSecret: str('AUTH_SECRET'),
  googleId: str('AUTH_GOOGLE_ID'),
  googleSecret: str('AUTH_GOOGLE_SECRET'),
  authTrustHost: str('AUTH_TRUST_HOST') === 'true',
  runnerUrl: str('RUNNER_URL', 'http://127.0.0.1:4000'),
  /** False when RUNNER_URL was left unset and the local default above is in use. */
  runnerUrlConfigured: str('RUNNER_URL') !== '',
  runnerSecret: str('RUNNER_SECRET'),
  runnerTimeoutMs: int('RUNNER_TIMEOUT_MS', 30_000),
  /** Must match the runner's TEST_TIMEOUT_MS: the per-test allowance added to the wait. */
  runnerTestTimeoutMs: int('RUNNER_TEST_TIMEOUT_MS', 6_000),
  maxCodeBytes: int('MAX_CODE_BYTES', 200_000),
  runRateLimitPerMin: int('RUN_RATE_LIMIT_PER_MIN', 12),
  submitRateLimitPerMin: int('SUBMIT_RATE_LIMIT_PER_MIN', 6),
  proctorRateLimitPerMin: int('PROCTOR_RATE_LIMIT_PER_MIN', 120),
  heartbeatIntervalSeconds: int('HEARTBEAT_INTERVAL_SECONDS', 12),
  sessionStaleSeconds: int('SESSION_STALE_SECONDS', 45),
  testLogRetentionDays: int('TEST_LOG_RETENTION_DAYS', 90),
  /** Bearer token Vercel Cron sends to /api/cron/maintenance; unset disables the endpoint. */
  cronSecret: str('CRON_SECRET'),
  logLevel: (LOG_LEVELS as readonly string[]).includes(str('LOG_LEVEL'))
    ? (str('LOG_LEVEL') as LogLevel)
    : 'info',
  imageProxyRateLimitPerMin: int('IMAGE_PROXY_RATE_LIMIT_PER_MIN', 30),
  upstashRedisRestUrl: str('UPSTASH_REDIS_REST_URL'),
  upstashRedisRestToken: str('UPSTASH_REDIS_REST_TOKEN'),
  allowNoRateLimit: str('ALLOW_NO_RATE_LIMIT') === 'true',
  isProduction: process.env.NODE_ENV === 'production',
} as const;

type StringKey = { [K in keyof typeof env]: (typeof env)[K] extends string ? K : never }[keyof typeof env];

/** Settings the server cannot work without, with the variable that provides each. */
const REQUIRED: Partial<Record<StringKey, string>> = {
  databaseUrl: 'DATABASE_URL',
  authSecret: 'AUTH_SECRET',
  googleId: 'AUTH_GOOGLE_ID',
  googleSecret: 'AUTH_GOOGLE_SECRET',
  runnerSecret: 'RUNNER_SECRET',
};

/** The variable behind each setting requireEnv() can be asked for. */
const ENV_KEY_MAP: Partial<Record<StringKey, string>> = { ...REQUIRED, runnerUrl: 'RUNNER_URL' };

/** Hosts reachable only inside a private network, where plain http to the runner is acceptable. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1' || /^127\./.test(h)) return true;
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h.endsWith('.internal') || h.endsWith('.local')) return true;
  return !h.includes('.') && !h.includes(':'); // a bare service name, e.g. "runner" on a Docker network
}

/**
 * Names of required variables that are missing, too weak, or unsafe. The
 * stricter rules apply in production only, so local development and tests
 * keep working with short throwaway values.
 */
export function missingServerEnv(source: typeof env = env): string[] {
  const missing = Object.entries(REQUIRED)
    .filter(([key]) => !source[key as StringKey])
    .map(([, name]) => name as string);
  if (source.runnerSecret && source.runnerSecret.length < 16) missing.push('RUNNER_SECRET (min 16 chars)');
  if (!source.isProduction) return missing;

  if (source.authSecret && source.authSecret.length < 32)
    missing.push('AUTH_SECRET (min 32 chars in production)');
  if (source.runnerSecret && source.runnerSecret.length < 32) {
    missing.push('RUNNER_SECRET (min 32 chars in production)');
  }
  if (source.cronSecret && source.cronSecret.length < 16) missing.push('CRON_SECRET (min 16 chars)');
  if (!source.runnerUrlConfigured) missing.push('RUNNER_URL (must be set in production)');
  // Student code and test specs travel to the runner: over the internet that must be https.
  let runner: URL | null = null;
  try {
    runner = new URL(source.runnerUrl);
  } catch {
    missing.push('RUNNER_URL (not a valid URL)');
  }
  if (runner && runner.protocol !== 'https:' && !isPrivateHost(runner.hostname)) {
    missing.push('RUNNER_URL (must be https:// unless the runner is on a private network)');
  }
  if (source.allowNoRateLimit || process.env.ALLOW_NO_RATE_LIMIT === 'true') {
    console.warn(
      '[SECURITY WARNING] ALLOW_NO_RATE_LIMIT=true is set in production! Rate limiting is disabled.',
    );
  } else {
    if (!source.upstashRedisRestUrl && !process.env.UPSTASH_REDIS_REST_URL) {
      missing.push('UPSTASH_REDIS_REST_URL (must be set in production unless ALLOW_NO_RATE_LIMIT=true)');
    }
    if (!source.upstashRedisRestToken && !process.env.UPSTASH_REDIS_REST_TOKEN) {
      missing.push('UPSTASH_REDIS_REST_TOKEN (must be set in production unless ALLOW_NO_RATE_LIMIT=true)');
    }
  }
  return missing;
}

/** Fail fast, with the exact variables to fix, when the server starts misconfigured. */
export function assertServerEnv(): void {
  const missing = missingServerEnv();
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. See .env.example.`);
  }
}

/**
 * Throw a clear error when a hard requirement is missing at request time.
 * The variable is read live first, so a value set after start-up is seen.
 */
export function requireEnv(key: StringKey): string {
  const name = ENV_KEY_MAP[key];
  const value = (name ? process.env[name] : undefined) || env[key];
  if (!value) {
    throw new Error(`Missing required environment variable for "${key}". See .env.example.`);
  }
  return value;
}
