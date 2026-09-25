import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/authz';
import { handler, ok, readJson, tooManyRequests } from '@/lib/http';
import { idSchema, parseOrThrow } from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';
import { regradePendingAttempts } from '@/server/grading/grade-attempt';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // regrades several answers in one request

const regradeInput = z.object({ examId: idSchema.optional() });

/**
 * Recovery after a runner outage: grade every submitted attempt whose grading
 * was deferred (optionally for one exam). Batches are capped; run again for more.
 */
export const POST = handler(async (req: Request): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const limit = rateLimit(`regrade-bulk:${admin.id}`, 5, 60_000);
  if (!limit.allowed) throw tooManyRequests('Please wait a moment before regrading again.');

  const body = parseOrThrow(regradeInput, await readJson(req, 4096));
  const result = await regradePendingAttempts({ examId: body.examId, limit: 50 });
  await recordAudit({
    userId: admin.id,
    action: 'attempts.regraded_pending',
    entity: 'Exam',
    entityId: body.examId ?? null,
    metadata: { attempted: result.attempted, graded: result.graded, failed: result.failed },
  });
  return ok(result);
});
