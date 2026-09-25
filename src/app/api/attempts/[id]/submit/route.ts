import { NextResponse } from 'next/server';
import { requireAttemptAccess, requireAuth } from '@/lib/authz';
import { handler, ok, readJson, tooManyRequests } from '@/lib/http';
import { attemptSaveInput, parseOrThrow } from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { toStudentOutcome } from '@/lib/outcome';
import { submitAttempt } from '@/server/services/attempts';

export const dynamic = 'force-dynamic';
// Grades one answer inline: same budget as a run.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Submit. Idempotent: a second call returns the stored grading rather than
 * re-scoring, so a double click or a retried request cannot change a score.
 * If the runner fails, the submission still stands with `gradingPending`.
 */
export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireAuth();
  const { id } = await ctx.params;

  const limit = await rateLimit(`submit:${user.id}`, env.submitRateLimitPerMin, 60_000);
  if (!limit.allowed) throw tooManyRequests('Too many submissions. Please wait a moment.');

  await requireAttemptAccess(id, user, 'write');

  const raw = await readJson(req, env.maxCodeBytes * 3 + 4096);
  // An empty body submits the autosaved code; anything else must be exactly the code.
  const hasBody = raw !== null && typeof raw === 'object' && Object.keys(raw as object).length > 0;
  const code = hasBody ? parseOrThrow(attemptSaveInput, raw) : undefined;

  const outcome = await submitAttempt({ attemptId: id, userId: user.id, code });
  const student = toStudentOutcome(outcome);
  return ok({
    alreadySubmitted: outcome.alreadySubmitted,
    // The submission is recorded but the grader could not run: no score yet
    // (never a silent 0). An administrator can regrade once the runner is back.
    gradingPending: outcome.gradingPending,
    gradingError: outcome.gradingPending ? (outcome.gradingError ?? null) : null,
    score: outcome.gradingPending ? null : student.score,
    questionStatus: outcome.gradingPending ? null : student.questionStatus,
    maxScore: student.maxScore,
    percentage: student.percentage,
    passedCount: student.passedCount,
    failedCount: student.failedCount,
    totalCount: student.totalCount,
    results: student.results,
  });
});
