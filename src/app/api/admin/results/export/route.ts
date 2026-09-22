import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler } from '@/lib/http';
import { listResults, resultsToCsv, type ResultFilter } from '@/server/services/results';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

/** CSV export of aggregated results. Contains no hidden test code or source. */
export const GET = handler(async (req: Request): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const min = url.searchParams.get('minPercentage');
  const status = url.searchParams.get('status');
  const filter: ResultFilter = {
    examId: url.searchParams.get('examId') ?? undefined,
    batch: url.searchParams.get('batch') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
    status: status === 'SUBMITTED' || status === 'IN_PROGRESS' ? status : undefined,
    minPercentage: min !== null && min !== '' && Number.isFinite(Number(min)) ? Number(min) : undefined,
  };

  const rows = await listResults(filter);
  await recordAudit({
    userId: admin.id,
    action: 'results.exported',
    entity: 'Result',
    metadata: { rows: rows.length, examId: filter.examId ?? null },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(resultsToCsv(rows), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="results-${stamp}.csv"`,
    },
  });
});
