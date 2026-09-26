import Link from 'next/link';
import { requireAdmin } from '@/lib/authz';
import { dashboardStats, recentActivity, recentSubmissions } from '@/server/services/dashboard';
import { runnerHealth } from '@/lib/runner-client';
import { Badge, Card, CardBody, CardHeader, EmptyState, StatCard } from '@/components/ui';
import { displayMarks, formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function Section({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
        <Link href={href} className="text-xs text-brand-300 hover:underline">
          View all
        </Link>
      </div>
      {children}
    </section>
  );
}

export default async function AdminDashboardPage() {
  await requireAdmin();

  // The runner is a separate service; surface its health here rather than
  // letting an admin discover it is down mid-test.
  const [stats, submissions, activity, runner] = await Promise.all([
    dashboardStats(),
    recentSubmissions(8),
    recentActivity(12),
    runnerHealth().catch(() => ({ ok: false, detail: 'unreachable' })),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">Questions, tests and results at a glance.</p>
        </div>
        <Badge tone={runner.ok ? 'ok' : 'bad'}>Runner {runner.ok ? 'online' : 'offline'}</Badge>
      </div>

      {!runner.ok ? (
        <div className="rounded-md bg-bad/10 p-3 text-xs text-rose-200 ring-1 ring-bad/30" role="alert">
          The test runner is not usable
          {runner.detail ? <>: {runner.detail}</> : '.'} Students can still write and save code, but running
          tests, grading and question validation will wait until it is fixed (submissions show &ldquo;grading
          pending&rdquo;, never 0). Check <code>RUNNER_URL</code>, <code>RUNNER_SECRET</code> and the runner
          service.
        </div>
      ) : null}

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
              <ul className="divide-y divide-ink-800">
                {submissions.map((s) => (
                  <li key={s.sessionId} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/results/${s.sessionId}`}
                        className="block truncate text-sm text-slate-200 hover:underline"
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
                        <span className="font-mono text-xs text-slate-300">
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
              <Link href="/admin/audit-logs" className="text-xs text-brand-300 hover:underline">
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
              <ul className="divide-y divide-ink-800">
                {activity.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 px-4 py-2.5">
                    <p className="min-w-0 flex-1 text-sm text-slate-300">
                      <span className="text-slate-100">{item.actor}</span> {item.text}
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
        <CardBody className="flex flex-wrap gap-2">
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
              className="rounded-md px-3 py-2 text-sm text-slate-300 ring-1 ring-inset ring-ink-700 hover:bg-ink-800 hover:text-white"
            >
              {a.label}
            </Link>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
