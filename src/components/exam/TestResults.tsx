'use client';

import * as React from 'react';
import { cn, displayMarks, formatDuration } from '@/lib/utils';

export interface StudentTestResult {
  testName: string;
  passed: boolean;
  points: number;
  pointsAwarded: number;
  durationMs: number;
  message?: string;
  /** For a failed check: what it expected, and what the page had. */
  expected?: string;
  actual?: string;
}

export interface RunOutcome {
  score: number;
  maxScore: number;
  percentage: number;
  passedCount: number;
  failedCount: number;
  totalCount: number;
  durationMs: number;
  results: StudentTestResult[];
  graded?: boolean;
}

/** A test case's readable definition, shown before and alongside its result. */
export interface ExpectedTest {
  id: string;
  name: string;
  description?: string | null;
  expectedBehavior?: string | null;
  points: number;
  steps?: string[];
  checks?: string[];
}

export type DotStatus = 'idle' | 'running' | 'passed' | 'failed';

export function StatusDot({ status }: { status: DotStatus }) {
  switch (status) {
    case 'running':
      return (
        <span
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"
          title="Evaluating…"
        />
      );
    case 'passed':
      return (
        <span
          aria-hidden="true"
          className="shadow-xs flex h-4 w-4 items-center justify-center rounded-full bg-[#16a34a] text-[10px] font-bold text-white"
          title="Passed"
        >
          ✓
        </span>
      );
    case 'failed':
      return (
        <span
          aria-hidden="true"
          className="shadow-xs flex h-4 w-4 items-center justify-center rounded-full bg-[#dc2626] text-[10px] font-bold text-white"
          title="Failed"
        >
          ✕
        </span>
      );
    case 'idle':
    default:
      return (
        <span
          className="inline-block h-3.5 w-3.5 rounded-full border-2 border-slate-300 bg-white shadow-inner"
          title="Not evaluated yet"
        />
      );
  }
}

