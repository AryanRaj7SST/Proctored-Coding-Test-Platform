import Link from 'next/link';
import { requireUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
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
  const [exams, completedAttempts] = await Promise.all([
    listStudentExams(user.id),
    prisma.attempt.findMany({
      where: {
        userId: user.id,
        status: { in: ['SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED'] },
      },
      select: {
        id: true,
        examId: true,
        questionId: true,
        status: true,
        question: { select: { title: true } },
      },
      orderBy: { submittedAt: 'desc' },
    }),
  ]);

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
            const examAttempts = completedAttempts.filter((att) => att.examId === exam.id);

            return (
              <li key={exam.id}>
                <Card className="p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
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
                        <div className="flex items-center gap-2">
                          {examAttempts.length === 1 && examAttempts[0] ? (
                            <Link
                              href={`/practice/${examAttempts[0].id}`}
                              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-500"
                            >
                              Practice
                            </Link>
                          ) : null}
                          <Link
                            href="/exams"
                            className="rounded-md px-3 py-1.5 text-xs text-slate-400 ring-1 ring-inset ring-ink-600 hover:bg-ink-800"
                          >
                            Details
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>

                  {examAttempts.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-800/80 pt-3">
                      <span className="text-xs font-medium text-slate-400">
                        Practice completed questions:
                      </span>
                      {examAttempts.map((att) => (
                        <Link
                          key={att.id}
                          href={`/practice/${att.id}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/20"
                        >
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          Practice: {att.question.title}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
