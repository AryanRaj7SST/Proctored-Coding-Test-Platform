'use client';

import * as React from 'react';
import { cn, formatDuration } from '@/lib/utils';

export interface StudentTestResult {
  testName: string;
  passed: boolean;
  points: number;
  pointsAwarded: number;
  durationMs: number;
  hidden: boolean;
  message?: string;
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

export interface ExpectedTest {
  id: string;
  name: string;
  description?: string | null;
  points: number;
}

export function TestResults({
  outcome,
  running,
  error,
  expectedTests = [],
  theme = 'light',
}: {
  outcome: RunOutcome | null;
  running: boolean;
  error: string | null;
  expectedTests?: ExpectedTest[];
  theme?: 'dark' | 'light';
}) {
  const isLight = theme === 'light';

  // Determine which tests to display
  const testList = React.useMemo(() => {
    if (outcome && outcome.results.length > 0) {
      return outcome.results.map((r, i) => ({
        id: `result-${i}`,
        name: r.testName,
        points: r.points,
        pointsAwarded: r.pointsAwarded,
        passed: r.passed,
        message: r.message,
      }));
    }
    if (expectedTests.length > 0) {
      return expectedTests.map((t) => ({
        id: t.id,
        name: t.name,
        points: t.points,
        pointsAwarded: 0,
        passed: null as boolean | null,
        message: undefined as string | undefined,
      }));
    }
    return [];
  }, [outcome, expectedTests]);

  return (
    <div className={cn('flex h-full flex-col overflow-hidden', isLight ? 'bg-white' : 'bg-ink-850')}>
      {/* Top Header / Status Bar */}
      {running ? (
        <div
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
            • Score: {outcome.score}/{outcome.maxScore} ({outcome.percentage}%)
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
        </div>
      )}

      {/* Test List */}
      <div className="flex-1 overflow-auto">
        {testList.length > 0 ? (
          <ul className={cn('divide-y', isLight ? 'divide-slate-100' : 'divide-ink-800')}>
            {testList.map((t) => {
              return (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    {/* Status Icon / Dot / Spinner */}
                    <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                      {running ? (
                        /* Revolving loading animation */
                        <span
                          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"
                          title="Evaluating…"
                        />
                      ) : t.passed === true ? (
                        /* Correct: white tick with green circular background */
                        <span
                          aria-hidden="true"
                          className="shadow-xs flex h-4 w-4 items-center justify-center rounded-full bg-[#16a34a] text-[10px] font-bold text-white"
                          title="Passed"
                        >
                          ✓
                        </span>
                      ) : t.passed === false ? (
                        /* Incorrect: red circular background with white cross */
                        <span
                          aria-hidden="true"
                          className="shadow-xs flex h-4 w-4 items-center justify-center rounded-full bg-[#dc2626] text-[10px] font-bold text-white"
                          title="Failed"
                        >
                          ✕
                        </span>
                      ) : (
                        /* Initial state: white dot with subtle border */
                        <span
                          className="inline-block h-3.5 w-3.5 rounded-full border-2 border-slate-300 bg-white shadow-inner"
                          title="Not evaluated yet"
                        />
                      )}
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
                    </div>

                    {/* Points */}
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs text-slate-400">
                      {!running && t.passed !== null ? `${t.pointsAwarded}/${t.points}` : `${t.points}`} pts
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
