import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, noContent, ok, readJson } from '@/lib/http';
import { parseOrThrow, questionUpdateInput } from '@/lib/validation';
import { deleteQuestion, getQuestionForAdmin, updateQuestion } from '@/server/services/questions';
import { auditQuestionUpdate } from '@/server/services/question-audit';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Full question for the editor: reference solution and test definitions are admin-only. */
export const GET = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  return ok(await getQuestionForAdmin(id));
});

export const PATCH = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = parseOrThrow(questionUpdateInput, await readJson(req));
  const { question, impact } = await updateQuestion(id, body);
  await auditQuestionUpdate(admin.id, question, impact);
  return ok(await getQuestionForAdmin(question.id));
});

export const DELETE = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  await deleteQuestion(id);
  await recordAudit({ userId: admin.id, action: 'question.deleted', entity: 'Question', entityId: id });
  return noContent();
});
