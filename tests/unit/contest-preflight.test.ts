import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runContestPreflight } from '@/server/contest-preflight';

describe('Contest Preflight Checks', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  const validExam = {
    id: 'exam-1',
    title: 'Final Contest 2026',
    accessMode: 'ASSIGNED_USERS_ONLY' as const,
    maxViolations: 3,
    active: true,
    status: 'PUBLISHED' as const,
    assignments: [{ id: 'a1', email: 'student1@example.com' }],
  };

  it('fails if an exam has accessMode ANY_AUTHENTICATED_USER', async () => {
    const exams = [
      {
        ...validExam,
        accessMode: 'ANY_AUTHENTICATED_USER' as const,
      },
    ];

    const result = await runContestPreflight({
      examsProvider: async () => exams,
      openAccessEmails: new Set(),
      checkRunnerAuth: async () => ({ ok: true }),
      isUpstashConfigured: () => true,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('ANY_AUTHENTICATED_USER'))).toBe(true);
  });

  it('fails if an exam has maxViolations === 0', async () => {
    const exams = [
      {
        ...validExam,
        maxViolations: 0,
      },
    ];

    const result = await runContestPreflight({
      examsProvider: async () => exams,
      openAccessEmails: new Set(),
      checkRunnerAuth: async () => ({ ok: true }),
      isUpstashConfigured: () => true,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('maxViolations is 0'))).toBe(true);
  });

  it('fails if an exam has no assigned students', async () => {
    const exams = [
      {
        ...validExam,
        assignments: [],
      },
    ];

    const result = await runContestPreflight({
      examsProvider: async () => exams,
      openAccessEmails: new Set(),
      checkRunnerAuth: async () => ({ ok: true }),
      isUpstashConfigured: () => true,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('no assigned students'))).toBe(true);
  });

  it('fails and prints emails if OPEN_ACCESS_EMAILS is non-empty', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runContestPreflight({
      examsProvider: async () => [validExam],
      openAccessEmails: new Set(['bypassed@example.com', 'admin-bypass@example.com']),
      checkRunnerAuth: async () => ({ ok: true }),
      isUpstashConfigured: () => true,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('OPEN_ACCESS_EMAILS is non-empty'))).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('bypassed@example.com'));
  });

  it('fails if runner /auth-check fails', async () => {
    const result = await runContestPreflight({
      examsProvider: async () => [validExam],
      openAccessEmails: new Set(),
      checkRunnerAuth: async () => ({ ok: false, error: 'RUNNER_SECRET mismatch (HTTP 401)' }),
      isUpstashConfigured: () => true,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('Runner /auth-check failed'))).toBe(true);
  });

  it('fails if Upstash is not configured and ALLOW_NO_RATE_LIMIT != true', async () => {
    delete process.env.ALLOW_NO_RATE_LIMIT;

    const result = await runContestPreflight({
      examsProvider: async () => [validExam],
      openAccessEmails: new Set(),
      checkRunnerAuth: async () => ({ ok: true }),
      isUpstashConfigured: () => false,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('Upstash Redis is not configured'))).toBe(true);
  });

  it('passes if all preflight checks succeed', async () => {
    const result = await runContestPreflight({
      examsProvider: async () => [validExam],
      openAccessEmails: new Set(),
      checkRunnerAuth: async () => ({ ok: true }),
      isUpstashConfigured: () => true,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
