import { formatDuration } from '@/lib/utils';
import { formatMarks } from './format';
import type { SittingTestCase } from './types';

/**
 * Graded test cases of one answer: outcome and points share (from the
 * server), the failure message, expected vs actual, and the readable test
 * definition. Failed cases start expanded.
 */
export function TestCaseList({ testCases }: { testCases: SittingTestCase[] }) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
      {testCases.map((t, i) => (
        <li key={`${t.testName}-${i}`}>
          <details className="group" open={!t.passed}>
            <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden="true"
                className={
                  t.passed
                    ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700'
                    : 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-700'
                }
              >
                {t.passed ? '✓' : '✗'}
              </span>
              <span className="sr-only">{t.passed ? 'Passed:' : 'Failed:'}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{t.testName}</span>
              <span
                className={t.passed ? 'font-mono text-xs font-semibold text-slate-800' : 'font-mono text-xs text-slate-500'}
                title={`${t.pointsAwarded} of ${t.points} marks`}
              >
                {formatMarks(t.pointsAwarded)} / {formatMarks(t.points)}
              </span>
              <span className="hidden w-12 text-right text-xs text-slate-500 sm:inline">
                {formatDuration(t.durationMs)}
              </span>
              <span aria-hidden="true" className="text-slate-400 font-bold transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <TestCaseDetail testCase={t} />
          </details>
        </li>
      ))}
    </ul>
  );
}

function TestCaseDetail({ testCase: t }: { testCase: SittingTestCase }) {
  const d = t.definition;
  const hasComparison = t.expected !== null || t.actual !== null;
  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-xs text-slate-700">
      {t.message ? (
        <div>
          <p className="font-semibold uppercase tracking-wide text-slate-500">Result</p>
          <p className={t.passed ? 'mt-1 whitespace-pre-wrap text-slate-700' : 'mt-1 whitespace-pre-wrap font-medium text-rose-700'}>
            {t.message}
          </p>
        </div>
      ) : null}

      {hasComparison ? (
        <div className="grid gap-2 md:grid-cols-2">
          <ValueBox label="Expected" value={t.expected} />
          <ValueBox label="Actual" value={t.actual} />
        </div>
      ) : null}

      {d ? (
        <div className="space-y-2">
          <p className="font-semibold uppercase tracking-wide text-slate-500">What this test checks</p>
          {d.description ? <p className="whitespace-pre-wrap text-slate-700">{d.description}</p> : null}
          {d.expectedBehavior ? (
            <p className="whitespace-pre-wrap text-slate-600">
              <span className="text-slate-500">Expected behaviour: </span>
              {d.expectedBehavior}
            </p>
          ) : null}
          {d.steps.length > 0 ? (
            <div>
              <p className="text-slate-500 font-medium">Steps</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-slate-700">
                {d.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {d.checks.length > 0 ? (
            <div>
              <p className="text-slate-500 font-medium">Checks</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700">
                {d.checks.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-slate-500">
          No readable definition: this test is not in the attempt&apos;s frozen question snapshot.
        </p>
      )}
    </div>
  );
}

function ValueBox({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-white border border-slate-200 px-2 py-1.5 font-mono text-[11px] text-slate-800 shadow-xs">
        {value ?? '—'}
      </pre>
    </div>
  );
}
