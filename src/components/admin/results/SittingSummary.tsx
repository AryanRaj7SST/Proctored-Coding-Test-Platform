import Link from 'next/link';
import { Badge, Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  SITTING_STATE,
  formatInZone,
  formatPercent,
  formatScore,
  otherSittingState,
  questionStatus,
} from './format';
import type { SittingResult } from './types';

/**
 * The sitting headline: "82 / 100 · 82% · PASSED" with the pass mark, the
 * timestamps and violations. Numbers are exactly what the server stored.
 */
export function SittingSummary({ result }: { result: SittingResult }) {
  const state = SITTING_STATE[result.state];
  const graded = result.state === 'PASSED' || result.state === 'FAILED';
  const tally = questionTally(result.questions);
  const zone = result.timezone;

  return (
    <Card>
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Attempt #{result.attemptNumber} result
          </p>
          {graded ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                className="text-3xl font-semibold tabular-nums text-slate-50"
                title={`${result.score} / ${result.maxScore}`}
              >
                {formatScore(result.score, result.maxScore)}
              </span>
              <span aria-hidden="true" className="text-2xl text-slate-600">
                ·
              </span>
              <span className="text-3xl font-semibold tabular-nums text-slate-50">
                {formatPercent(result.percentage)}
              </span>
              <span aria-hidden="true" className="text-2xl text-slate-600">
                ·
              </span>
              <Badge tone={state.tone} className="px-2.5 py-1 text-sm font-semibold uppercase tracking-wide">
                {state.label}
              </Badge>
            </p>
          ) : (
            <div className="mt-1">
              <p className="flex flex-wrap items-center gap-3">
                <span className="text-3xl font-semibold tabular-nums text-slate-500">
                  {formatScore(null, result.maxScore)}
                </span>
                <Badge tone={state.tone} className="px-2.5 py-1 text-sm font-semibold">
                  {state.label}
                </Badge>
              </p>
              <p className="mt-2 max-w-xl text-xs text-slate-400">
                {result.state === 'GRADING_PENDING'
                  ? 'At least one answer could not be graded (runner unavailable). No total or pass/fail is recorded until every answer is graded; regrade the pending answers below.'
                  : 'The student is still taking this test. Totals appear once the sitting is submitted and graded.'}
              </p>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-400">
            Pass mark{' '}
            <span className="font-medium text-slate-200">{formatPercent(result.passingPercentage)}</span>
            {' · '}
            {tally}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:grid-cols-4 lg:grid-cols-2">
          <Meta label="Started" value={formatInZone(result.startedAt, zone)} />
          <Meta
            label="Submitted"
            value={result.submittedAt ? formatInZone(result.submittedAt, zone) : 'Not yet'}
          />
          <Meta label="Graded" value={result.gradedAt ? formatInZone(result.gradedAt, zone) : 'Not yet'} />
          <Meta
            label="Violations"
            value={String(result.violationCount)}
            valueClassName={result.violationCount > 0 ? 'text-bad' : undefined}
          />
          <p className="col-span-full text-[11px] text-slate-500">Times in {zone}</p>
        </dl>
      </div>
    </Card>
  );
}

function Meta({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn('mt-0.5 whitespace-nowrap text-slate-200', valueClassName)}>{value}</dd>
    </div>
  );
}

/** "4 questions · 2 passed · 1 partial · 1 grading pending" (a count of statuses, not a score). */
function questionTally(questions: SittingResult['questions']): string {
  const counts = new Map<string, number>();
  for (const q of questions) {
    const label = questionStatus(q).label.toLowerCase();
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([label, n]) => `${n} ${label}`);
  return [`${questions.length} question${questions.length === 1 ? '' : 's'}`, ...parts].join(' · ');
}

/** Links between this student's sittings of the test; the current one is marked. */
export function SittingSwitcher({ result }: { result: SittingResult }) {
  if (result.otherSittings.length === 0) return null;
  const current = {
    sessionId: result.sessionId,
    attemptNumber: result.attemptNumber,
    percentage: result.percentage,
    result: result.result,
    submittedAt: result.submittedAt,
  };
  const sittings = [...result.otherSittings, current].sort((a, b) => a.attemptNumber - b.attemptNumber);

  return (
    <nav aria-label="Other sittings of this test" className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">Sittings</span>
      {sittings.map((s) => {
        const isCurrent = s.sessionId === result.sessionId;
        const st = otherSittingState(s);
        return (
          <Link
            key={s.sessionId}
            href={`/admin/results/${s.sessionId}`}
            aria-current={isCurrent ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs ring-1 ring-inset transition',
              isCurrent
                ? 'bg-brand-500/15 text-white ring-brand-500/40'
                : 'text-slate-300 ring-ink-700 hover:bg-ink-800 hover:text-white',
            )}
          >
            <span className="font-medium">#{s.attemptNumber}</span>
            <span className="font-mono text-slate-400">{formatPercent(s.percentage)}</span>
            <Badge tone={st.tone}>{st.label}</Badge>
          </Link>
        );
      })}
    </nav>
  );
}
