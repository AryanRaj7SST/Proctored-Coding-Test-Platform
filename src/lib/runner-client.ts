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

class HttpResponseError extends Error {
  readonly runnerError: RunnerError;

  constructor(runnerError: RunnerError) {
    super(runnerError.message);
    this.name = 'HttpResponseError';
    this.runnerError = runnerError;
  }
}

async function postToCandidateUrls(
  candidateUrls: string[],
  secret: string,
  body: string,
  timeoutMs: number,
): Promise<RunnerRunResult> {
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

      if (res.status === 429) {
        throw new HttpResponseError(new RunnerError('BUSY', 'Runner queue is full.'));
      }
      if (res.status === 401 || res.status === 403) {
        throw new HttpResponseError(new RunnerError('REJECTED', 'Runner rejected the request.'));
      }
      if (res.status === 400) {
        throw new HttpResponseError(new RunnerError('INVALID', 'Runner rejected the payload.'));
      }
      if (!res.ok) {
        throw new HttpResponseError(new RunnerError('UNAVAILABLE', `Runner responded with ${res.status}.`));
      }

      let json: RunnerRunResult;
      try {
        json = (await res.json()) as RunnerRunResult;
      } catch {
        throw new HttpResponseError(new RunnerError('INVALID', 'Malformed runner response.'));
      }

      if (!json || !Array.isArray(json.results)) {
        throw new HttpResponseError(new RunnerError('INVALID', 'Malformed runner response.'));
      }

      clearTimeout(timer);
      return json;
    } catch (err) {
      if (err instanceof HttpResponseError) {
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
  const errorDetails =
    lastError instanceof Error ? `${lastError.name}: ${lastError.message}` : String(lastError);
  throw new RunnerError('UNAVAILABLE', `Runner is unreachable (${errorDetails}).`);
}

export async function runOnRunner(
  request: RunnerRequest,
  timeoutMs = env.runnerTimeoutMs,
  retryBackoffMs = 1500,
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

  // Bound worst-case total latency to avoid students staring at a spinner for 60+ seconds.
  // For standard 30s timeout: attempt 1 = 20s, backoff = 1.5s, attempt 2 = 15s (total worst-case: 36.5s).
  const attempt1Timeout = timeoutMs >= 25_000 ? 20_000 : Math.max(50, Math.floor(timeoutMs * 0.6));
  const attempt2Timeout = timeoutMs >= 25_000 ? 15_000 : Math.max(50, Math.floor(timeoutMs * 0.5));

  try {
    return await postToCandidateUrls(candidateUrls, secret, body, attempt1Timeout);
  } catch (err) {
    if (err instanceof HttpResponseError) {
      // The runner was reachable and responded with an HTTP status (429, 4xx, 5xx) or body.
      // Do not retry per spec: retrying 429 adds load, and 4xx/5xx indicates runner responded.
      throw err.runnerError;
    }

    // It was a transient network/connection/timeout error (e.g. ECONNREFUSED, fetch abort).
    logger.warn('runner.retry', {
      runId: request.runId,
      error: sanitizeError(err),
      attempt: 1,
    });

    if (retryBackoffMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryBackoffMs));
    }

    try {
      const result = await postToCandidateUrls(candidateUrls, secret, body, attempt2Timeout);
      logger.info('runner.retry_succeeded', {
        runId: request.runId,
        attempt: 2,
      });
      return result;
    } catch (retryErr) {
      const finalError = retryErr instanceof HttpResponseError ? retryErr.runnerError : retryErr;
      logger.error('runner.retry_failed', {
        runId: request.runId,
        error: sanitizeError(finalError),
        attempt: 2,
      });
      if (finalError instanceof RunnerError && finalError.code === 'UNAVAILABLE') {
        logger.error('runner.unreachable', { error: sanitizeError(finalError) });
      }
      throw finalError;
    }
  }
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
