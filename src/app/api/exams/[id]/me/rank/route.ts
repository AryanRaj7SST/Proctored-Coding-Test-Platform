import { NextResponse } from 'next/server';
import { requireAuth, requireTestAccess } from '@/lib/authz';
import { handler, ok, tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { getStudentRankSummary } from '@/server/services/leaderboard';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireAuth();
  const { id: examId } = await ctx.params;

  // Rate-limit per user (e.g. 120 requests per minute for widgets)
  const limit = await rateLimit(`leaderboard-rank:${user.id}`, 120, 60_000);
  if (!limit.allowed) throw tooManyRequests('Too many rank requests. Please slow down.');

  // Access check: non-assigned or non-permitted student receives 404 (notFound)
  await requireTestAccess(examId, user);

  const summary = await getStudentRankSummary(examId, user.id, user.role === 'ADMIN');

  return ok({
    rank: summary.rank,
    score: summary.score,
    maxScore: summary.maxScore,
  });
});
