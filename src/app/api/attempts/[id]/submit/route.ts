import { NextResponse } from 'next/server';
import { requireOwnedAttempt, requireUser } from '@/lib/authz';
import { forbidden, handler, ok, readJson, tooManyRequests } from '@/lib/http';
import { attemptSaveInput, parseOrThrow } from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { submitAttempt } from '@/server/services/attempts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Submit. Idempotent: a second call returns the stored grading rather than
 * re-scoring, so a double click or a retried request cannot change a score.
 */
export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const limit = rateLimit(`submit:${user.id}`, env.submitRateLimitPerMin, 60_000);
  if (!limit.allowed) throw tooManyRequests('Too many submissions. Please wait a moment.');

  const attempt = await requireOwnedAttempt(id, user);
  if (user.role === 'ADMIN' && attempt.userId !== user.id) {
    throw forbidden('Administrators cannot submit a student attempt.');
  }

  const raw = await readJson(req, env.maxCodeBytes * 3 + 4096);
  const hasCode = raw && typeof raw === 'object' && 'html' in (raw as object);
  const code = hasCode ? parseOrThrow(attemptSaveInput, raw) : undefined;

  const outcome = await submitAttempt({ attemptId: id, userId: user.id, code });
  return ok({
    alreadySubmitted: outcome.alreadySubmitted,
    score: outcome.score,
    maxScore: outcome.maxScore,
    percentage: outcome.percentage,
    passedCount: outcome.passedCount,
    failedCount: outcome.failedCount,
    totalCount: outcome.totalCount,
    results: outcome.results.map((r) => ({
      testName: r.testName,
      passed: r.passed,
      points: r.points,
      pointsAwarded: r.pointsAwarded,
      durationMs: r.durationMs,
      hidden: r.hidden,
      message: r.passed ? undefined : (r.message ?? 'This test did not pass.'),
    })),
  });
});
