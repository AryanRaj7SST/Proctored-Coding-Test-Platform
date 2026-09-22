import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { listResults } from '@/server/services/results';
import { ResultsTable } from '@/components/admin/ResultsTable';

export const dynamic = 'force-dynamic';

export default async function ResultsPage() {
  await requireAdmin();
  const [rows, exams, batchRows] = await Promise.all([
    listResults(),
    prisma.exam.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, title: true } }),
    prisma.user.findMany({
      where: { batch: { not: null } },
      distinct: ['batch'],
      select: { batch: true },
      orderBy: { batch: 'asc' },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">Results</h1>
        <p className="mt-1 text-sm text-slate-400">
          Aggregated from stored attempt scores. Exports contain assessment data only — no student source code and no
          hidden test content.
        </p>
      </div>
      <ResultsTable
        initialRows={rows}
        exams={exams}
        batches={batchRows.map((b) => b.batch).filter((b): b is string => Boolean(b))}
      />
    </div>
  );
}
