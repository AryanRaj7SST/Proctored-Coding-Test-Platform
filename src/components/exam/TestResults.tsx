'use client';

import * as React from 'react';
import { Badge, Spinner } from '@/components/ui';
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

  if (running) {
    return (
      <div className={cn('flex h-full flex-col justify-center items-center gap-3 p-6 text-sm', isLight ? 'bg-white text-slate-600' : 'bg-ink-850 text-slate-300')}>
        <Spinner className={cn('h-5 w-5', isLight ? 'text-blue-600' : 'text-brand-400')} />
        <p className="font-medium text-xs">Evaluating test cases in browser sandbox…</p>
      </div>
    );
  }

  if (error) {
    const isInfraError =
      /timed out|sandbox|runner|failed to fetch|network|load/i.test(error) &&
      !/css|selector|property|element|assertion/i.test(error);

    return (
      <div className={cn('p-4 space-y-2', isLight ? 'bg-white' : 'bg-ink-850')}>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
            {isInfraError ? 'Test Execution Error' : 'Test Failure'}
          </span>
        </div>
        <div className={cn('rounded-md p-3 text-xs', isLight ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-bad/10 text-rose-200 ring-1 ring-bad/30')} role="alert">
          {isInfraError ? `Test execution error: ${error}. Please retry running your tests.` : error}
        </div>
      </div>
    );
  }

  if (!outcome) {
    return (
      <div className={cn('flex h-full flex-col overflow-hidden', isLight ? 'bg-white' : 'bg-ink-850')}>
        {expectedTests.length > 0 ? (
          <ul className={cn('flex-1 divide-y overflow-auto', isLight ? 'divide-slate-100' : 'divide-ink-800')}>
            {expectedTests.map((t) => (
              <li key={t.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <span className={cn('inline-block h-3.5 w-3.5 rounded-full border shrink-0', isLight ? 'border-slate-300 bg-slate-100' : 'border-slate-600 bg-ink-800')} />
                <div className="min-w-0 flex-1">
                  <p className={cn('text-xs font-medium', isLight ? 'text-slate-700' : 'text-slate-300')}>{t.name}</p>
                </div>
                <span className="text-xs text-slate-400 font-mono shrink-0">{t.points} pts</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-xs text-slate-400">
            Click <span className="mx-1 font-semibold text-blue-600">Submit Code</span> or Run to evaluate your code.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col', isLight ? 'bg-white' : 'bg-ink-850')}>
      <div className={cn('flex flex-wrap items-center gap-2 border-b px-4 py-1.5 text-xs', isLight ? 'border-slate-200 bg-slate-50' : 'border-ink-700 bg-ink-850')}>
        <span className={cn('font-semibold', outcome.failedCount === 0 ? 'text-emerald-700' : 'text-amber-700')}>
          {outcome.passedCount}/{outcome.totalCount} passed
        </span>
        <span className={isLight ? 'text-slate-600' : 'text-slate-300'}>
          • Score: {outcome.score}/{outcome.maxScore} ({outcome.percentage}%)
        </span>
        <span className="ml-auto text-[11px] text-slate-400 font-mono">{formatDuration(outcome.durationMs)}</span>
      </div>

      <ul className={cn('flex-1 divide-y overflow-auto', isLight ? 'divide-slate-100' : 'divide-ink-800')}>
        {outcome.results.map((r, i) => (
          <li key={`${r.testName}-${i}`} className="px-4 py-2.5">
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white',
                  r.passed ? 'bg-emerald-500' : 'bg-rose-500',
                )}
              >
                {r.passed ? '✓' : '✕'}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-xs font-medium', r.passed ? (isLight ? 'text-emerald-800' : 'text-slate-200') : (isLight ? 'text-rose-700' : 'text-rose-200'))}>
                  {r.testName}
                </p>
                {r.message ? (
                  <p className={cn('mt-1 rounded p-1.5 text-[11px] font-mono', isLight ? 'bg-slate-50 border border-slate-200 text-slate-600' : 'bg-ink-900 ring-1 ring-ink-800 text-slate-400')}>
                    {r.message}
                  </p>
                ) : null}
              </div>
              <span className="whitespace-nowrap text-xs text-slate-400 font-mono shrink-0">
                {r.pointsAwarded}/{r.points} pts
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
