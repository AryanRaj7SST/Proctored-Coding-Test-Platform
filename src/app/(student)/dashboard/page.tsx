import Link from 'next/link';
import { requireUser } from '@/lib/authz';
import { listStudentExams } from '@/server/services/exams';
import { Badge, Card, EmptyState, StatCard } from '@/components/ui';
import { formatDateTime, formatDuration } from '@/lib/utils';
import { StartExamButton } from './StartExamButton';

export const dynamic = 'force-dynamic';

const AVAILABILITY_COPY: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' | 'info' }> =
  {
    AVAILABLE: { label: 'Ready to start', tone: 'ok' },
    IN_PROGRESS: { label: 'In progress', tone: 'warn' },
    NOT_STARTED: { label: 'Not open yet', tone: 'neutral' },
    ENDED: { label: 'Closed', tone: 'bad' },
    EXPIRED: { label: 'Time expired', tone: 'bad' },
    SUBMITTED: { label: 'Submitted', tone: 'info' },
    UNPUBLISHED: { label: 'Unavailable', tone: 'neutral' },
  };

export default async function DashboardPage() {
  const user = await requireUser();
  const exams = await listStudentExams(user.id);

  const upcoming = exams.filter((e) => e.availability === 'AVAILABLE' || e.availability === 'IN_PROGRESS');
  const finished = exams.filter((e) => e.availability === 'SUBMITTED' || e.availability === 'EXPIRED');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">Hello, {user.name?.split(' ')[0] ?? 'there'}</h1>
        <p className="mt-1 text-sm text-slate-400">
          Your assigned assessments appear below. Read the rules before you start — the timer does not pause.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Assigned" value={exams.length} />
        <StatCard label="Ready or in progress" value={upcoming.length} />
        <StatCard label="Completed" value={finished.length} />
      </div>

      {exams.length === 0 ? (
        <EmptyState
          title="No assessments assigned yet"
          description="When your mentor assigns an exam it will appear here. Nothing else is required from you right now."
        />
      ) : (
        <ul className="space-y-3">
          {exams.map((exam) => {
            const copy = AVAILABILITY_COPY[exam.availability] ?? AVAILABILITY_COPY.UNPUBLISHED;
            const canStart = exam.availability === 'AVAILABLE' || exam.availability === 'IN_PROGRESS';
            return (
              <li key={exam.id}>
                <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-slate-100">{exam.title}</h2>
                      <Badge tone={copy?.tone ?? 'neutral'}>{copy?.label ?? exam.availability}</Badge>
                    </div>
                    {exam.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-400">{exam.description}</p>
                    ) : null}
                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                      <div>
                        <dt className="inline">Duration: </dt>
                        <dd className="inline text-slate-300">{exam.durationMinutes} min</dd>
                      </div>
                      <div>
                        <dt className="inline">Questions: </dt>
                        <dd className="inline text-slate-300">{exam.questionCount}</dd>
                      </div>
                      {exam.endTime ? (
                        <div>
                          <dt className="inline">Closes: </dt>
                          <dd className="inline text-slate-300">{formatDateTime(exam.endTime)}</dd>
                        </div>
                      ) : null}
                      {exam.msRemaining !== null && exam.availability === 'IN_PROGRESS' ? (
                        <div>
                          <dt className="inline">Remaining: </dt>
                          <dd className="inline text-amber-300">{formatDuration(exam.msRemaining)}</dd>
                        </div>
                      ) : null}
                      {exam.score !== null ? (
                        <div>
                          <dt className="inline">Score: </dt>
                          <dd className="inline text-slate-200">
                            {exam.score}/{exam.maxScore}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {canStart ? (
                      <StartExamButton
                        examId={exam.id}
                        title={exam.title}
                        durationMinutes={exam.durationMinutes}
                        questionCount={exam.questionCount}
                        resuming={exam.availability === 'IN_PROGRESS'}
                      />
                    ) : (
                      <Link
                        href="/exams"
                        className="rounded-md px-3 py-1.5 text-xs text-slate-400 ring-1 ring-inset ring-ink-600 hover:bg-ink-800"
                      >
                        Details
                      </Link>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
