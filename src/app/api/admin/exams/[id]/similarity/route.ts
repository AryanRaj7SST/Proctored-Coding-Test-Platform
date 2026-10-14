import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok, badRequest } from '@/lib/http';
import { getQuestionSimilarityReport } from '@/server/services/integrity/similarity';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id: examId } = await ctx.params;
  const url = new URL(req.url);
  const questionId = url.searchParams.get('questionId');
  const thresholdParam = url.searchParams.get('threshold');
  const threshold = thresholdParam ? Number(thresholdParam) : 0.75;

  if (!questionId) {
    throw badRequest('Missing required query parameter: questionId');
  }

  const report = await getQuestionSimilarityReport({
    examId,
    questionId,
    adminId: admin.id,
    threshold: Number.isFinite(threshold) ? threshold : 0.75,
  });

  return ok(report);
});
