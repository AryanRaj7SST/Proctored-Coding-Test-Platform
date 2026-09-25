import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { env } from '@/lib/env';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui';
import { formatDateTime, formatDuration, statusTone } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Runner execution log (product requirement #17).
 *
 * Useful when a student reports "it worked in the preview but the tests
 * failed": the console output captured inside the sandbox is here.
 */
export default async function TestLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string }>;
}) {
  await requireAdmin();
  const { status, kind } = await searchParams;

  const runs = await prisma.testRun.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(kind ? { kind: kind as never } : {}),
    },
    orderBy: { startedAt: 'desc' },
    take: 100,
    include: {
      attempt: {
        select: {
          id: true,
          user: { select: { name: true, email: true } },
          question: { select: { title: true } },
          exam: { select: { title: true } },
        },
      },
    },
  });

  const questionIds = [
    ...new Set(runs.filter((r) => !r.attempt && r.questionId).map((r) => r.questionId as string)),
  ];
  const questions = questionIds.length
    ? await prisma.question.findMany({
        where: { id: { in: questionIds } },
        select: { id: true, title: true },
      })
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">Test logs</h1>
        <p className="mt-1 text-sm text-slate-400">
          Sandbox console output and errors from the last {runs.length} runs. After {env.testLogRetentionDays}{' '}
          days the daily maintenance job clears console output and removes practice runs; graded submissions
          keep their results and code.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { label: 'All', href: '/admin/test-logs' },
          { label: 'Failures', href: '/admin/test-logs?status=FAILED' },
          { label: 'Timeouts', href: '/admin/test-logs?status=TIMEOUT' },
          { label: 'Validations', href: '/admin/test-logs?kind=VALIDATION' },
          { label: 'Submissions', href: '/admin/test-logs?kind=SUBMISSION' },
        ].map((f) => (
          <a
            key={f.href}
            href={f.href}
            className="rounded-md px-3 py-1.5 text-slate-300 ring-1 ring-inset ring-ink-600 hover:bg-ink-800"
          >
            {f.label}
          </a>
        ))}
      </div>

      <Card>
        <CardHeader title="Runner executions" subtitle="Newest first" />
        <CardBody className="space-y-2">
          {runs.length === 0 ? (
            <EmptyState
              title="No runs recorded"
              description="Runs appear here as soon as tests are executed."
            />
          ) : (
            runs.map((r) => (
              <details key={r.id} className="rounded-md bg-ink-900 p-3 ring-1 ring-ink-700">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <Badge tone={statusTone(r.status)}>{r.status.toLowerCase()}</Badge>
                  <Badge tone="neutral">{r.kind.toLowerCase()}</Badge>
                  <span className="text-slate-200">
                    {r.attempt?.question.title ??
                      questions.find((q) => q.id === r.questionId)?.title ??
                      'Unknown question'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {r.attempt
                      ? `${r.attempt.user.name ?? r.attempt.user.email} · ${r.attempt.exam.title}`
                      : 'admin validation'}
                  </span>
                  <span className="ml-auto text-xs text-slate-500">
                    {r.passedCount}/{r.totalCount} · {formatDuration(r.durationMs)} ·{' '}
                    {formatDateTime(r.startedAt)}
                  </span>
                </summary>

                {r.error ? (
                  <p className="mt-2 rounded bg-bad/10 p-2 text-xs text-rose-200 ring-1 ring-bad/30">
                    {r.error}
                  </p>
                ) : null}
                <pre className="mt-2 max-h-64 overflow-auto font-mono text-[11px] leading-5 text-slate-400">
                  {r.logs || '(no console output captured)'}
                </pre>
              </details>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
