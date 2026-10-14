import { Suspense, cache } from 'react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/authz';
import { dashboardStats, recentActivity, recentSubmissions } from '@/server/services/dashboard';
import { runnerPoolHealth, type RunnerPoolHealthResult } from '@/lib/runner-client';
import { Badge, Card, CardBody, CardHeader, EmptyState, StatCard } from '@/components/ui';
import { displayMarks, formatDateTime, cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function Section({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">{title}</h2>
        <Link href={href} className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline">
          View all
        </Link>
      </div>
      {children}
    </section>
  );
}

/**
 * The runner is a separate service; surface its health here rather than
 * letting an admin discover it is down mid-test. It is checked OUTSIDE the
 * page's data fetch and streamed in behind <Suspense>: a slow or sleeping
 * runner (up to 2 x 4 s of timeouts) must never hold up the whole dashboard.
 * `cache()` makes the badge and the alert share a single health check.
 */
const getRunnerPoolHealth = cache((): Promise<RunnerPoolHealthResult> =>
  runnerPoolHealth().catch(() => ({ status: 'down' as const, runners: [] })),
);

async function RunnerBadge() {
  const pool = await getRunnerPoolHealth();
  const tone = pool.status === 'ok' ? 'ok' : pool.status === 'degraded' ? 'warn' : 'bad';
  const label =
    pool.status === 'ok'
      ? `Runner online${pool.runners.length > 1 ? ` (${pool.runners.length})` : ''}`
      : pool.status === 'degraded'
        ? `Runner degraded (${pool.runners.filter((r) => r.ok).length}/${pool.runners.length})`
        : 'Runner offline';

  return (
    <div className="flex flex-col items-end gap-1">
      <Badge tone={tone}>{label}</Badge>
      {pool.runners.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-1 text-[11px] text-slate-500">
          {pool.runners.map((r) => (
            <span
              key={r.host}
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]',
                r.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
              )}
              title={r.detail ?? (r.ok ? 'healthy' : 'down')}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', r.ok ? 'bg-emerald-500' : 'bg-rose-500')} />
              {r.host}
              {r.active !== undefined ? ` (${r.active})` : ''}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

async function RunnerAlert() {
  const pool = await getRunnerPoolHealth();
  if (pool.status === 'ok') return null;
  const isDown = pool.status === 'down';
  const upCount = pool.runners.filter((r) => r.ok).length;

  return (
    <div
      className={cn(
        'shadow-xs rounded-md border p-3 text-xs',
        isDown ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800',
      )}
      role="alert"
    >
      {isDown ? (
        <>
          The test runner is not usable. Students can still write and save code, but running tests, grading
          and question validation will wait until it is fixed (submissions show &ldquo;grading pending&rdquo;,
          never 0). Check <code>RUNNER_URLS</code>, <code>RUNNER_URL</code>, <code>RUNNER_SECRET</code> and
          the runner service.
        </>
      ) : (
        <>
          Runner pool is degraded ({upCount}/{pool.runners.length} runners up). Some runners are unreachable
          or reporting errors. Submissions are automatically routed to healthy runners.
        </>
      )}
      {pool.runners.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11px]">
          {pool.runners.map((r) => (
            <span key={r.host} className={r.ok ? 'text-emerald-700' : 'font-semibold text-rose-700'}>
              {r.host}: {r.ok ? 'online' : (r.detail ?? 'down')}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default async function AdminDashboardPage() {
  await requireAdmin();

  const [stats, submissions, activity] = await Promise.all([
    dashboardStats(),
    recentSubmissions(8),
    recentActivity(12),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Questions, tests and results at a glance.</p>
        </div>
        <Suspense fallback={<Badge tone="neutral">Checking runner…</Badge>}>
          <RunnerBadge />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <RunnerAlert />
      </Suspense>

      <Section title="Questions" href="/admin/questions">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Total questions"
            value={stats.questions.total}
            hint={`${stats.questions.archived} archived`}
          />
          <StatCard label="Published" value={stats.questions.published} hint="available to tests" />
          <StatCard
            label="Drafts"
            value={stats.questions.drafts}
            hint={`${stats.questions.validated} validated, not yet published`}
          />
        </div>
      </Section>

      <Section title="Tests" href="/admin/exams">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total tests" value={stats.tests.total} hint={`${stats.tests.drafts} drafts`} />
          <StatCard label="Upcoming" value={stats.tests.upcoming} />
          <StatCard
            label="Active"
            value={stats.tests.active}
            hint={`${stats.sittings.inProgress} in progress now`}
          />
          <StatCard label="Completed" value={stats.tests.completed} />
        </div>
      </Section>

      <Section title="Results" href="/admin/results">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Users" value={stats.users.total} hint={`${stats.users.students} students`} />
          <StatCard label="Graded submissions" value={stats.sittings.graded} />
          <StatCard
            label="Average score"
            value={stats.sittings.averagePercentage !== null ? `${stats.sittings.averagePercentage}%` : '—'}
            hint="across graded submissions"
          />
          <StatCard
            label="Pass rate"
            value={stats.sittings.passRate !== null ? `${stats.sittings.passRate}%` : '—'}
          />
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent submissions" subtitle="Newest first" />
          <CardBody className="p-0">
            {submissions.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No submissions yet" description="Finished tests appear here." />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {submissions.map((s) => (
                  <li
                    key={s.sessionId}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50/80"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/results/${s.sessionId}`}
                        className="block truncate text-sm font-semibold text-slate-900 hover:text-blue-600 hover:underline"
                      >
                        {s.student}
                      </Link>
                      <p className="truncate text-xs text-slate-500">
                        {s.examTitle}
                        {s.attemptNumber > 1 ? ` · attempt ${s.attemptNumber}` : ''} ·{' '}
                        {formatDateTime(s.endedAt)}
                      </p>
                    </div>
                    {s.result ? (
                      <>
                        <span className="font-mono text-xs font-medium text-slate-700">
                          {displayMarks(s.score)}/{displayMarks(s.maxScore)} ({displayMarks(s.percentage)}%)
                        </span>
                        <Badge tone={s.result === 'PASSED' ? 'ok' : 'bad'}>{s.result.toLowerCase()}</Badge>
                      </>
                    ) : (
                      <Badge tone="warn">grading pending</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Recent activity"
            subtitle="From the audit log"
            action={
              <Link
                href="/admin/audit-logs"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                Full audit log
              </Link>
            }
          />
          <CardBody className="p-0">
            {activity.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="Nothing has happened yet"
                  description="Admin and student actions appear here."
                />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {activity.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50/80"
                  >
                    <p className="min-w-0 flex-1 text-sm text-slate-600">
                      <span className="font-semibold text-slate-900">{item.actor}</span> {item.text}
                    </p>
                    <span className="whitespace-nowrap text-xs text-slate-500">
                      {formatDateTime(item.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Quick actions" />
        <CardBody className="flex flex-wrap gap-2.5 p-5">
          {[
            { href: '/admin/questions/new', label: 'Create a question' },
            { href: '/admin/exams/new', label: 'Create a test' },
            { href: '/admin/allowed-emails', label: 'Student roster' },
            { href: '/admin/monitor', label: 'Open live monitor' },
            { href: '/admin/results', label: 'View results' },
          ].map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="shadow-xs rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
            >
              {a.label}
            </Link>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
