'use client';

import * as React from 'react';
import { Check, X } from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';
import type { ValidationRun } from './types';

/** Per-test verdicts of a "Validate Question" run: ✓/✗, message, expected vs actual, duration. */
export function ValidationResults({ run, stale }: { run: ValidationRun; stale?: boolean }) {
  const failed = run.totalCount - run.passedCount;
  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3.5 py-2.5 text-sm border shadow-xs',
          run.ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200',
        )}
        role="status"
      >
        <span className="font-semibold">
          {run.ok ? 'Passed' : 'Failed'}: {run.passedCount}/{run.totalCount} test case
          {run.totalCount === 1 ? '' : 's'} passed against the reference solution
        </span>
        {!run.ok ? (
          <span className="text-xs">
            {failed} failing. The question is fully passed only when every enabled test case passes.
          </span>
        ) : null}
        <span className="ml-auto font-mono text-xs opacity-80">{formatDuration(run.durationMs)}</span>
      </div>
      {stale ? (
        <p className="text-xs text-amber-700 font-medium">
          You have changed the question since this run. Validate again to check the current version.
        </p>
      ) : null}

      <ul className="divide-y divide-slate-100 rounded-md bg-white border border-slate-200 shadow-xs">
        {run.results.map((r, i) => (
          <li key={`${r.testName}-${i}`} className="px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white',
                  r.passed ? 'bg-emerald-600' : 'bg-rose-600',
                )}
              >
                {r.passed ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <X className="h-3 w-3" aria-hidden="true" />
                )}
                <span className="sr-only">{r.passed ? 'Passed' : 'Failed'}</span>
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <p className={cn('text-sm', r.passed ? 'text-slate-800 font-medium' : 'font-semibold text-rose-800')}>
                    {r.testName}
                  </p>
                  <span className="shrink-0 font-mono text-[11px] text-slate-500">
                    {formatDuration(r.durationMs)}
                  </span>
                </div>
                {r.message ? <p className="text-xs text-slate-600">{r.message}</p> : null}
                {!r.passed && (r.expected !== undefined || r.actual !== undefined) ? (
                  <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded bg-slate-50 p-2.5 border border-slate-200 shadow-xs">
                      <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Expected
                      </dt>
                      <dd className="mt-0.5 break-words font-mono text-slate-800">{r.expected ?? '—'}</dd>
                    </div>
                    <div className="rounded bg-slate-50 p-2.5 border border-slate-200 shadow-xs">
                      <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Actual
                      </dt>
                      <dd className="mt-0.5 break-words font-mono text-rose-700 font-semibold">{r.actual ?? '—'}</dd>
                    </div>
                  </dl>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {run.consoleLogs.length > 0 ? (
        <details className="rounded-md bg-white border border-slate-200 shadow-xs">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-700">
            Console output ({run.consoleLogs.length} line{run.consoleLogs.length === 1 ? '' : 's'})
          </summary>
          <pre className="max-h-56 overflow-auto border-t border-slate-200 bg-slate-50 p-3 font-mono text-[11px] text-slate-600">
            {run.consoleLogs.join('\n')}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

/** Runner errors are infrastructure problems, never a verdict on the question. */
export function isRunnerErrorCode(code: string | undefined): boolean {
  return code === 'RUNNER_UNAVAILABLE' || code === 'RUNNER_TIMEOUT' || code === 'RUNNER_BUSY';
}
