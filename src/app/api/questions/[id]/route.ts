import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { handler, noContent, notFound, ok, readJson } from '@/lib/http';
import { parseOrThrow, questionUpdateInput } from '@/lib/validation';
import { deleteQuestion, publishBlockers, updateQuestion } from '@/server/services/questions';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  const question = await prisma.question.findUnique({
    where: { id },
    include: { tests: { orderBy: { order: 'asc' } } },
  });
  if (!question) throw notFound('Question not found.');
  return ok({ ...question, blockers: publishBlockers(question) });
});

export const PATCH = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = parseOrThrow(questionUpdateInput, await readJson(req));
  const question = await updateQuestion(id, body);
  await recordAudit({
    userId: admin.id,
    action: 'question.updated',
    entity: 'Question',
    entityId: id,
    metadata: { version: question.version },
  });
  return ok(question);
});

export const DELETE = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  await deleteQuestion(id);
  await recordAudit({ userId: admin.id, action: 'question.deleted', entity: 'Question', entityId: id });
  return noContent();
});
