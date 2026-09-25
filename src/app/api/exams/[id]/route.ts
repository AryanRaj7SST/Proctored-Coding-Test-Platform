import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, noContent, ok, readJson } from '@/lib/http';
import { examUpdateInput, parseOrThrow } from '@/lib/validation';
import { deleteExam, getExamForAdmin, updateExam } from '@/server/services/exams';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  return ok(await getExamForAdmin(id));
});

/** Edit settings and questions. Questions and marks lock once anyone has started. */
export const PATCH = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = parseOrThrow(examUpdateInput, await readJson(req));
  const { changed } = await updateExam(id, body);
  if (changed.length > 0) {
    await recordAudit({
      userId: admin.id,
      action: changed.includes('schedule') ? 'exam.schedule_changed' : 'exam.updated',
      entity: 'Exam',
      entityId: id,
      metadata: { changed },
    });
  }
  return ok(await getExamForAdmin(id));
});

/** Tests with sittings are archived rather than deleted so results survive. */
export const DELETE = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  await deleteExam(id);
  await recordAudit({ userId: admin.id, action: 'exam.deleted', entity: 'Exam', entityId: id });
  return noContent();
});
