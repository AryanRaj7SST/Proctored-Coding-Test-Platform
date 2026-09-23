import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RunnerRunResult, RunnerSpec } from '@shared/test-spec';
import { env, requireEnv } from './env';
import { logger, sanitizeError } from './logger';

export interface RunnerRequest {
  runId: string;
  html: string;
  css: string;
  js: string;
  spec: RunnerSpec;
}

/**
 * Sign the exact request body. The runner recomputes the HMAC, so a leaked
 * bearer token alone cannot be replayed against a modified payload, and the
 * runner never has to trust anything about the caller's identity beyond the
 * shared secret. (docs/security.md #app-to-runner)
 */
export function signPayload(body: string, secret: string, timestamp: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function verifySignature(body: string, secret: string, timestamp: string, signature: string): boolean {
  const expected = signPayload(body, secret, timestamp);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature ?? ''), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class RunnerError extends Error {
  code: 'UNAVAILABLE' | 'TIMEOUT' | 'REJECTED' | 'BUSY' | 'INVALID';

  constructor(code: RunnerError['code'], message: string) {
    super(message);
    this.name = 'RunnerError';
    this.code = code;
  }
}

/** Student-facing text for each runner failure mode. Never technical. */
export function runnerErrorMessage(code: RunnerError['code']): string {
  switch (code) {
    case 'BUSY':
      return 'The test runner is busy right now. Please try again in a few seconds.';
    case 'TIMEOUT':
      return 'Test execution took too long and was stopped. Check for infinite loops in your code.';
    default:
      return 'Test execution failed. Please try again.';
  }
}

export async function runOnRunner(
  request: RunnerRequest,
  timeoutMs = env.runnerTimeoutMs,
): Promise<RunnerRunResult> {
  const baseUrl = requireEnv('runnerUrl').replace(/\/$/, '');
  const candidateUrls = [
    `${baseUrl}/run`,
    baseUrl.includes('127.0.0.1')
      ? `${baseUrl.replace('127.0.0.1', 'localhost')}/run`
      : baseUrl.includes('localhost')
        ? `${baseUrl.replace('localhost', '127.0.0.1')}/run`
        : null,
  ].filter(Boolean) as string[];

  const secret = requireEnv('runnerSecret');
  const body = JSON.stringify(request);
  const timestamp = String(Date.now());
  const signature = signPayload(body, secret, timestamp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let lastError: unknown = null;

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${secret}`,
          'x-runner-timestamp': timestamp,
          'x-runner-signature': signature,
        },
        body,
        signal: controller.signal,
        cache: 'no-store',
      });

      if (res.status === 429) throw new RunnerError('BUSY', 'Runner queue is full.');
      if (res.status === 401 || res.status === 403)
        throw new RunnerError('REJECTED', 'Runner rejected the request.');
      if (res.status === 400) throw new RunnerError('INVALID', 'Runner rejected the payload.');
      if (!res.ok) throw new RunnerError('UNAVAILABLE', `Runner responded with ${res.status}.`);

      const json = (await res.json()) as RunnerRunResult;
      if (!json || !Array.isArray(json.results)) throw new RunnerError('INVALID', 'Malformed runner response.');
      return json;
    } catch (err) {
      if (err instanceof RunnerError) {
        clearTimeout(timer);
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        clearTimeout(timer);
        throw new RunnerError('TIMEOUT', 'Runner request timed out.');
      }
      lastError = err;
      // Network failure on this URL candidate, try next if available
    }
  }

  clearTimeout(timer);
  const errorDetails = lastError instanceof Error ? `${lastError.name}: ${lastError.message}` : String(lastError);
  logger.error('runner.unreachable', { error: sanitizeError(lastError), detail: errorDetails });
  throw new RunnerError('UNAVAILABLE', `Runner is unreachable (${errorDetails}).`);
}

export async function runnerHealth(): Promise<{ ok: boolean; detail?: string }> {
  const baseUrl = requireEnv('runnerUrl').replace(/\/$/, '');
  const candidateUrls = [
    `${baseUrl}/health`,
    baseUrl.includes('127.0.0.1')
      ? `${baseUrl.replace('127.0.0.1', 'localhost')}/health`
      : baseUrl.includes('localhost')
        ? `${baseUrl.replace('localhost', '127.0.0.1')}/health`
        : null,
  ].filter(Boolean) as string[];

  let lastDetail = 'unreachable';
  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (!res.ok) {
        lastDetail = `status ${res.status}`;
        continue;
      }
      return { ok: true };
    } catch (err) {
      lastDetail = sanitizeError(err, 120);
    }
  }
  return { ok: false, detail: lastDetail };
}
