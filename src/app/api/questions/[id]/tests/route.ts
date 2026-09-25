import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/authz';
import { handler, ok, readJson } from '@/lib/http';
import { parseOrThrow, questionTestInput } from '@/lib/validation';
import { getQuestionForAdmin, updateQuestion } from '@/server/services/questions';
import { auditQuestionUpdate } from '@/server/services/question-audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Full test-suite read (admin only). */
export const GET = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  const question = await getQuestionForAdmin(id);
  return ok({ tests: question.tests });
});

/**
 * Replace the whole suite in one transaction (add / edit / delete / reorder /
 * enable / disable). A partial-write API would let the admin leave the suite
 * half-valid, so the editor always PUTs the complete list.
 */
export const PUT = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = parseOrThrow(z.object({ tests: z.array(questionTestInput).max(40) }), await readJson(req));
  const { question, impact } = await updateQuestion(id, { tests: body.tests });
  await auditQuestionUpdate(admin.id, question, impact);
  const fresh = await getQuestionForAdmin(id);
  return ok({
    tests: fresh.tests,
    validation: fresh.validation,
    status: fresh.status,
    blockers: fresh.blockers,
  });
});
