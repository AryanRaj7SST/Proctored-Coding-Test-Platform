/** Centralised, validated environment access (server-side only). */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    // Do not throw at import time during `next build`, which evaluates modules
    // without a full environment; throw when the value is actually used.
    return '';
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  authSecret: required('AUTH_SECRET'),
  googleId: required('AUTH_GOOGLE_ID'),
  googleSecret: required('AUTH_GOOGLE_SECRET'),
  runnerUrl: required('RUNNER_URL', 'http://localhost:4000'),
  runnerSecret: required('RUNNER_SECRET'),
  runnerTimeoutMs: int('RUNNER_TIMEOUT_MS', 30_000),
  maxCodeBytes: int('MAX_CODE_BYTES', 200_000),
  runRateLimitPerMin: int('RUN_RATE_LIMIT_PER_MIN', 12),
  submitRateLimitPerMin: int('SUBMIT_RATE_LIMIT_PER_MIN', 6),
  proctorRateLimitPerMin: int('PROCTOR_RATE_LIMIT_PER_MIN', 120),
  heartbeatIntervalSeconds: int('HEARTBEAT_INTERVAL_SECONDS', 12),
  sessionStaleSeconds: int('SESSION_STALE_SECONDS', 45),
  testLogRetentionDays: int('TEST_LOG_RETENTION_DAYS', 90),
  logLevel: (process.env.LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error',
  isProduction: process.env.NODE_ENV === 'production',
} as const;

/** Throw a clear error when a hard requirement is missing at request time. */
export function requireEnv(name: keyof typeof env): string {
  const value = env[name];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Missing required environment variable for "${String(name)}". See .env.example.`);
  }
  return value;
}
