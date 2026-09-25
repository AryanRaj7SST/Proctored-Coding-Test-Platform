import { NextResponse } from 'next/server';
import { requireAuth, requireTestAccess } from '@/lib/authz';
import { handler, ok, tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { endExam } from '@/server/services/finalization';

export const dynamic = 'force-dynamic';
// End Test grades every open answer after the response (next/server `after`).
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireAuth();
  const { id: examId } = await ctx.params;

  const limit = rateLimit(`end-exam:${user.id}`, 5, 60_000);
  if (!limit.allowed) throw tooManyRequests('Please wait a moment before trying again.');

  await requireTestAccess(examId, user);
  const result = await endExam(examId, user.id);
  return ok({ ok: true, ...result });
});
