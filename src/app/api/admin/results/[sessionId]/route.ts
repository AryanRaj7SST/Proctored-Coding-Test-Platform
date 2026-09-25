import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok } from '@/lib/http';
import { idSchema, parseOrThrow } from '@/lib/validation';
import { getSittingResultForAdmin } from '@/server/services/results';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ sessionId: string }> };

/** One sitting in full: totals, questions, test-case results and submitted code. */
export const GET = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { sessionId } = await ctx.params;
  return ok(await getSittingResultForAdmin(parseOrThrow(idSchema, sessionId)));
});
