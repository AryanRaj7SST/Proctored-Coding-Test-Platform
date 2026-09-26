/**
 * Normalise whatever came back from the runner -- a response body or a thrown
 * error -- into exactly one outcome:
 *
 *   SUCCESS      the run completed with a boolean verdict for every enabled test
 *   FAILED       the runner reported a failed run (e.g. the browser crashed)
 *   TIMEOUT      the run, or the request for it, ran out of time
 *   UNAVAILABLE  the runner could not be reached, was busy, or refused us
 *   MALFORMED    a response we cannot trust (missing or non-boolean verdicts)
 *
 * Only SUCCESS may become a score. Every other outcome is an infrastructure
 * failure: the attempt stays "grading pending" and is never scored 0.
 * Dependency-free apart from the runner error type.
 */
import type { ErrorCode } from '@/lib/errors';
import { RunnerError, runnerErrorMessage } from '@/lib/runner-client';

export interface TestVerdict {
  passed: boolean;
  message?: string;
  expected?: string;
  actual?: string;
  durationMs: number;
}

export type RunnerFailureKind = 'FAILED' | 'TIMEOUT' | 'UNAVAILABLE' | 'MALFORMED';

export type RunnerOutcome =
  | {
      kind: 'SUCCESS';
      verdicts: Map<string, TestVerdict>;
      consoleLogs: string[];
      durationMs: number;
    }
  | {
      kind: RunnerFailureKind;
      /** Admin-facing detail. Never shown to students. */
      detail: string;
      /** Student-safe explanation and machine code for the API. */
      message: string;
      code: ErrorCode;
      consoleLogs: string[];
    };

const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value.slice(0, max) : undefined;

function logsOf(result: Record<string, unknown>): string[] {
  return Array.isArray(result.consoleLogs)
    ? result.consoleLogs.filter((l): l is string => typeof l === 'string').slice(0, 100)
    : [];
}

function failure(
  kind: RunnerFailureKind,
  detail: string,
  consoleLogs: string[] = [],
  busy = false,
): RunnerOutcome {
  const code: ErrorCode = kind === 'TIMEOUT' ? 'RUNNER_TIMEOUT' : busy ? 'RUNNER_BUSY' : 'RUNNER_UNAVAILABLE';
  const message = runnerErrorMessage(kind === 'TIMEOUT' ? 'TIMEOUT' : busy ? 'BUSY' : 'UNAVAILABLE');
  return { kind, detail: detail.slice(0, 1000), message, code, consoleLogs };
}

/** Classify a runner response body against the tests that were sent. */
export function outcomeFromResult(raw: unknown, testIds: string[]): RunnerOutcome {
  if (!raw || typeof raw !== 'object') return failure('MALFORMED', 'Runner returned no body.');
  const result = raw as Record<string, unknown>;
  const consoleLogs = logsOf(result);

  if (result.status === 'TIMEOUT') return failure('TIMEOUT', 'Runner reported a run timeout.', consoleLogs);
  if (result.status === 'FAILED') {
    return failure(
      'FAILED',
      `Runner reported a failed run: ${text(result.error, 500) ?? 'no detail'}`,
      consoleLogs,
    );
  }
  if (result.status !== 'COMPLETED') {
    return failure('MALFORMED', `Runner reported status ${String(result.status)}.`, consoleLogs);
  }
  if (!Array.isArray(result.results)) return failure('MALFORMED', 'Runner returned no results.', consoleLogs);

  const byId = new Map<unknown, Record<string, unknown>>();
  for (const row of result.results as unknown[]) {
    if (row && typeof row === 'object')
      byId.set((row as Record<string, unknown>).id, row as Record<string, unknown>);
  }

  const verdicts = new Map<string, TestVerdict>();
  for (const id of testIds) {
    const row = byId.get(id);
    if (!row || typeof row.passed !== 'boolean') {
      return failure('MALFORMED', 'Runner returned incomplete results.', consoleLogs);
    }
    verdicts.set(id, {
      passed: row.passed,
      message: row.passed ? undefined : text(row.message, 1000),
      expected: row.passed ? undefined : text(row.expected, 300),
      actual: row.passed ? undefined : text(row.actual, 300),
      durationMs: Number.isFinite(row.durationMs) ? Math.max(0, Math.round(row.durationMs as number)) : 0,
    });
  }

  const durationMs = Number.isFinite(result.durationMs) ? Math.round(result.durationMs as number) : 0;
  return { kind: 'SUCCESS', verdicts, consoleLogs, durationMs };
}

/**
 * What an administrator should check after a runner failure. Admin screens
 * only (question validation, test logs): students see `message`, never this.
 */
export function adminRunnerHint(outcome: Exclude<RunnerOutcome, { kind: 'SUCCESS' }>): string {
  const d = outcome.detail;
  if (/rejected the request/i.test(d)) {
    return 'The runner refused the app credentials: RUNNER_SECRET must be identical on the app and the runner (redeploy the app after changing an environment variable).';
  }
  if (/rejected the payload/i.test(d)) {
    return 'The runner refused the test specification: deploy the runner from the same commit as the app.';
  }
  if (/queue is full/i.test(d)) return 'The runner is busy with other runs. Try again shortly.';
  if (outcome.kind === 'TIMEOUT') {
    return 'The runner did not answer in time. A sleeping free instance can take about a minute to wake: try again.';
  }
  if (/unreachable/i.test(d)) return `The app could not reach RUNNER_URL: ${d}`;
  return `Runner detail: ${d}`;
}

/** Classify an error thrown while calling the runner. */
export function outcomeFromError(err: unknown): RunnerOutcome {
  if (err instanceof RunnerError) {
    switch (err.code) {
      case 'TIMEOUT':
        return failure('TIMEOUT', err.message);
      case 'INVALID':
        return failure('MALFORMED', err.message);
      case 'BUSY':
        return failure('UNAVAILABLE', err.message, [], true);
      default:
        return failure('UNAVAILABLE', err.message);
    }
  }
  return failure('UNAVAILABLE', err instanceof Error ? `${err.name}: ${err.message}` : String(err));
}
