import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok, readJson } from '@/lib/http';
import { examStatusAction, parseOrThrow } from '@/lib/validation';
import { changeExamStatus, getExamForAdmin } from '@/server/services/exams';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';
// Closing a test finalises (and grades) its open sittings.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const AUDIT_ACTION = {
  publish: 'exam.published',
  unpublish: 'exam.unpublished',
  close: 'exam.closed',
  archive: 'exam.archived',
  unarchive: 'exam.unarchived',
} as const;

/** Publish / unpublish / close now / archive / restore a test. */
export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const { action } = parseOrThrow(examStatusAction, await readJson(req, 1024));
  const before = (await getExamForAdmin(id)).status;
  const exam = await changeExamStatus(id, action);
  if (exam.status !== before) {
    await recordAudit({
      userId: admin.id,
      action: AUDIT_ACTION[action],
      entity: 'Exam',
      entityId: id,
      metadata: { from: before, to: exam.status },
    });
  }
  return ok(await getExamForAdmin(id));
});
