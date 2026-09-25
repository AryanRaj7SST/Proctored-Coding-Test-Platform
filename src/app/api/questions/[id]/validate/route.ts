import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok, readJson, tooManyRequests } from '@/lib/http';
import { parseOrThrow, validateQuestionInput } from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';
import { validateQuestion } from '@/server/services/validation-runs';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** "Validate Question": run the suite against the reference solution. */
export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const limit = await rateLimit(`validate:${admin.id}`, 10, 60_000);
  if (!limit.allowed) throw tooManyRequests('Too many validation runs. Please wait a moment.');

  const body = parseOrThrow(validateQuestionInput, await readJson(req));
  const result = await validateQuestion(id, body);
  await recordAudit({
    userId: admin.id,
    action: 'question.validated',
    entity: 'Question',
    entityId: id,
    metadata: { ok: result.ok, passed: result.passedCount, total: result.totalCount },
  });
  return ok(result);
});
