import Link from 'next/link';
import { Plus } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { listQuestions } from '@/server/services/questions';
import { Badge, Card, CardBody, EmptyState, StatusBadge, Table, Td, Th } from '@/components/ui';
import { QuestionFilters } from '@/components/admin/questions/QuestionFilters';
import { questionListHref, type QuestionListFilters } from '@/components/admin/questions/list-href';
import { formatMarks } from '@/components/admin/questions/marks';
import {
  DIFFICULTIES,
  QUESTION_STATUSES,
  type Difficulty,
  type QuestionStatus,
} from '@/components/admin/questions/types';
import { cn, formatDateTime } from '@/lib/utils';
import { loadQuestionTaxonomy } from './_lib/taxonomy';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const STATUS_TABS: { value: QuestionStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'VALIDATED', label: 'Validated' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Archived' },
];

type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined): string | undefined => {
  const value = Array.isArray(v) ? v[0] : v;
  return value?.trim() ? value.trim() : undefined;
};

/** Untrusted query string -> safe filters (unknown values are dropped, lengths capped). */
function parseFilters(sp: SearchParams) {
  const status = one(sp.status);
  const difficulty = one(sp.difficulty);
  const page = Number(one(sp.page) ?? '1');
  return {
    status: QUESTION_STATUSES.includes(status as QuestionStatus) ? (status as QuestionStatus) : undefined,
    difficulty: DIFFICULTIES.some((d) => d.value === difficulty) ? (difficulty as Difficulty) : undefined,
    q: one(sp.q)?.slice(0, 120),
    category: one(sp.category)?.slice(0, 60),
    tag: one(sp.tag)?.slice(0, 30),
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const filters = parseFilters(await searchParams);
  const [list, statusCounts, taxonomy] = await Promise.all([
    listQuestions({ ...filters, pageSize: PAGE_SIZE }),
    prisma.question.groupBy({ by: ['status'], _count: { _all: true } }),
    loadQuestionTaxonomy(),
  ]);

  const countOf = (status: QuestionStatus | '') =>
    statusCounts
      .filter((row) => status === '' || row.status === status)
      .reduce((sum, row) => sum + row._count._all, 0);
  const bankSize = countOf('');
  const linkFilters: QuestionListFilters = {
    status: filters.status,
    q: filters.q,
    difficulty: filters.difficulty,
    category: filters.category,
    tag: filters.tag,
  };
  const hasFilters = Boolean(filters.q || filters.difficulty || filters.category || filters.tag);
  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const first = list.total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(list.total, filters.page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Questions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Draft → validate against a reference solution → publish. Only published questions can be added to
            tests.
          </p>
        </div>
        <Link
          href="/admin/questions/new"
          className="shadow-xs inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create question
        </Link>
      </div>

      <nav aria-label="Question status" className="overflow-x-auto">
        <ul className="flex min-w-max items-center gap-1 border-b border-slate-200">
          {STATUS_TABS.map((tab) => {
            const active = (filters.status ?? '') === tab.value;
            return (
              <li key={tab.value || 'all'}>
                <Link
                  href={questionListHref({ ...linkFilters, status: tab.value })}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition',
                    active
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800',
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      active ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {countOf(tab.value)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Card>
        <CardBody className="space-y-3">
          <QuestionFilters filters={linkFilters} categories={taxonomy.categories} tags={taxonomy.tags} />
        </CardBody>
        <div className="border-t border-slate-200">
          {list.items.length === 0 ? (
            <div className="p-4">
              {bankSize === 0 ? (
                <EmptyState
                  title="No questions yet"
                  description="Create a question, add behaviour test cases, validate it against a reference solution, then publish it."
                  action={
                    <Link
                      href="/admin/questions/new"
                      className="shadow-xs rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                    >
                      Create question
                    </Link>
                  }
                />
              ) : (
                <EmptyState
                  title={filters.page > totalPages ? 'This page is empty' : 'No questions match'}
                  description={
                    hasFilters || filters.status
                      ? 'Try a different status, search or filter.'
                      : 'There is nothing on this page.'
                  }
                  action={
                    <Link
                      href="/admin/questions"
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      Show all questions
                    </Link>
                  }
                />
              )}
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Title</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Marks</Th>
                  <Th className="text-right">Enabled tests</Th>
                  <Th>Difficulty</Th>
                  <Th>Category / tags</Th>
                  <Th className="text-right">Used in</Th>
                  <Th>Updated</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((q) => (
                  <tr key={q.id} className="transition hover:bg-slate-50">
                    <Td className="max-w-[18rem]">
                      <Link
                        href={`/admin/questions/${q.id}/edit`}
                        className="block truncate font-semibold text-slate-900 hover:text-blue-600 hover:underline"
                      >
                        {q.title}
                      </Link>
                      <p className="truncate font-mono text-xs text-slate-500">
                        /{q.slug} · v{q.version}
                      </p>
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={q.status} />
                        {q.validation === 'FAILED' ? (
                          <span className="text-[11px] font-medium text-rose-600">validation failed</span>
                        ) : q.validation === 'NOT_VALIDATED' && q.status !== 'ARCHIVED' ? (
                          <span className="text-[11px] text-slate-500">not validated</span>
                        ) : null}
                      </div>
                    </Td>
                    <Td className="text-right font-mono text-slate-700">{formatMarks(q.marks)}</Td>
                    <Td
                      className={cn(
                        'text-right',
                        q.enabledTests === 0 ? 'font-medium text-amber-600' : 'text-slate-700',
                      )}
                    >
                      {q.enabledTests}
                    </Td>
                    <Td className="text-slate-600">{q.difficulty.toLowerCase()}</Td>
                    <Td>
                      <div className="flex max-w-[14rem] flex-wrap items-center gap-1">
                        {q.category ? (
                          <span className="mr-1 text-xs font-medium text-slate-700">{q.category}</span>
                        ) : null}
                        {q.tags.slice(0, 3).map((t) => (
                          <Badge key={t} className="px-1.5 text-[11px]">
                            {t}
                          </Badge>
                        ))}
                        {q.tags.length > 3 ? (
                          <span className="text-[11px] text-slate-500">+{q.tags.length - 3}</span>
                        ) : null}
                        {!q.category && q.tags.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : null}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-right text-slate-600">
                      {q.usedInTests > 0 ? `${q.usedInTests} test${q.usedInTests === 1 ? '' : 's'}` : '—'}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-slate-500">
                      {formatDateTime(q.updatedAt)}
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-3 whitespace-nowrap text-xs">
                        <Link
                          href={`/admin/questions/${q.id}/edit`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/admin/questions/${q.id}/preview`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          Preview
                        </Link>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        {list.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            <span>
              {list.items.length > 0 ? `Showing ${first}–${last} of ${list.total}` : `${list.total} in total`}
            </span>
            <div className="flex items-center gap-2">
              <PageLink
                href={questionListHref({ ...linkFilters, page: filters.page - 1 })}
                disabled={filters.page <= 1}
              >
                Previous
              </PageLink>
              <span className="font-medium text-slate-700">
                Page {Math.min(filters.page, totalPages)} of {totalPages}
              </span>
              <PageLink
                href={questionListHref({ ...linkFilters, page: filters.page + 1 })}
                disabled={filters.page >= totalPages}
              >
                Next
              </PageLink>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const className = 'rounded-md px-3 py-1.5 border border-slate-300 text-xs font-medium transition';
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={cn(className, 'cursor-not-allowed bg-slate-50 text-slate-400 opacity-40')}
      >
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={cn(className, 'shadow-xs bg-white text-slate-700 hover:bg-slate-50')}>
      {children}
    </Link>
  );
}
