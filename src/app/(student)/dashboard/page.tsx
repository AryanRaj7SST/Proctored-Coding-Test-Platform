import Link from 'next/link';
import { requireAuth } from '@/lib/authz';
import { listStudentExams } from '@/server/services/exams';
import { finalizeOverdueSittings } from '@/server/services/finalization';
import { listPracticeAttempts, type PracticeLink } from '@/server/services/practice';
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

/** Post-submission Practice Mode links for one test (never while a sitting is in progress). */
function PracticeLinks({ links }: { links: PracticeLink[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-ink-800/80 pt-3">
      <span className="text-xs font-medium text-slate-400">Practice completed questions:</span>
      {links.map((link) => (
        <Link
          key={link.attemptId}
          href={`/practice/${link.attemptId}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/20"
        >
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Practice: {link.questionTitle}
        </Link>
      ))}
    </div>
  );
}

function TestCard({ test, practice }: { test: StudentTest; practice: PracticeLink[] }) {
  const status = STATUS[test.availability] ?? STATUS.UNPUBLISHED!;
  const canStart = test.availability === 'AVAILABLE' || test.availability === 'IN_PROGRESS';
  const practiceLinks = test.availability === 'IN_PROGRESS' ? [] : practice;
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

      {practiceLinks.length > 0 ? <PracticeLinks links={practiceLinks} /> : null}

      <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-1">
        {!canStart && practiceLinks.length === 1 && practiceLinks[0] ? (
          <Link
            href={`/practice/${practiceLinks[0].attemptId}`}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-500"
          >
            Practice
          </Link>
        ) : null}
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

function TestSection({
  title,
  tests,
  empty,
  practice,
}: {
  title: string;
  tests: StudentTest[];
  empty: string;
  practice: Map<string, PracticeLink[]>;
}) {
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
              <TestCard test={t} practice={practice.get(t.id) ?? []} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function DashboardPage() {
  const user = await requireAuth();
  // Finalise abandoned sittings first so overdue attempts are graded and practiceable.
  await finalizeOverdueSittings({ userId: user.id });
  const [tests, practice] = await Promise.all([
    listStudentExams(user.id, { user, alreadyFinalized: true }),
    listPracticeAttempts(user.id),
  ]);
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
          <TestSection
            title="Active"
            tests={by('active')}
            empty="Nothing is open right now."
            practice={practice}
          />
          <TestSection
            title="Upcoming"
            tests={by('upcoming')}
            empty="No upcoming tests."
            practice={practice}
          />
          <TestSection
            title="Completed"
            tests={by('completed')}
            empty="You have not completed a test yet."
            practice={practice}
          />
        </>
      )}
    </div>
  );
}
