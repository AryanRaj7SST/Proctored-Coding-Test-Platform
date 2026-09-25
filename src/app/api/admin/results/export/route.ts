import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler } from '@/lib/http';
import { parseOrThrow, resultsListInput } from '@/lib/validation';
import { listAllResults, resultsToCsv } from '@/server/services/results';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

/** CSV export of results (formula-injection safe). No student source code, no test internals. */
export const GET = handler(async (req: Request): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const {
    page: _page,
    pageSize: _pageSize,
    ...filter
  } = parseOrThrow(resultsListInput, Object.fromEntries(new URL(req.url).searchParams));
  const rows = await listAllResults(filter);
  await recordAudit({
    userId: admin.id,
    action: 'results.exported',
    entity: 'Result',
    metadata: { rows: rows.length, examId: filter.examId ?? null, view: filter.view },
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(resultsToCsv(rows), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="results-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
