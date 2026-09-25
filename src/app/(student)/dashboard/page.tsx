import Link from 'next/link';
import { requireAuth } from '@/lib/authz';
import { listStudentExams } from '@/server/services/exams';
import { Badge, Card, EmptyState } from '@/components/ui';
import { displayMarks, formatDateTimeInZone, formatDuration } from '@/lib/utils';
import { StartExamButton } from './StartExamButton';

export const dynamic = 'force-dynamic';

type StudentTest = Awaited<ReturnType<typeof listStudentExams>>[number];
type Section = 'active' | 'upcoming' | 'completed';

/** Which section a test belongs in, from the server-computed phase and availability. */
function sectionOf(t: StudentTest): Section {
  if (t.availability === 'IN_PROGRESS' || t.availability === 'AVAILABLE') return 'active';
  if (t.availability === 'NOT_STARTED') return 'upcoming';
  return 'completed';
}

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' | 'info' }> = {
  AVAILABLE: { label: 'Open', tone: 'ok' },
  IN_PROGRESS: { label: 'In progress', tone: 'warn' },
  NOT_STARTED: { label: 'Upcoming', tone: 'neutral' },
  ENDED: { label: 'Closed', tone: 'neutral' },
  EXPIRED: { label: 'Time expired', tone: 'bad' },
  SUBMITTED: { label: 'Submitted', tone: 'info' },
  UNPUBLISHED: { label: 'Unavailable', tone: 'neutral' },
};

function TestCard({ test }: { test: StudentTest }) {
  const status = STATUS[test.availability] ?? STATUS.UNPUBLISHED!;
  const canStart = test.availability === 'AVAILABLE' || test.availability === 'IN_PROGRESS';
  const retake = test.availability === 'AVAILABLE' && test.attemptsUsed > 0;
  const resultHref = test.bestSessionId
    ? `/results/${test.bestSessionId}`
    : test.latestEnded && test.latestSessionId
      ? `/results/${test.latestSessionId}`
      : null;

  return (
    <Card className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">{test.title}</h3>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      {test.description ? <p className="line-clamp-2 text-xs text-slate-400">{test.description}</p> : null}

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: test.questionCount === 1 ? 'Question' : 'Questions', value: test.questionCount },
          { label: 'Marks', value: test.totalMarks },
          { label: 'Minutes', value: test.durationMinutes },
        ].map((item) => (
          <div key={item.label} className="rounded-md bg-ink-900 px-2 py-2 ring-1 ring-inset ring-ink-800">
            <dd className="text-lg font-semibold text-slate-50">{item.value}</dd>
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</dt>
          </div>
        ))}
      </dl>

      <dl className="space-y-1 text-xs text-slate-400">
        {test.startTime ? (
          <div className="flex justify-between gap-2">
            <dt>Starts</dt>
            <dd className="text-right text-slate-300">
              {formatDateTimeInZone(test.startTime, test.timezone)}
            </dd>
          </div>
        ) : null}
        {test.endTime ? (
          <div className="flex justify-between gap-2">
            <dt>Ends</dt>
            <dd className="text-right text-slate-300">{formatDateTimeInZone(test.endTime, test.timezone)}</dd>
          </div>
        ) : null}
        {test.maxAttempts > 1 ? (
          <div className="flex justify-between gap-2">
            <dt>Attempts</dt>
            <dd className="text-slate-300">
              {test.attemptsUsed} of {test.maxAttempts} used (best score counts)
            </dd>
          </div>
        ) : null}
        {test.msRemaining !== null ? (
          <div className="flex justify-between gap-2">
            <dt>Time left</dt>
            <dd className="text-amber-300">{formatDuration(test.msRemaining)}</dd>
          </div>
        ) : null}
        {test.score !== null ? (
          <div className="flex justify-between gap-2">
            <dt>Best result</dt>
            <dd className="text-slate-200">
              {displayMarks(test.score)}/{displayMarks(test.maxScore)} ({displayMarks(test.percentage)}%){' '}
              <span className={test.result === 'PASSED' ? 'text-ok' : 'text-bad'}>
                {test.result?.toLowerCase()}
              </span>
            </dd>
          </div>
        ) : test.gradingPending > 0 ? (
          <div className="flex justify-between gap-2">
            <dt>Result</dt>
            <dd className="text-amber-300">Grading pending</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-1">
        {resultHref ? (
          <Link
            href={resultHref}
            className="rounded-md px-3 py-1.5 text-xs text-slate-300 ring-1 ring-inset ring-ink-600 hover:bg-ink-800"
          >
            View result
          </Link>
        ) : null}
        {canStart ? (
          <StartExamButton
            examId={test.id}
            title={test.title}
            durationMinutes={test.durationMinutes}
            questionCount={test.questionCount}
            resuming={test.availability === 'IN_PROGRESS'}
            label={
              test.availability === 'IN_PROGRESS' ? 'Resume test' : retake ? 'Retake test' : 'Start test'
            }
          />
        ) : null}
      </div>
    </Card>
  );
}

function TestSection({ title, tests, empty }: { title: string; tests: StudentTest[]; empty: string }) {
  return (
    <section className="space-y-3" aria-labelledby={`section-${title}`}>
      <h2 id={`section-${title}`} className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        {title} <span className="text-slate-600">({tests.length})</span>
      </h2>
      {tests.length === 0 ? (
        <p className="rounded-md px-4 py-3 text-sm text-slate-500 ring-1 ring-inset ring-ink-800">{empty}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tests.map((t) => (
            <li key={t.id}>
              <TestCard test={t} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function DashboardPage() {
  const user = await requireAuth();
  const tests = await listStudentExams(user.id);
  const by = (s: Section) => tests.filter((t) => sectionOf(t) === s);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">Hello, {user.name?.split(' ')[0] ?? 'there'}</h1>
        <p className="mt-1 text-sm text-slate-400">
          Read the rules before you start: the timer does not pause, and your work is saved automatically.
        </p>
      </div>

      {tests.length === 0 ? (
        <EmptyState
          title="No tests yet"
          description="When a test is assigned to you, or opened to everyone, it will appear here."
        />
      ) : (
        <>
          <TestSection title="Active" tests={by('active')} empty="Nothing is open right now." />
          <TestSection title="Upcoming" tests={by('upcoming')} empty="No upcoming tests." />
          <TestSection title="Completed" tests={by('completed')} empty="You have not completed a test yet." />
        </>
      )}
    </div>
  );
}
