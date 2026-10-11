import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { handler, ok } from '@/lib/http';
import { regradeAttemptsForQuestion } from '@/server/grading/grade-attempt';
import { changeQuestionStatus, publishBlockers, getQuestionForAdmin } from '@/server/services/questions';
import { conflict } from '@/lib/errors';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Count affected attempts for a question before confirming regrade. */
export const GET = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  const totalAttempts = await prisma.attempt.count({
    where: { questionId: id, status: { not: 'IN_PROGRESS' } },
  });
  return ok({ totalAttempts });
});

/** Republish a question and regrade all historical attempts against the current test suite. */
export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const question = await getQuestionForAdmin(id);
  const blockers = publishBlockers(question);
  if (blockers.length > 0) {
    throw conflict(`This question cannot be published yet. ${blockers[0]}`);
  }

  if (question.status !== 'PUBLISHED') {
    await changeQuestionStatus(id, 'publish');
  }

  const summary = await regradeAttemptsForQuestion(id, {
    includeGraded: true,
    adminId: admin.id,
    reason: 'Save & Republish (recalculate affected students)',
  });

  return ok(summary);
});
