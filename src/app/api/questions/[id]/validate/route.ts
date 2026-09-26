import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok, tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { validateQuestion } from '@/server/services/validation-runs';
import { recordAudit } from '@/server/services/audit';

// Re-evaluated on validation run
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** "Validate Question": run every enabled test case against the stored reference solution. */
export const POST = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const limit = await rateLimit(`validate:${admin.id}`, 10, 60_000);
  if (!limit.allowed) throw tooManyRequests('Too many validation runs. Please wait a moment.');

  const result = await validateQuestion(id);
  await recordAudit({
    userId: admin.id,
    action: 'question.validated',
    entity: 'Question',
    entityId: id,
    metadata: { ok: result.ok, passed: result.passedCount, total: result.totalCount, status: result.status },
  });
  return ok(result);
});
