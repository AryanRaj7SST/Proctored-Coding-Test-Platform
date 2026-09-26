import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runnerHealth, verifySignature, RUNNER_SECRET_MISMATCH, RunnerError } from '@/lib/runner-client';
import { adminRunnerHint, outcomeFromError } from '@/server/grading/runner-result';

/**
 * Production showed "Runner online" while every run failed. The badge now
 * proves the app's credentials work, and admin screens say what to fix.
 */
process.env.RUNNER_URL = 'https://runner.example.com';
process.env.RUNNER_SECRET = 'diagnostics-secret-at-least-32-characters';

type Reply = { status: number };
function stubFetch(replies: Record<string, Reply | Error>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const reply = replies[new URL(String(url)).pathname];
    if (!reply) throw new Error(`unexpected ${url}`);
    if (reply instanceof Error) throw reply;
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => ({}),
    } as Response;
  }) as typeof fetch;
  return calls;
}

describe('runnerHealth (the admin "Runner online" badge)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('is online only when the runner also accepts the signed credential check', async () => {
    const calls = stubFetch({ '/health': { status: 200 }, '/auth-check': { status: 200 } });
    expect(await runnerHealth()).toEqual({ ok: true });
    const check = calls.find((c) => c.url.endsWith('/auth-check'))!;
    const headers = check.init!.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${process.env.RUNNER_SECRET}`);
    expect(
      verifySignature(
        String(check.init!.body),
        process.env.RUNNER_SECRET!,
        headers['x-runner-timestamp']!,
        headers['x-runner-signature']!,
      ),
    ).toBe(true);
  });

  it('a reachable runner that rejects the secret is reported as offline, with the reason', async () => {
    stubFetch({ '/health': { status: 200 }, '/auth-check': { status: 401 } });
    expect(await runnerHealth()).toEqual({ ok: false, detail: RUNNER_SECRET_MISMATCH });
  });

  it('a runner deployed before the credential check stays online, flagged as unverified', async () => {
    stubFetch({ '/health': { status: 200 }, '/auth-check': { status: 404 } });
    expect(await runnerHealth()).toMatchObject({ ok: true, detail: expect.stringMatching(/not verified/) });
  });

  it('an unreachable runner is offline', async () => {
    stubFetch({ '/health': new TypeError('fetch failed') });
    expect(await runnerHealth()).toMatchObject({ ok: false });
  });
});

describe('adminRunnerHint (admin screens only)', () => {
  const hint = (err: RunnerError) => {
    const outcome = outcomeFromError(err);
    if (outcome.kind === 'SUCCESS') throw new Error('unexpected');
    return adminRunnerHint(outcome);
  };

  it('names the fix for each failure', () => {
    expect(hint(new RunnerError('REJECTED', 'Runner rejected the request.'))).toMatch(/RUNNER_SECRET/);
    expect(hint(new RunnerError('INVALID', 'Runner rejected the payload.'))).toMatch(/same commit/);
    expect(hint(new RunnerError('TIMEOUT', 'Runner request timed out.'))).toMatch(/wake/);
    expect(hint(new RunnerError('BUSY', 'Runner queue is full.'))).toMatch(/busy/);
    expect(hint(new RunnerError('UNAVAILABLE', 'Runner is unreachable (TypeError: fetch failed).'))).toMatch(
      /RUNNER_URL/,
    );
  });

  it('the student-facing message stays generic', () => {
    const outcome = outcomeFromError(new RunnerError('REJECTED', 'Runner rejected the request.'));
    expect(outcome.kind !== 'SUCCESS' && outcome.message).not.toMatch(/RUNNER_SECRET/);
  });
});

describe('Content-Security-Policy images', () => {
  const config = readFileSync(path.resolve(__dirname, '../../next.config.mjs'), 'utf8');
  const directive = (name: string) => config.match(new RegExp(`"${name} ([^"]+)"`))?.[1] ?? '';

  it('photos load from any https host, never over plain http', () => {
    expect(directive('img-src').split(' ')).toEqual(expect.arrayContaining(["'self'", 'data:', 'https:']));
    expect(directive('img-src')).not.toMatch(/http:|\*/);
  });

  it('scripts, connections and frames stay locked to this origin', () => {
    expect(directive('connect-src')).toBe("'self'");
    expect(directive('frame-src')).toBe("'self' blob:");
    expect(directive('script-src')).not.toMatch(/https:/);
  });
});
