import { config } from './config';

const ORDER = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof ORDER;

/** The runner must never echo student code or spec bodies into its logs. */
const FORBIDDEN_KEYS = ['html', 'css', 'js', 'spec', 'secret', 'authorization', 'signature', 'testCode'];

function scrub(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    if (FORBIDDEN_KEYS.includes(k)) out[k] = '[redacted]';
    else if (typeof v === 'string') out[k] = v.length > 300 ? `${v.slice(0, 300)}...` : v;
    else out[k] = v;
  }
  return out;
}

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[config.logLevel]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: 'runner',
    message,
    ...(context ? { context: scrub(context) } : {}),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, c?: Record<string, unknown>) => emit('debug', m, c),
  info: (m: string, c?: Record<string, unknown>) => emit('info', m, c),
  warn: (m: string, c?: Record<string, unknown>) => emit('warn', m, c),
  error: (m: string, c?: Record<string, unknown>) => emit('error', m, c),
};

/** Strip paths, URLs and anything that hints at internals from an error. */
export function safeError(err: unknown, max = 400): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/\/(home|Users|var|srv|app|ms-playwright)\/[^\s"':]+/g, '[path]')
    .replace(/https?:\/\/[^\s"']+/g, '[url]')
    .replace(/\s+at\s+.*/gs, '')
    .slice(0, max);
}
