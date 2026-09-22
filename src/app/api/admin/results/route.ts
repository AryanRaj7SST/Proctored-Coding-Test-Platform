import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok } from '@/lib/http';
import { listResults, type ResultFilter } from '@/server/services/results';

export const dynamic = 'force-dynamic';

function filterFrom(url: URL): ResultFilter {
  const min = url.searchParams.get('minPercentage');
  const status = url.searchParams.get('status');
  return {
    examId: url.searchParams.get('examId') ?? undefined,
    batch: url.searchParams.get('batch') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
    status: status === 'SUBMITTED' || status === 'IN_PROGRESS' ? status : undefined,
    minPercentage: min !== null && min !== '' && Number.isFinite(Number(min)) ? Number(min) : undefined,
  };
}

export const GET = handler(async (req: Request): Promise<NextResponse> => {
  await requireAdmin();
  return ok({ rows: await listResults(filterFrom(new URL(req.url))) });
});
