import { NextResponse } from 'next/server';
import { requireAttemptAccess, requireAuth } from '@/lib/authz';
import { handler, ok, readJson } from '@/lib/http';
import { attemptSaveInput, parseOrThrow } from '@/lib/validation';
import { saveAttemptCode } from '@/server/services/attempts';
import { studentQuestionOf } from '@/server/services/questions';
import { marksToNumber } from '@/server/grading/marks';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Restore an attempt after a refresh / reconnect / crash. */
export const GET = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireAuth();
  const { id } = await ctx.params;
  const attempt = await requireAttemptAccess(id, user, 'read');

  return ok({
    id: attempt.id,
    examId: attempt.examId,
    questionId: attempt.questionId,
    html: attempt.html,
    css: attempt.css,
    js: attempt.js,
    status: attempt.status,
    score: attempt.status === 'IN_PROGRESS' || !attempt.gradedAt ? null : marksToNumber(attempt.score),
    resultStatus: attempt.gradedAt ? attempt.resultStatus : null,
    maxScore: marksToNumber(attempt.maxScore),
    updatedAt: attempt.updatedAt.toISOString(),
    // Served from the frozen snapshot so the wording can never drift from the
    // tests that will grade it.
    question: studentQuestionOf(attempt),
  });
});

/** Autosave. Debounced client-side; conditional + idempotent server-side. */
export const PATCH = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireAuth();
  const { id } = await ctx.params;
  const body = parseOrThrow(attemptSaveInput, await readJson(req));
  // Autosave accepts the final flush sent as the countdown hits zero.
  const result = await saveAttemptCode(id, user.id, body, { allowGrace: true });
  return ok({ savedAt: result.updatedAt.toISOString(), saved: result.saved });
});
