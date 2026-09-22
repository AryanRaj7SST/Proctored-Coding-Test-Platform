import { NextResponse } from 'next/server';
import { requireOwnedAttempt, requireUser } from '@/lib/authz';
import { handler, ok, readJson } from '@/lib/http';
import { attemptSaveInput, parseOrThrow } from '@/lib/validation';
import { saveAttemptCode, snapshotOf } from '@/server/services/attempts';
import { toStudentQuestion } from '@/server/services/questions';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Restore an attempt after a refresh / reconnect / crash. */
export const GET = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const attempt = await requireOwnedAttempt(id, user);
  const snapshot = snapshotOf(attempt);

  return ok({
    id: attempt.id,
    examId: attempt.examId,
    questionId: attempt.questionId,
    html: attempt.html,
    css: attempt.css,
    js: attempt.js,
    status: attempt.status,
    score: attempt.status === 'IN_PROGRESS' ? null : attempt.score,
    maxScore: attempt.maxScore,
    updatedAt: attempt.updatedAt.toISOString(),
    // Served from the frozen snapshot so the wording can never drift from the
    // tests that will grade it.
    question: toStudentQuestion({
      id: snapshot.questionId,
      title: snapshot.title,
      slug: snapshot.slug,
      description: snapshot.description,
      instructions: snapshot.instructions,
      mediaUrl: snapshot.mediaUrl,
      difficulty: snapshot.difficulty,
      points: snapshot.points,
      starterHtml: snapshot.starterHtml,
      starterCss: snapshot.starterCss,
      starterJs: snapshot.starterJs,
      tests: snapshot.tests,
    }),
  });
});

/** Autosave. Debounced client-side; conditional + idempotent server-side. */
export const PATCH = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = parseOrThrow(attemptSaveInput, await readJson(req));
  const result = await saveAttemptCode(id, user.id, body);
  return ok({ savedAt: result.updatedAt.toISOString(), saved: result.saved });
});
