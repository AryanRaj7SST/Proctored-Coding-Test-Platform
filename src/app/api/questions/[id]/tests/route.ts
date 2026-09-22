import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { handler, notFound, ok, readJson } from '@/lib/http';
import { parseOrThrow, questionTestInput } from '@/lib/validation';
import { z } from 'zod';
import { updateQuestion } from '@/server/services/questions';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Full test-suite read. Admin only -- test bodies are the answer key. */
export const GET = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  const question = await prisma.question.findUnique({
    where: { id },
    select: { id: true, tests: { orderBy: { order: 'asc' } } },
  });
  if (!question) throw notFound('Question not found.');
  return ok({ tests: question.tests });
});

/**
 * Replace the whole suite in one transaction (add / edit / delete / reorder).
 * A partial-write API would let the admin leave the suite in a half-valid
 * state, so the editor always PUTs the complete list.
 */
export const PUT = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = parseOrThrow(z.object({ tests: z.array(questionTestInput).max(40) }), await readJson(req));
  const question = await updateQuestion(id, { tests: body.tests });
  await recordAudit({
    userId: admin.id,
    action: 'question.tests_updated',
    entity: 'Question',
    entityId: id,
    metadata: { count: body.tests.length },
  });
  return ok({ tests: question.tests, validation: question.validation, points: question.points });
});
