import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { resultsListInput } from '@/lib/validation';
import { listResults } from '@/server/services/results';
import { finalizeOverdueSittings } from '@/server/services/finalization';
import { logger, sanitizeError } from '@/lib/logger';
import { Card, CardBody, CardHeader } from '@/components/ui';
import { Pagination } from '@/components/admin/shared/Pagination';
import { ResultsTable } from '@/components/admin/ResultsTable';
import { ResultsFilters } from '@/components/admin/results/ResultsFilters';
import { BulkRegradeDialog } from '@/components/admin/results/BulkRegradeDialog';
import { resultsParams, resultsQueryString } from '@/components/admin/results/format';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

/** Parse the URL filters, dropping any value that fails validation instead of failing the page. */
function parseFilter(raw: SearchParams) {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.trim() !== '') clean[key] = value;
  }
  let parsed = resultsListInput.safeParse(clean);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) delete clean[String(issue.path[0])];
    parsed = resultsListInput.safeParse(clean);
  }
  return parsed.success ? parsed.data : resultsListInput.parse({});
}

/** "12 student results (best sitting each) · highest percentage first". */
function summaryLine(total: number, view: 'best' | 'all'): string {
  const plural = total === 1 ? '' : 's';
  const what =
    view === 'best' ? `${total} student result${plural} (best sitting each)` : `${total} sitting${plural}`;
  return `${what} · highest percentage first`;
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const filter = parseFilter(await searchParams);
  // Grade sittings their students abandoned without blocking page render (safe and idempotent).
  after(() =>
    finalizeOverdueSittings(filter.examId ? { examId: filter.examId, limit: 200 } : {}).catch((err) =>
      logger.warn('finalize.results_sweep_failed', { error: sanitizeError(err) }),
    ),
  );

  const [data, exams, batchRows] = await Promise.all([
    listResults(filter),
    prisma.exam.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, timezone: true },
    }),
    prisma.user.findMany({
      where: { batch: { not: null } },
      distinct: ['batch'],
      select: { batch: true },
      orderBy: { batch: 'asc' },
    }),
  ]);

  const selectedExam = filter.examId ? exams.find((e) => e.id === filter.examId) : undefined;
  const exportQuery = resultsQueryString({ ...filter, page: undefined, pageSize: undefined });
  const filtered = Boolean(
    filter.examId || filter.batch || filter.q || filter.state || filter.view === 'all',
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Results</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Each student is judged by their best graded sitting of a test. Scores are the stored grades
            &mdash; question marks split equally across enabled test cases &mdash; and are never edited by
            hand. Answers the runner could not grade show as &ldquo;grading pending&rdquo;, never 0.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedExam ? (
            <BulkRegradeDialog examId={selectedExam.id} examTitle={selectedExam.title} />
          ) : null}
          <a
            href={`/api/admin/results/export${exportQuery ? `?${exportQuery}` : ''}`}
            className="shadow-xs inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Export CSV
          </a>
        </div>
      </div>

      <ResultsFilters
        exams={exams.map((e) => ({ id: e.id, title: e.title }))}
        batches={batchRows.map((b) => b.batch).filter((b): b is string => Boolean(b))}
        pageSize={filter.pageSize}
        value={{
          examId: filter.examId ?? '',
          batch: filter.batch ?? '',
          q: filter.q ?? '',
          state: filter.state ?? '',
          view: filter.view,
        }}
      />

      <Card>
        <CardHeader
          title={selectedExam ? selectedExam.title : 'All tests'}
          subtitle={summaryLine(data.total, filter.view)}
        />
        <CardBody className="p-0">
          <ResultsTable
            rows={data.rows}
            timeZones={Object.fromEntries(exams.map((e) => [e.id, e.timezone]))}
            view={filter.view}
            filtered={filtered}
          />
        </CardBody>
      </Card>

      <Pagination
        basePath="/admin/results"
        params={resultsParams({ ...filter, page: undefined })}
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
      />
    </div>
  );
}
