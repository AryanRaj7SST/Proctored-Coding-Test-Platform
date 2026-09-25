import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/authz';
import { AppError } from '@/lib/errors';
import { getSittingResultForStudent } from '@/server/services/results';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui';
import { displayMarks, formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Result = Awaited<ReturnType<typeof getSittingResultForStudent>>;
type QuestionResult = NonNullable<Result['questions']>[number];

const QUESTION_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  PASSED: { label: 'Passed', tone: 'ok' },
  PARTIAL: { label: 'Partially passed', tone: 'warn' },
  FAILED: { label: 'Failed', tone: 'bad' },
  RUNNER_ERROR: { label: 'Grading pending', tone: 'warn' },
  NOT_RUN: { label: 'Grading pending', tone: 'warn' },
};

function QuestionCard({ index, q }: { index: number; q: QuestionResult }) {
  const status = QUESTION_STATUS[q.graded ? q.resultStatus : 'NOT_RUN'] ?? QUESTION_STATUS.NOT_RUN!;
  return (
    <Card>
      <CardHeader
        title={`Q${index + 1} · ${q.title}`}
        subtitle={q.graded ? `${q.passedCount} of ${q.enabledCount} test cases passed` : 'Not graded yet'}
        action={
          <div className="flex items-center gap-2">
            {q.score !== null ? (
              <span className="font-mono text-sm text-slate-200">
                {displayMarks(q.score)}/{displayMarks(q.maxScore)}
              </span>
            ) : null}
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
        }
      />
      {q.testCases.length > 0 ? (
        <CardBody className="p-0">
          <ul className="divide-y divide-ink-800">
            {q.testCases.map((t) => (
              <li key={t.testName} className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <span aria-hidden="true" className={t.passed ? 'text-ok' : 'text-bad'}>
                    {t.passed ? '✓' : '✗'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-100">
                      {t.testName}
                      <span className="sr-only">{t.passed ? ' passed' : ' failed'}</span>
                    </p>
                    {t.definition?.checks.length ? (
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-400">
                        {t.definition.checks.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    ) : null}
                    {!t.passed && t.message ? (
                      <p className="mt-1 text-xs text-rose-200">{t.message}</p>
                    ) : null}
                    {!t.passed && (t.expected || t.actual) ? (
                      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs">
                        {t.expected ? (
                          <>
                            <dt className="text-slate-500">Expected</dt>
                            <dd className="font-mono text-slate-300">{t.expected}</dd>
                          </>
                        ) : null}
                        {t.actual ? (
                          <>
                            <dt className="text-slate-500">Actual</dt>
                            <dd className="font-mono text-slate-300">{t.actual}</dd>
                          </>
                        ) : null}
                      </dl>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-mono text-xs text-slate-400">
                    {displayMarks(t.pointsAwarded)}/{displayMarks(t.points)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      ) : null}
      {q.feedback ? (
        <CardBody className="border-t border-ink-800">
          <p className="text-xs font-semibold text-brand-300">Feedback from your reviewer</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{q.feedback}</p>
        </CardBody>
      ) : null}
    </Card>
  );
}

export default async function StudentResultPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await requireAuth();
  const { sessionId } = await params;
  let result: Result;
  try {
    result = await getSittingResultForStudent(sessionId, user.id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }

  const t = result.totals;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/dashboard" className="text-xs text-slate-400 hover:text-white">
        &larr; Back to dashboard
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-slate-50">{result.examTitle}</h1>
        <p className="mt-1 text-sm text-slate-400">
          Attempt {result.attemptNumber}
          {result.submittedAt ? ` · submitted ${formatDateTime(result.submittedAt)}` : ''}
        </p>
      </div>

      {result.state === 'IN_PROGRESS' ? (
        <Card className="p-4 text-sm text-slate-300">This attempt is still in progress.</Card>
      ) : result.visibility === 'HIDDEN' ? (
        <Card className="p-4 text-sm text-slate-300">
          Your test has been submitted. Results for this test are not shown to students yet.
        </Card>
      ) : !t || t.result === null ? (
        <Card className="p-4 text-sm text-amber-200">
          Your work was submitted and saved. Grading is still in progress; check back shortly. Your score will
          never be recorded as 0 because of a grading problem.
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-3xl font-semibold text-slate-50">
              {displayMarks(t.score)}{' '}
              <span className="text-lg text-slate-400">/ {displayMarks(t.maxScore)}</span>
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {displayMarks(t.percentage)}% · pass mark {displayMarks(t.passingPercentage)}%
            </p>
          </div>
          <Badge tone={t.result === 'PASSED' ? 'ok' : 'bad'} className="px-3 py-1 text-sm">
            {t.result === 'PASSED' ? 'Passed' : 'Not passed'}
          </Badge>
        </Card>
      )}

      {result.practice.length > 0 ? (
        <section id="practice" className="scroll-mt-4">
          <Card className="space-y-3 p-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Practice mode</h2>
              <p className="mt-1 text-xs text-slate-400">
                Keep working on a question and run its tests. Practice never changes your submitted work or
                your score.
              </p>
            </div>
            <ul className="flex flex-wrap gap-2">
              {result.practice.map((p) => (
                <li key={p.attemptId}>
                  <Link
                    href={`/practice/${p.attemptId}`}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/20"
                  >
                    Practice: {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {result.questions ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Question breakdown</h2>
          {result.questions.map((q, i) => (
            <QuestionCard key={q.attemptId} index={i} q={q} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
