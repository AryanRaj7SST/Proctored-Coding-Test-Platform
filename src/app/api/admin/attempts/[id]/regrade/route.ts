import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/authz';
import { handler, ok, readJson, tooManyRequests } from '@/lib/http';
import { parseOrThrow } from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';
import { regradeAttempt } from '@/server/grading/grade-attempt';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const regradeInput = z.object({
  reason: z.string().trim().min(1).max(300).default('Administrator regrade'),
  /** Regrade even an attempt that already earned full marks. */
  force: z.boolean().default(false),
});

/**
 * Regrade one submitted attempt against its own frozen snapshot: grading
 * pending after a runner outage, or a deliberate re-run. Audited with the
 * reason and the score before and after; concurrent gradings are refused.
 */
export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const limit = await rateLimit(`regrade:${admin.id}`, 30, 60_000);
  if (!limit.allowed) throw tooManyRequests('Please wait a moment before regrading again.');

  const body = parseOrThrow(regradeInput, await readJson(req, 4096));
  const result = await regradeAttempt(id, { adminId: admin.id, reason: body.reason, force: body.force });
  return ok({
    graded: result.graded,
    skipped: result.skipped,
    busy: result.busy ?? false,
    before: result.before,
    after: result.after,
    error: result.graded || result.skipped ? null : (result.error ?? null),
  });
});
