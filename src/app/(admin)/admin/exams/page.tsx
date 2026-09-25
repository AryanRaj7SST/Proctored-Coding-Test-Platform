import Link from 'next/link';
import { requireAdmin } from '@/lib/authz';
import { examListInput } from '@/lib/validation';
import { listExamsForAdmin } from '@/server/services/exams';
import { Card, CardBody, EmptyState, Table, Td, Th } from '@/components/ui';
import { utcOffsetLabel } from '@/components/admin/exam-types';
import {
  ACCESS_LABEL,
  formatMarks,
  formatMinutes,
  PHASE_TABS,
  plural,
  scheduleRange,
  testsHref,
} from '@/components/admin/tests/format';
import { PhaseBadge } from '@/components/admin/tests/shared';
import { TestListToolbar } from '@/components/admin/tests/TestListToolbar';
import type { TestListResponse, TestPhase } from '@/components/admin/tests/types';
import { asJson } from './_lib/data';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const EMPTY_COPY: Record<'' | TestPhase, { title: string; description: string }> = {
  '': {
    title: 'No tests yet',
    description: 'Create a test, add published questions, schedule it and publish.',
  },
  UPCOMING: {
    title: 'Nothing upcoming',
    description: 'Published tests whose start time is in the future appear here.',
  },
  ACTIVE: {
    title: 'No active tests',
    description: 'Published tests that students can start right now appear here.',
  },
  ENDED: {
    title: 'No completed tests',
    description: 'Tests appear here after their closing time or when you close them.',
  },
  DRAFT: { title: 'No drafts', description: 'New tests start as drafts until you publish them.' },
  ARCHIVED: {
    title: 'No archived tests',
    description: 'Archived tests are hidden from students; their results are kept.',
  },
};

export default async function TestsPage({
  searchParams,
}: {
  searchParams: Promise<{ phase?: string; q?: string; page?: string }>;
}) {
  await requireAdmin();
  const raw = await searchParams;
  const parsed = examListInput.safeParse({
    phase: raw.phase || undefined,
    q: raw.q || undefined,
    page: raw.page || 1,
    pageSize: PAGE_SIZE,
  });
  const filter = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };
  const phase = (filter.phase ?? '') as '' | TestPhase;
  const q = filter.q ?? '';

  const data = asJson<TestListResponse>(await listExamsForAdmin(filter));
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.total, data.page * data.pageSize);
  const tabLabel = PHASE_TABS.find((t) => t.id === phase)?.label ?? 'All';
  const empty = q
    ? { title: `No tests match “${q}”`, description: 'Try another title, or search in a different tab.' }
    : EMPTY_COPY[phase];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Tests</h1>
          <p className="mt-1 text-sm text-slate-400">
            Build tests from published questions, schedule them, choose who can take them, then publish.
          </p>
        </div>
        <Link
          href="/admin/exams/new"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Create test
        </Link>
      </div>

      <TestListToolbar phase={phase} q={q} />

      <Card>
        <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">{tabLabel} tests</h2>
          <p className="text-xs text-slate-400">
            {data.total === 0 ? 'None' : `${from}–${to} of ${data.total}`}
          </p>
        </div>
        <CardBody className="p-0">
          {data.items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={empty.title}
                description={empty.description}
                action={
                  !q && (phase === '' || phase === 'DRAFT') ? (
                    <Link href="/admin/exams/new" className="text-xs text-brand-300 hover:underline">
                      Create a test
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Test</Th>
                  <Th>Phase</Th>
                  <Th>Schedule</Th>
                  <Th>Duration</Th>
                  <Th>Questions</Th>
                  <Th>Marks</Th>
                  <Th>Access</Th>
                  <Th>Assigned / started</Th>
                  <Th>
                    <span className="sr-only">Links</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((t) => {
                  const zoneAt = new Date(t.startTime ?? t.endTime ?? t.publishedAt ?? Date.now()).getTime();
                  return (
                    <tr key={t.id} className="hover:bg-ink-900/60">
                      <Td className="max-w-[16rem]">
                        <Link
                          href={`/admin/exams/${t.id}`}
                          className="font-medium text-slate-100 hover:underline"
                        >
                          {t.title}
                        </Link>
                        {t.description ? (
                          <p className="truncate text-xs text-slate-500">{t.description}</p>
                        ) : null}
                      </Td>
                      <Td>
                        <PhaseBadge phase={t.phase} />
                      </Td>
                      <Td className="whitespace-nowrap text-xs">
                        <span className="block text-slate-300">
                          {t.startTime || t.endTime
                            ? scheduleRange(t.startTime, t.endTime, t.timezone)
                            : 'Not scheduled'}
                        </span>
                        <span className="block text-slate-500">
                          {t.timezone} ({utcOffsetLabel(t.timezone, zoneAt)})
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-slate-400">{formatMinutes(t.durationMinutes)}</Td>
                      <Td className="text-slate-400">{t.questionCount}</Td>
                      <Td className="text-slate-400">{formatMarks(t.totalMarks)}</Td>
                      <Td className="text-xs text-slate-400">
                        {ACCESS_LABEL[t.accessMode]}
                        {t.maxAttempts > 1 ? (
                          <span className="block text-slate-500">{plural(t.maxAttempts, 'attempt')}</span>
                        ) : null}
                      </Td>
                      <Td className="whitespace-nowrap text-slate-400">
                        {t.accessMode === 'ANY_AUTHENTICATED_USER' && t.assignedCount === 0
                          ? '—'
                          : t.assignedCount}
                        {' / '}
                        {t.sittingCount > 0 ? (
                          <Link
                            href={`/admin/attempts?examId=${t.id}`}
                            className="text-brand-300 hover:underline"
                            title="View attempts for this test"
                          >
                            {t.sittingCount}
                          </Link>
                        ) : (
                          0
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-xs">
                        <div className="flex gap-3">
                          <Link href={`/admin/exams/${t.id}`} className="text-brand-300 hover:underline">
                            Edit
                          </Link>
                          <Link
                            href={`/admin/exams/${t.id}/assignments`}
                            className="text-brand-300 hover:underline"
                          >
                            Assign
                          </Link>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between text-xs text-slate-400">
          <span>
            Page {data.page} of {pages}
          </span>
          <div className="flex gap-2">
            {data.page > 1 ? (
              <Link
                href={testsHref({ phase, q, page: data.page - 1 })}
                className="rounded-md px-3 py-1.5 text-slate-300 ring-1 ring-inset ring-ink-600 hover:bg-ink-800"
              >
                ← Previous
              </Link>
            ) : null}
            {data.page < pages ? (
              <Link
                href={testsHref({ phase, q, page: data.page + 1 })}
                className="rounded-md px-3 py-1.5 text-slate-300 ring-1 ring-inset ring-ink-600 hover:bg-ink-800"
              >
                Next →
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