export function TestResults({
  outcome,
  running,
  error,
  expectedTests = [],
  theme = 'light',
  onRetry,
}: {
  outcome: RunOutcome | null;
  running: boolean;
  error: string | null;
  expectedTests?: ExpectedTest[];
  theme?: 'dark' | 'light';
  onRetry?: () => void;
}) {
  const isLight = theme === 'light';

  // Results when there are any, otherwise the definitions; each row carries
  // its test's readable definition (test names are unique per question).
  const testList = React.useMemo(() => {
    const definitionByName = new Map(expectedTests.map((t) => [t.name, t]));
    if (outcome && outcome.results.length > 0) {
      return outcome.results.map((r, i) => ({
        id: `result-${i}`,
        name: r.testName,
        points: r.points,
        pointsAwarded: r.pointsAwarded,
        passed: r.passed as boolean | null,
        message: r.message,
        expected: r.expected,
        actual: r.actual,
        definition: definitionByName.get(r.testName),
      }));
    }
    return expectedTests.map((t) => ({
      id: t.id,
      name: t.name,
      points: t.points,
      pointsAwarded: 0,
      passed: null as boolean | null,
      message: undefined as string | undefined,
      expected: undefined as string | undefined,
      actual: undefined as string | undefined,
      definition: t as ExpectedTest | undefined,
    }));
  }, [outcome, expectedTests]);

  return (
    <div className={cn('flex h-full flex-col overflow-hidden', isLight ? 'bg-white' : 'bg-ink-850')}>
      {/* Top Header / Status Bar */}
      {running ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'flex items-center gap-2 border-b px-4 py-2 text-xs font-medium',
            isLight
              ? 'border-slate-200 bg-blue-50/60 text-blue-700'
              : 'border-ink-700 bg-ink-850 text-blue-400',
          )}
        >
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span>Evaluating test cases against browser sandbox…</span>
        </div>
      ) : outcome ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs',
            isLight ? 'border-slate-200 bg-slate-50' : 'border-ink-700 bg-ink-850',
          )}
        >
          <span
            className={cn('font-semibold', outcome.failedCount === 0 ? 'text-emerald-700' : 'text-amber-700')}
          >
            {outcome.passedCount}/{outcome.totalCount} passed
          </span>
          <span className={isLight ? 'text-slate-600' : 'text-slate-300'}>
            • Score: {displayMarks(outcome.score)}/{displayMarks(outcome.maxScore)} (
            {displayMarks(outcome.percentage)}%)
          </span>
          <span className="ml-auto font-mono text-[11px] text-slate-400">
            {formatDuration(outcome.durationMs)}
          </span>
        </div>
      ) : null}

      {/* Error Alert if runner/infra failed */}
      {error && (
        <div className="border-b border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" role="alert">
          <div className="font-semibold text-rose-700">Test Execution Notice:</div>
          <p className="mt-0.5">{error}</p>
          {onRetry && !running ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1.5 rounded bg-rose-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
            >
              Try again
            </button>
          ) : null}
        </div>
      )}

      {/* Test List */}
      <div className="flex-1 overflow-auto">
        {testList.length > 0 ? (
          <ul className={cn('divide-y', isLight ? 'divide-slate-100' : 'divide-ink-800')}>
            {testList.map((t) => {
              const status: DotStatus = running
                ? 'running'
                : t.passed === true
                  ? 'passed'
                  : t.passed === false
                    ? 'failed'
                    : 'idle';

              return (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    {/* Status Icon / Dot / Spinner */}
                    <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                      <StatusDot status={status} />
                    </div>

                    {/* Test Title & Error Output */}
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-xs font-medium',
                          !running && t.passed === true
                            ? isLight
                              ? 'text-emerald-800'
                              : 'text-slate-200'
                            : !running && t.passed === false
                              ? isLight
                                ? 'text-rose-700'
                                : 'text-rose-200'
                              : isLight
                                ? 'text-slate-700'
                                : 'text-slate-300',
                        )}
                      >
                        {t.name}
                      </p>
                      {t.definition ? <TestDefinition test={t.definition} isLight={isLight} /> : null}
                      {!running && t.message ? (
                        <p
                          className={cn(
                            'mt-1.5 rounded p-2 font-mono text-[11px] leading-relaxed',
                            isLight
                              ? 'border border-slate-200 bg-slate-50 text-slate-600'
                              : 'bg-ink-900 text-slate-400 ring-1 ring-ink-800',
                          )}
                        >
                          {t.message}
                        </p>
                      ) : null}
                      {!running && t.passed === false && (t.expected || t.actual) ? (
                        <dl
                          className={cn(
                            'mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-[11px]',
                            isLight ? 'text-slate-600' : 'text-slate-300',
                          )}
                        >
                          {t.expected ? (
                            <>
                              <dt className="text-slate-400">Expected</dt>
                              <dd className="font-mono">{t.expected}</dd>
                            </>
                          ) : null}
                          {t.actual ? (
                            <>
                              <dt className="text-slate-400">Actual</dt>
                              <dd className="font-mono">{t.actual}</dd>
                            </>
                          ) : null}
                        </dl>
                      ) : null}
                    </div>

                    {/* Points */}
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs text-slate-400">
                      {!running && t.passed !== null
                        ? `${displayMarks(t.pointsAwarded)}/${displayMarks(t.points)}`
                        : displayMarks(t.points)}{' '}
                      pts
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-xs text-slate-400">
            Click <span className="mx-1 font-semibold text-blue-600">Submit Code</span> or Run to evaluate
            your code.
          </div>
        )}
      </div>
    </div>
  );
}

/** What a test does and checks, in words -- collapsed by default to keep the list scannable. */
function TestDefinition({ test, isLight }: { test: ExpectedTest; isLight: boolean }) {
  const steps = test.steps ?? [];
  const checks = test.checks ?? [];
  if (!test.expectedBehavior && !test.description && steps.length === 0 && checks.length === 0) return null;
  return (
    <details className="group mt-1">
      <summary
        className={cn(
          'cursor-pointer select-none text-[11px]',
          isLight ? 'text-slate-500 hover:text-slate-700' : 'text-slate-400 hover:text-slate-200',
        )}
      >
        What this test checks
      </summary>
      <div
        className={cn(
          'mt-1 space-y-1 text-[11px] leading-relaxed',
          isLight ? 'text-slate-600' : 'text-slate-300',
        )}
      >
        {test.expectedBehavior || test.description ? (
          <p>{test.expectedBehavior || test.description}</p>
        ) : null}
        {steps.length > 0 ? (
          <ol className="list-decimal space-y-0.5 pl-4">
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        ) : null}
        {checks.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-4">
            {checks.map((check, i) => (
              <li key={i}>{check}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
