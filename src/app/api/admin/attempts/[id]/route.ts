import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/authz';
import { handler, ok, readJson } from '@/lib/http';
import { parseOrThrow } from '@/lib/validation';
import { getAttemptReview, saveAttemptFeedback } from '@/server/services/attempt-review';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// Strict: this endpoint never edits a score, so a `score` field is rejected, not ignored.
const feedbackInput = z.object({ feedback: z.string().max(5000) }).strict();

/** Everything an admin needs to review one attempt. */
export const GET = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  return ok(await getAttemptReview(id));
});

/** Reviewer feedback. Scores are never edited by hand -- regrade instead. */
export const PATCH = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const { feedback } = parseOrThrow(feedbackInput, await readJson(req, 16_384));
  return ok({ feedback: await saveAttemptFeedback(id, admin, feedback) });
});
