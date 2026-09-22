import { env } from './env';

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_KEYS = [
  'password',
  'secret',
  'token',
  'authorization',
  'cookie',
  'runner_secret',
  'runnersecret',
  'auth_secret',
  'client_secret',
  'testcode',
  'spec',
  'html',
  'css',
  'js',
];

/** Strip anything that could carry secrets, student code, or hidden test bodies. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.includes(k.toLowerCase()) ? '[redacted]' : sanitize(v, depth + 1);
    }
    return out;
  }
  return '[unserialisable]';
}

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[env.logLevel]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...(context ? { context: sanitize(context) } : {}),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line); // eslint-disable-line no-console
}

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => emit('debug', m, c),
  info: (m: string, c?: Record<string, unknown>) => emit('info', m, c),
  warn: (m: string, c?: Record<string, unknown>) => emit('warn', m, c),
  error: (m: string, c?: Record<string, unknown>) => emit('error', m, c),
};

/** Turn an unknown error into a short, secret-free string for admin logs. */
export function sanitizeError(err: unknown, max = 600): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return raw
    .replace(/postgres(ql)?:\/\/[^\s"']+/gi, '[db-url]')
    .replace(/(Bearer|bearer)\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/\/(home|Users|var|srv|app)\/[^\s"':]+/g, '[path]')
    .slice(0, max);
}
