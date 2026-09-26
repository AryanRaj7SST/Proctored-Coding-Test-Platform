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

/**
 * How long to wait for a run. Each test has its own time limit in the runner
 * (TEST_TIMEOUT_MS), so the wait grows with the number of tests: a slow or
 * broken student page must come back as failed tests, never as a runner
 * timeout that would leave the attempt "grading pending" for ever.
 */
export function runTimeoutFor(testCount: number): number {
  return env.runnerTimeoutMs + Math.max(0, testCount) * env.runnerTestTimeoutMs;
}

/**
 * Longest one runOnRunner call may wait in total, retry included, so a
 * grading request ends inside the 300 s limit its routes declare (maxDuration).
 */
const MAX_TOTAL_WAIT_MS = 280_000;

class HttpResponseError extends Error {
  readonly runnerError: RunnerError;

  constructor(runnerError: RunnerError) {
    super(runnerError.message);
    this.name = 'HttpResponseError';
    this.runnerError = runnerError;
  }
}

/** Headers that authenticate one request body to the runner (bearer + timestamped HMAC). */
function signedHeaders(body: string, secret: string): Record<string, string> {
  const timestamp = String(Date.now());
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${secret}`,
    'x-runner-timestamp': timestamp,
    'x-runner-signature': signPayload(body, secret, timestamp),
  };
}

async function postToCandidateUrls(
  candidateUrls: string[],
  secret: string,
  body: string,
  timeoutMs: number,
): Promise<RunnerRunResult> {
  const headers = signedHeaders(body, secret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let lastError: unknown = null;

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!res.ok) {
        const bodyText = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
        const sanitizedBody = bodyText
          .slice(0, 500)
          .replace(/[\r\n]+/g, ' ')
          .trim();
        logger.error('runner.post_failed', {
          url,
          status: res.status,
          statusText: res.statusText,
          body: sanitizedBody,
        });

        if (res.status === 429) {
          throw new HttpResponseError(new RunnerError('BUSY', 'Runner queue is full.'));
        }
        if (res.status === 401 || res.status === 403) {
          throw new HttpResponseError(new RunnerError('REJECTED', 'Runner rejected the request.'));
        }
        if (res.status === 400) {
          throw new HttpResponseError(
            new RunnerError('INVALID', `Runner rejected the payload: ${sanitizedBody || 'Bad Request'}`),
          );
        }
        throw new HttpResponseError(
          new RunnerError(
            'UNAVAILABLE',
            `Runner responded with ${res.status}: ${sanitizedBody || res.statusText}`,
          ),
        );
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
  timeoutMs = runTimeoutFor(request.spec.tests.length),
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

  // Each attempt gets the full per-test wait (see runTimeoutFor): a shorter one
  // would turn a slow but valid run into a timeout. The retry only gets what
  // is left of MAX_TOTAL_WAIT_MS.
  const startedAt = Date.now();

  try {
    return await postToCandidateUrls(candidateUrls, secret, body, timeoutMs);
  } catch (err) {
    if (err instanceof HttpResponseError) {
      // The runner was reachable and responded with an HTTP status (429, 4xx, 5xx) or body.
      // Do not retry per spec: retrying 429 adds load, and 4xx/5xx indicates runner responded.
      throw err.runnerError;
    }

    // It was a transient network/connection/timeout error (e.g. ECONNREFUSED, fetch abort).
    const retryTimeout = Math.min(timeoutMs, MAX_TOTAL_WAIT_MS - (Date.now() - startedAt) - retryBackoffMs);
    if (retryTimeout < 1_000) {
      logger.error('runner.retry_skipped', { runId: request.runId, error: sanitizeError(err) });
      throw err;
    }
    logger.warn('runner.retry', {
      runId: request.runId,
      error: sanitizeError(err),
      attempt: 1,
    });

    if (retryBackoffMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryBackoffMs));
    }

    try {
      const result = await postToCandidateUrls(candidateUrls, secret, body, retryTimeout);
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
      // Reachable is not enough: a runner that rejects the app's secret looks
      // healthy here but refuses every run. Prove the credentials too.
      return await checkRunnerCredentials(url.replace(/\/health$/, '/auth-check'));
    } catch (err) {
      lastDetail = sanitizeError(err, 120);
    }
  }
  return { ok: false, detail: lastDetail };
}

export const RUNNER_SECRET_MISMATCH =
  'The runner rejects the app credentials: RUNNER_SECRET must be identical on the app and the runner.';

async function checkRunnerCredentials(url: string): Promise<{ ok: boolean; detail?: string }> {
  const body = '{}';
  const res = await fetch(url, {
    method: 'POST',
    headers: signedHeaders(body, requireEnv('runnerSecret')),
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  });
  if (res.ok) return { ok: true };
  if (res.status === 401 || res.status === 403) return { ok: false, detail: RUNNER_SECRET_MISMATCH };
  // A runner deployed before /auth-check existed: reachable, credentials unverified.
  if (res.status === 404) return { ok: true, detail: 'credentials not verified (redeploy the runner)' };
  return { ok: false, detail: `credential check returned status ${res.status}` };
}
