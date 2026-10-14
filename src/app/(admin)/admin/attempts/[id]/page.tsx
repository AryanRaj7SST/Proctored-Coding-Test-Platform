import Link from 'next/link';
import { marksToNumber } from '@/server/grading/marks';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { eventTimeline } from '@/server/services/proctoring';
import { eventLabel } from '@/lib/proctor';
import { Badge, Card, CardBody, CardHeader, StatCard, Table, Td, Th } from '@/components/ui';
import { formatDateTime, formatDuration, percentage, statusTone } from '@/lib/utils';
import { AttemptCodeViewer } from './AttemptCodeViewer';
import { FeedbackCard } from './FeedbackCard';
import { feedbackOf } from '@/server/services/attempt-review';
import { RegradeButton } from '@/components/admin/RegradeButton';

export const dynamic = 'force-dynamic';

export default async function AttemptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const attempt = await prisma.attempt.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, batch: true } },
      exam: { select: { id: true, title: true, durationMinutes: true } },
      question: { select: { id: true, title: true, starterHtml: true, starterCss: true, starterJs: true } },
      testResults: { where: { final: true }, orderBy: { createdAt: 'asc' } },
      testRuns: { orderBy: { startedAt: 'desc' }, take: 10 },
    },
  });
  if (!attempt) notFound();

  const [session, timeline] = await Promise.all([
    prisma.examSession.findUnique({ where: { id: attempt.sessionId } }),
    eventTimeline(attempt.userId, attempt.examId, { sessionId: attempt.sessionId, limit: 100 }),
  ]);
  const score = marksToNumber(attempt.score);
  const maxScore = marksToNumber(attempt.maxScore);

  const snapshot =
    attempt.snapshot && typeof attempt.snapshot === 'object'
      ? (attempt.snapshot as Record<string, unknown>)
      : {};

  const review = feedbackOf(attempt);

  const starter = {
    html: (snapshot.starterHtml as string) ?? attempt.question.starterHtml,
    css: (snapshot.starterCss as string) ?? attempt.question.starterCss,
    js: (snapshot.starterJs as string) ?? attempt.question.starterJs,
  };

  const flags = Array.isArray(attempt.flags)
    ? (attempt.flags as Array<{ rule: string; description: string; snippet?: string }>)
    : [];

  return (
    <div className="space-y-4">
      {flags.length > 0 && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-rose-900">⚠️ Static Integrity Red Flags</span>
              <Badge tone="bad">{flags.length} flagged</Badge>
            </div>
            <span className="text-xs text-rose-700">Stored on submit · Not automatically blocked</span>
          </div>
          <p className="mt-1 text-xs text-rose-700">
            Automated static analysis detected suspicious patterns in the submitted code (e.g. eval, constructor access, prototype mutations, or hardcoded test args).
          </p>
          <div className="mt-3 space-y-2">
            {flags.map((flag, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2 rounded bg-white/80 px-2.5 py-1.5 border border-rose-200 text-xs">
                <span className="rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-rose-900">
                  {flag.rule}
                </span>
                <span className="text-rose-950">{flag.description}</span>
                {flag.snippet && (
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">
                    {flag.snippet}
                  </code>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/admin/attempts" className="transition hover:text-white">
          &larr; Back to Submissions
        </Link>
        <span>&middot;</span>
        <Link href={`/admin/attempts?examId=${attempt.exam.id}`} className="transition hover:text-white">
          {attempt.exam.title} attempts
        </Link>
        <span>&middot;</span>
        <Link href={`/admin/attempts?userId=${attempt.user.id}`} className="transition hover:text-white">
          {attempt.user.name ?? attempt.user.email}&apos;s work
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{attempt.question.title}</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <strong className="text-slate-800">{attempt.user.name ?? attempt.user.email}</strong>
            {' · '}
            <span className="text-slate-500">{attempt.user.email}</span>
            {attempt.user.batch ? ` · batch ${attempt.user.batch}` : ''}
            {' · '}
            <Link href={`/admin/exams/${attempt.exam.id}`} className="text-blue-600 hover:underline">
              {attempt.exam.title}
            </Link>
          </p>
        </div>
        <Badge tone={statusTone(attempt.status)}>{attempt.status.replace('_', ' ').toLowerCase()}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {attempt.status !== 'IN_PROGRESS' && !attempt.gradedAt ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Score</p>
            <p className="mt-1 text-sm font-semibold text-amber-900">Grading pending</p>
            <p className="mt-1 text-xs text-amber-700">The runner failed; code is saved.</p>
            <div className="mt-2">
              <RegradeButton attemptId={attempt.id} />
            </div>
          </div>
        ) : (
          <StatCard label="Score" value={`${score}/${maxScore}`} hint={`${percentage(score, maxScore)}%`} />
        )}
        <StatCard
          label="Tests passed"
          value={`${attempt.testResults.filter((r) => r.passed).length}/${attempt.testResults.length}`}
        />
        <StatCard label="Violations" value={session?.violationCount ?? 0} />
        <StatCard
          label="Question version"
          value={attempt.questionVersion}
          hint="graded against a frozen snapshot"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AttemptCodeViewer
          html={attempt.html}
          css={attempt.css}
          js={attempt.js}
          starter={starter}
          runs={attempt.testRuns}
        />

        <div className="space-y-4">
          <FeedbackCard
            attemptId={attempt.id}
            submitted={attempt.status !== 'IN_PROGRESS'}
            initialFeedback={review?.feedback ?? ''}
            reviewedAt={review?.reviewedAt}
            reviewerName={review?.reviewerName}
          />

          <Card>
            <CardHeader title="Graded test results" subtitle="Automated test suite outcome" />
            <CardBody className="p-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Test</Th>
                    <Th>Result</Th>
                    <Th>Points</Th>
                  </tr>
                </thead>
                <tbody>
                  {attempt.testResults.map((r) => (
                    <tr key={r.id}>
                      <Td>
                        <p className="font-medium text-slate-800">{r.testName}</p>
                        {r.message ? <p className="mt-0.5 text-xs text-slate-500">{r.message}</p> : null}
                      </Td>
                      <Td>
                        <Badge tone={r.passed ? 'ok' : 'bad'}>{r.passed ? 'passed' : 'failed'}</Badge>
                      </Td>
                      <Td className="font-mono text-xs text-slate-700">
                        {marksToNumber(r.pointsAwarded)}/{marksToNumber(r.points)}
                      </Td>
                    </tr>
                  ))}
                  {attempt.testResults.length === 0 ? (
                    <tr>
                      <Td className="text-xs text-slate-500">Not graded yet.</Td>
                      <Td />
                      <Td />
                    </tr>
                  ) : null}
                </tbody>
              </Table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Test runs history" subtitle="Practice vs graded submissions" />
            <CardBody className="p-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Kind</Th>
                    <Th>Status</Th>
                    <Th>Passed</Th>
                    <Th>Duration</Th>
                    <Th>Started</Th>
                  </tr>
                </thead>
                <tbody>
                  {attempt.testRuns.map((r) => (
                    <tr key={r.id}>
                      <Td className="text-xs text-slate-600">{r.kind.toLowerCase()}</Td>
                      <Td>
                        <Badge tone={statusTone(r.status)}>{r.status.toLowerCase()}</Badge>
                      </Td>
                      <Td className="font-mono text-xs text-slate-700">
                        {r.passedCount}/{r.totalCount}
                      </Td>
                      <Td className="text-xs text-slate-500">{formatDuration(r.durationMs)}</Td>
                      <Td className="text-xs text-slate-500">{formatDateTime(r.startedAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Proctoring timeline" subtitle={`${timeline.length} events for this sitting`} />
            <CardBody className="max-h-80 overflow-auto p-0">
              <ul className="divide-y divide-slate-100">
                {timeline.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 px-4 py-2 text-xs transition hover:bg-slate-50"
                  >
                    <Badge tone={e.violation ? 'bad' : 'neutral'}>{eventLabel(e.type)}</Badge>
                    {e.durationMs ? (
                      <span className="text-slate-500">away {formatDuration(e.durationMs)}</span>
                    ) : null}
                    <span className="ml-auto text-slate-500">{formatDateTime(e.occurredAt)}</span>
                  </li>
                ))}
                {timeline.length === 0 ? (
                  <li className="px-4 py-3 text-xs text-slate-500">No events recorded.</li>
                ) : null}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
