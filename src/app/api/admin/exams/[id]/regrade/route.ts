import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok, readJson, tooManyRequests } from '@/lib/http';
import { bulkRegradeInput, parseOrThrow } from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';
import { regradeExam } from '@/server/grading/grade-attempt';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** Regrade a test's submitted attempts (pending / incomplete / all), with a reason. */
export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const limit = rateLimit(`regrade-exam:${admin.id}`, 5, 60_000);
  if (!limit.allowed) throw tooManyRequests('Please wait a moment before regrading again.');

  const body = parseOrThrow(bulkRegradeInput, await readJson(req, 4096));
  const summary = await regradeExam(id, { adminId: admin.id, ...body });
  await recordAudit({
    userId: admin.id,
    action: 'exam.regraded',
    entity: 'Exam',
    entityId: id,
    metadata: { mode: body.mode, force: body.force, reason: body.reason, ...summary },
  });
  return ok(summary);
});
