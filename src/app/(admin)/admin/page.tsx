import Link from 'next/link';
import { requireAdmin } from '@/lib/authz';
import { dashboardStats, recentActivity } from '@/server/services/monitor';
import { runnerHealth } from '@/lib/runner-client';
import { Badge, Card, CardBody, CardHeader, EmptyState, StatCard } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const ACTIVITY_TONE: Record<string, 'ok' | 'bad' | 'warn' | 'info'> = {
  submission: 'ok',
  violation: 'bad',
  runner: 'warn',
  user: 'info',
};

export default async function AdminOverviewPage() {
  await requireAdmin();

  // The runner is a separate service; surface its health here rather than
  // letting an admin discover it is down mid-exam.
  const [stats, activity, runner] = await Promise.all([
    dashboardStats(),
    recentActivity(12),
    runnerHealth().catch(() => ({ ok: false, detail: 'unreachable' })),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Overview</h1>
          <p className="mt-1 text-sm text-slate-400">Platform state at a glance.</p>
        </div>
        <Badge tone={runner.ok ? 'ok' : 'bad'}>Runner {runner.ok ? 'online' : 'offline'}</Badge>
      </div>

      {!runner.ok ? (
        <div className="rounded-md bg-bad/10 p-3 text-xs text-rose-200 ring-1 ring-bad/30" role="alert">
          The test runner is not reachable. Students can still write and save code, but “Run Test Cases”, submissions
          and question validation will fail until it is back. Check <code>RUNNER_URL</code> and the runner container.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active exams" value={stats.activeExams} />
        <StatCard label="Students" value={stats.students} />
        <StatCard label="Questions" value={stats.questions} />
        <StatCard label="Attempts in progress" value={stats.activeAttempts} />
        <StatCard label="Submissions" value={stats.submissions} />
        <StatCard label="Average score" value={`${stats.averagePercentage}%`} hint="across graded attempts" />
        <StatCard label="Violations (24h)" value={stats.recentViolations} />
        <StatCard label="Test runs (24h)" value={stats.recentRuns} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent activity" subtitle="Newest first" />
          <CardBody className="p-0">
            {activity.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Nothing has happened yet" description="Activity appears once students sign in." />
              </div>
            ) : (
              <ul className="divide-y divide-ink-800">
                {activity.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                    <Badge tone={ACTIVITY_TONE[item.kind] ?? 'info'}>{item.kind}</Badge>
                    <p className="min-w-0 flex-1 text-sm text-slate-300">{item.text}</p>
                    <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(item.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quick actions" />
          <CardBody className="space-y-2">
            {[
              { href: '/admin/questions/new', label: 'Create a question' },
              { href: '/admin/exams/new', label: 'Create an exam' },
              { href: '/admin/allowed-emails', label: 'Invite students' },
              { href: '/admin/monitor', label: 'Open live monitor' },
              { href: '/admin/results', label: 'Export results' },
            ].map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="block rounded-md px-3 py-2 text-sm text-slate-300 ring-1 ring-inset ring-ink-700 hover:bg-ink-800 hover:text-white"
              >
                {a.label}
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
