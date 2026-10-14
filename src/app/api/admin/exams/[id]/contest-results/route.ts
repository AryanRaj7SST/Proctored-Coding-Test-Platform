import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok } from '@/lib/http';
import { getExamContestStandings, contestResultsToCsv } from '@/server/services/integrity/contest-ranking';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id: examId } = await ctx.params;
  const url = new URL(req.url);
  const format = url.searchParams.get('format');

  const standings = await getExamContestStandings(examId);

  await recordAudit({
    userId: admin.id,
    action: 'contest_results.viewed',
    entity: 'Exam',
    entityId: examId,
    metadata: { count: standings.length, format: format ?? 'json' },
  });

  if (format === 'csv') {
    const stamp = new Date().toISOString().slice(0, 10);
    const csv = contestResultsToCsv(standings);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="contest-standings-${examId}-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return ok({
    examId,
    totalParticipants: standings.length,
    standings,
  });
});
