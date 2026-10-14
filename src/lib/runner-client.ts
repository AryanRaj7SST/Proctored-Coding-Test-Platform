import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RunnerRunResult, RunnerSpec } from '@shared/test-spec';
import { env, requireEnv, getRunnerUrls } from './env';
import { logger, sanitizeError } from './logger';

export { getRunnerUrls };

export interface RunnerRequest {
  runId: string;
  userId?: string;
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
export function signedHeaders(body: string, secret: string): Record<string, string> {
  const timestamp = String(Date.now());
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${secret}`,
    'x-runner-timestamp': timestamp,
    'x-runner-signature': signPayload(body, secret, timestamp),
  };
}

/** Extract hostname + port from URL string for logging and identification. */
export function extractHost(urlStr: string): string {
  try {
    return new URL(urlStr).host;
  } catch {
    return urlStr.replace(/^https?:\/\//, '').split('/')[0] || urlStr;
  }
}

/** Build primary and local loopback variants for a runner base URL. */
export function buildCandidateUrls(baseUrl: string, path: string): string[] {
  const base = baseUrl.replace(/\/+$/, '');
  const primary = `${base}${path}`;
  const variants = [primary];
  if (base.includes('127.0.0.1')) {
    variants.push(`${base.replace('127.0.0.1', 'localhost')}${path}`);
  } else if (base.includes('localhost')) {
    variants.push(`${base.replace('localhost', '127.0.0.1')}${path}`);
  }
  return variants;
}

/** Get runner groups rotated to a random start index on every call. */
export function getRotatedRunnerGroups(): { host: string; urls: string[] }[] {
  const urls = getRunnerUrls();
  if (urls.length === 0) {
    throw new RunnerError('UNAVAILABLE', 'No runner URLs configured.');
  }
  const groups = urls.map((u) => ({
    host: extractHost(u),
    urls: buildCandidateUrls(u, '/run'),
  }));
  if (groups.length <= 1) return groups;
  const startIndex = Math.floor(Math.random() * groups.length);
  return [...groups.slice(startIndex), ...groups.slice(0, startIndex)];
}

async function postToCandidateUrls(
  runnerGroups: { host: string; urls: string[] }[],
  secret: string,
  body: string,
  timeoutMs: number,
  runId: string,
): Promise<RunnerRunResult> {
  const headers = signedHeaders(body, secret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let had429 = false;
  let had503 = false;
  let lastNetworkError: unknown = null;

  for (let i = 0; i < runnerGroups.length; i++) {
    const { host, urls } = runnerGroups[i]!;
    const hasNextRunner = i < runnerGroups.length - 1;

    let runnerNetworkError: unknown = null;
    let runnerHandled = false;

    for (const url of urls) {
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
            had429 = true;
            runnerHandled = true;
            if (hasNextRunner) {
              logger.warn('runner.failover', { runId, host, reason: '429' });
            }
            break;
          }

          if (res.status === 503) {
            had503 = true;
            runnerHandled = true;
            if (hasNextRunner) {
              logger.warn('runner.failover', { runId, host, reason: '503' });
            }
            break;
          }

          // 400 -> INVALID, 401/403 -> REJECTED, any other non-ok status -> UNAVAILABLE
          // all thrown immediately with no failover.
          clearTimeout(timer);
          if (res.status === 400) {
            throw new HttpResponseError(
              new RunnerError('INVALID', `Runner rejected the payload: ${sanitizedBody || 'Bad Request'}`),
            );
          }
          if (res.status === 401 || res.status === 403) {
            throw new HttpResponseError(new RunnerError('REJECTED', 'Runner rejected the request.'));
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
          clearTimeout(timer);
          throw new HttpResponseError(new RunnerError('INVALID', 'Malformed runner response.'));
        }

        if (!json || !Array.isArray(json.results)) {
          clearTimeout(timer);
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
        runnerNetworkError = err;
        // Network error on this url variant, try next variant for this runner if any
      }
    }

    if (!runnerHandled && runnerNetworkError) {
      lastNetworkError = runnerNetworkError;
      if (hasNextRunner) {
        const reason =
          runnerNetworkError instanceof Error ? runnerNetworkError.message : String(runnerNetworkError);
        logger.warn('runner.failover', { runId, host, reason });
      }
    }
  }

  clearTimeout(timer);

  // When all runners have failed in the attempt:
  // - any runner answered 429 -> throw BUSY (as HttpResponseError, so no outer retry)
  // - all were network errors -> throw plain UNAVAILABLE as today (outer retry runs)
  // - otherwise (503s) -> UNAVAILABLE as HttpResponseError
  if (had429) {
    throw new HttpResponseError(new RunnerError('BUSY', 'Runner queue is full.'));
  }
  if (had503) {
    throw new HttpResponseError(new RunnerError('UNAVAILABLE', 'Runner responded with 503: Service Unavailable'));
  }
  const errorDetails =
    lastNetworkError instanceof Error
      ? `${lastNetworkError.name}: ${lastNetworkError.message}`
      : String(lastNetworkError);
  throw new RunnerError('UNAVAILABLE', `Runner is unreachable (${errorDetails}).`);
}

export async function runOnRunner(
  request: RunnerRequest,
  timeoutMs = runTimeoutFor(request.spec.tests.length),
  retryBackoffMs = 1500,
): Promise<RunnerRunResult> {
  const secret = requireEnv('runnerSecret');
  const body = JSON.stringify(request);

  // Each attempt gets the full per-test wait (see runTimeoutFor): a shorter one
  // would turn a slow but valid run into a timeout. The retry only gets what
  // is left of MAX_TOTAL_WAIT_MS.
  const startedAt = Date.now();

  try {
    const runnerGroups = getRotatedRunnerGroups();
    return await postToCandidateUrls(runnerGroups, secret, body, timeoutMs, request.runId);
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
      const retryGroups = getRotatedRunnerGroups();
      const result = await postToCandidateUrls(retryGroups, secret, body, retryTimeout, request.runId);
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

export interface RunnerHealthEntry {
  host: string;
  ok: boolean;
  detail?: string;
  active?: number;
  queued?: number;
  capacity?: number;
}

export interface RunnerPoolHealthResult {
  status: 'ok' | 'degraded' | 'down';
  runners: RunnerHealthEntry[];
}

export async function runnerPoolHealth(): Promise<RunnerPoolHealthResult> {
  const runnerUrls = getRunnerUrls();
  if (runnerUrls.length === 0) {
    return { status: 'down', runners: [] };
  }

  const runners = await Promise.all(
    runnerUrls.map(async (rUrl): Promise<RunnerHealthEntry> => {
      const host = extractHost(rUrl);
      const candidateUrls = buildCandidateUrls(rUrl, '/health');

      let lastDetail = 'unreachable';
      let active: number | undefined;
      let queued: number | undefined;
      let capacity: number | undefined;

      for (const url of candidateUrls) {
        try {
          const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
          if (!res.ok) {
            lastDetail = `status ${res.status}`;
            continue;
          }

          try {
            const data = await res.json();
            if (data && typeof data === 'object') {
              if (typeof data.active === 'number' && Number.isFinite(data.active)) active = data.active;
              if (typeof data.queued === 'number' && Number.isFinite(data.queued)) queued = data.queued;
              if (typeof data.capacity === 'number' && Number.isFinite(data.capacity)) capacity = data.capacity;
            }
          } catch {
            // ignore missing or malformed body
          }

          const credCheck = await checkRunnerCredentials(url.replace(/\/health$/, '/auth-check'));
          return {
            host,
            ok: credCheck.ok,
            ...(credCheck.detail ? { detail: credCheck.detail } : {}),
            ...(active !== undefined ? { active } : {}),
            ...(queued !== undefined ? { queued } : {}),
            ...(capacity !== undefined ? { capacity } : {}),
          };
        } catch (err) {
          lastDetail = sanitizeError(err, 120);
        }
      }

      return {
        host,
        ok: false,
        detail: lastDetail,
        ...(active !== undefined ? { active } : {}),
        ...(queued !== undefined ? { queued } : {}),
        ...(capacity !== undefined ? { capacity } : {}),
      };
    }),
  );

  const upCount = runners.filter((r) => r.ok).length;
  let status: 'ok' | 'degraded' | 'down';
  if (upCount === runners.length && runners.length > 0) {
    status = 'ok';
  } else if (upCount > 0) {
    status = 'degraded';
  } else {
    status = 'down';
  }

  return { status, runners };
}

export async function runnerHealth(): Promise<{ ok: boolean; detail?: string }> {
  const pool = await runnerPoolHealth();
  const total = pool.runners.length;
  if (total === 0) return { ok: false, detail: 'no runners configured' };
  const upCount = pool.runners.filter((r) => r.ok).length;
  const ok = upCount > 0;

  if (total > 1) {
    return { ok, detail: `${upCount}/${total} runners up` };
  }

  const single = pool.runners[0];
  if (!single) return { ok: false, detail: 'unreachable' };
  return {
    ok: single.ok,
    ...(single.detail ? { detail: single.detail } : {}),
  };
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
