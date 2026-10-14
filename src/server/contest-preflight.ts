import { prisma } from '@/lib/prisma';
import { env, requireEnv } from '@/lib/env';
import { signedHeaders } from '@/lib/runner-client';
import { OPEN_ACCESS_EMAILS } from '@/server/services/sessions';

export interface PreflightExam {
  id: string;
  title: string;
  accessMode: string;
  maxViolations: number;
  active: boolean;
  status: string;
  assignments: Array<{ id?: string; email?: string }>;
}

export interface PreflightOptions {
  examsProvider?: () => Promise<PreflightExam[]>;
  openAccessEmails?: ReadonlySet<string>;
  checkRunnerAuth?: () => Promise<{ ok: boolean; error?: string }>;
  isUpstashConfigured?: () => boolean;
}

export interface PreflightResult {
  ok: boolean;
  errors: string[];
}

export async function runContestPreflight(options: PreflightOptions = {}): Promise<PreflightResult> {
  const errors: string[] = [];

  // 1. Check Upstash Redis configuration
  const upstashCheck =
    options.isUpstashConfigured ??
    (() => {
      const hasUrl = Boolean(process.env.UPSTASH_REDIS_REST_URL || env.upstashRedisRestUrl);
      const hasToken = Boolean(process.env.UPSTASH_REDIS_REST_TOKEN || env.upstashRedisRestToken);
      const allowOverride = process.env.ALLOW_NO_RATE_LIMIT === 'true' || env.allowNoRateLimit;
      return (hasUrl && hasToken) || allowOverride;
    });

  if (!upstashCheck()) {
    errors.push(
      'Upstash Redis is not configured: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured (or ALLOW_NO_RATE_LIMIT=true set).',
    );
  }

  // 2. Check OPEN_ACCESS_EMAILS
  const openEmails = options.openAccessEmails ?? OPEN_ACCESS_EMAILS;
  if (openEmails.size > 0) {
    const list = Array.from(openEmails);
    console.error(`[Preflight] OPEN_ACCESS_EMAILS is non-empty (${list.length} accounts):`);
    for (const email of list) {
      console.error(`  - ${email}`);
    }
    errors.push(
      `OPEN_ACCESS_EMAILS is non-empty (${list.join(', ')}). All email bypasses must be removed before running a contest.`,
    );
  }

  // 3. Check Runner /auth-check
  const runnerCheck =
    options.checkRunnerAuth ??
    (async () => {
      try {
        const body = '{}';
        const url = `${env.runnerUrl.replace(/\/+$/, '')}/auth-check`;
        const headers = signedHeaders(body, requireEnv('runnerSecret'));
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          return { ok: true };
        }
        return { ok: false, error: `Runner /auth-check responded with HTTP ${res.status}` };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : 'Unknown runner error' };
      }
    });

  const runnerResult = await runnerCheck();
  if (!runnerResult.ok) {
    errors.push(`Runner /auth-check failed: ${runnerResult.error ?? 'Unreachable'}`);
  }

  // 4. Check Contest Exams
  const examsProvider =
    options.examsProvider ??
    (async () => {
      return (await prisma.exam.findMany({
        where: {
          active: true,
          status: { not: 'ARCHIVED' },
        },
        select: {
          id: true,
          title: true,
          accessMode: true,
          maxViolations: true,
          active: true,
          status: true,
          assignments: {
            select: { id: true, email: true },
          },
        },
      })) as PreflightExam[];
    });

  try {
    const exams = await examsProvider();
    for (const exam of exams) {
      if (exam.accessMode === 'ANY_AUTHENTICATED_USER') {
        errors.push(
          `Exam "${exam.title}" (${exam.id}) has accessMode ANY_AUTHENTICATED_USER. Contest exams must be ASSIGNED_USERS_ONLY.`,
        );
      }

      if (exam.maxViolations === 0) {
        errors.push(
          `Exam "${exam.title}" (${exam.id}) maxViolations is 0. Contests must enforce violation auto-submit (maxViolations > 0).`,
        );
      }

      if (!exam.assignments || exam.assignments.length === 0) {
        errors.push(
          `Exam "${exam.title}" (${exam.id}) has no assigned students. Contests must assign enrolled students.`,
        );
      }
    }
  } catch (err: unknown) {
    errors.push(`Failed to query contest exams from database: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
