import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok, readJson } from '@/lib/http';
import { parseOrThrow, questionStatusAction } from '@/lib/validation';
import { changeQuestionStatus, getQuestionForAdmin } from '@/server/services/questions';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const AUDIT_ACTION = {
  publish: 'question.published',
  unpublish: 'question.unpublished',
  archive: 'question.archived',
  unarchive: 'question.unarchived',
} as const;

/** Publish / unpublish / archive / restore a question (server-side transition rules). */
export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const { action } = parseOrThrow(questionStatusAction, await readJson(req, 1024));
  const before = (await getQuestionForAdmin(id)).status;
  const question = await changeQuestionStatus(id, action);
  if (question.status !== before) {
    await recordAudit({
      userId: admin.id,
      action: AUDIT_ACTION[action],
      entity: 'Question',
      entityId: id,
      metadata: { from: before, to: question.status, version: question.version },
    });
  }
  return ok(await getQuestionForAdmin(id));
});
