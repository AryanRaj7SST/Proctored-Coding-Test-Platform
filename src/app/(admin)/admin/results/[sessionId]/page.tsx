import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/authz';
import { AppError } from '@/lib/errors';
import { idSchema } from '@/lib/validation';
import { getSittingResultForAdmin } from '@/server/services/results';
import { eventTimeline } from '@/server/services/proctoring';
import { eventLabel } from '@/lib/proctor';
import { formatDuration } from '@/lib/utils';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui';
import { QuestionResultCard } from '@/components/admin/results/QuestionResultCard';
import { SittingSummary, SittingSwitcher } from '@/components/admin/results/SittingSummary';

export const dynamic = 'force-dynamic';

async function loadSitting(sessionId: string) {
  if (!idSchema.safeParse(sessionId).success) notFound();
  try {
    return await getSittingResultForAdmin(sessionId);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
}

/** One sitting in full: totals, per-question scores, test cases, code, regrade and feedback. */
export default async function ResultDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  await requireAdmin();
  const { sessionId } = await params;
  const result = await loadSitting(sessionId);
  const studentName = result.student.name ?? result.student.email;
  // Proctoring facts for THIS sitting only, oldest first. Events are metadata:
  // no camera image or video exists anywhere to show.
  const events = (
    await eventTimeline(result.student.id, result.examId, { sessionId: result.sessionId, limit: 500 })
  ).reverse();
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: result.timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Link href="/admin/results" className="transition hover:text-slate-900">
          &larr; Results
        </Link>
        <span aria-hidden="true">&middot;</span>
        <Link href={`/admin/results?examId=${result.examId}`} className="transition hover:text-slate-900">
          {result.examTitle} results
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{studentName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {result.student.email}
            {result.student.batch ? ` · batch ${result.student.batch}` : ''}
            {' · '}
            <Link
              href={`/admin/exams/${result.examId}`}
              className="font-medium text-blue-600 hover:underline"
            >
              {result.examTitle}
            </Link>
            {' · '}
            <span className="font-semibold text-slate-800">Attempt #{result.attemptNumber}</span>
          </p>
        </div>
        <SittingSwitcher result={result} />
      </div>

      <SittingSummary result={result} />

      <Card>
        <CardHeader
          title="Questions"
          subtitle="Each question's marks are split equally across its enabled test cases. Expand a question for test cases, submitted code, regrade and feedback."
        />
        <CardBody>
          {result.questions.length === 0 ? (
            <EmptyState
              title="No answers in this sitting"
              description="The student has not opened any question."
            />
          ) : (
            <ul className="space-y-2">
              {result.questions.map((q, i) => (
                <QuestionResultCard key={q.attemptId} question={q} index={i} timeZone={result.timezone} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Proctoring events"
          subtitle={`${events.length} events in this sitting · ${result.violationCount} counted as violations · times in ${result.timezone}`}
        />
        <CardBody className="max-h-96 overflow-auto p-0">
          {events.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-500">No proctoring events were recorded.</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-3 px-4 py-2 text-xs transition hover:bg-slate-50"
                >
                  <time className="w-16 shrink-0 font-mono tabular-nums text-slate-500">
                    {clock.format(e.occurredAt)}
                  </time>
                  <span className={e.violation ? 'font-medium text-rose-600' : 'text-slate-800'}>
                    {eventLabel(e.type)}
                  </span>
                  {e.violation ? <Badge tone="bad">violation</Badge> : null}
                  {e.durationMs ? (
                    <span className="text-slate-500">away {formatDuration(e.durationMs)}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
