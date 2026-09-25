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
          'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 text-sm ring-1',
          run.ok ? 'bg-ok/10 text-emerald-200 ring-ok/30' : 'bg-bad/10 text-rose-200 ring-bad/30',
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
        <p className="text-xs text-warn">
          You have changed the question since this run. Validate again to check the current version.
        </p>
      ) : null}

      <ul className="divide-y divide-ink-800 rounded-md bg-ink-900 ring-1 ring-ink-700">
        {run.results.map((r, i) => (
          <li key={`${r.testName}-${i}`} className="px-3 py-2.5">
            <div className="flex items-start gap-2.5">
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white',
                  r.passed ? 'bg-ok' : 'bg-bad',
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
                  <p className={cn('text-sm', r.passed ? 'text-slate-200' : 'font-medium text-rose-200')}>
                    {r.testName}
                  </p>
                  <span className="shrink-0 font-mono text-[11px] text-slate-500">
                    {formatDuration(r.durationMs)}
                  </span>
                </div>
                {r.message ? <p className="text-xs text-slate-400">{r.message}</p> : null}
                {!r.passed && (r.expected !== undefined || r.actual !== undefined) ? (
                  <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded bg-ink-850 p-2 ring-1 ring-ink-700">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        Expected
                      </dt>
                      <dd className="mt-0.5 break-words font-mono text-slate-200">{r.expected ?? '—'}</dd>
                    </div>
                    <div className="rounded bg-ink-850 p-2 ring-1 ring-ink-700">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        Actual
                      </dt>
                      <dd className="mt-0.5 break-words font-mono text-rose-200">{r.actual ?? '—'}</dd>
                    </div>
                  </dl>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {run.consoleLogs.length > 0 ? (
        <details className="rounded-md bg-ink-900 ring-1 ring-ink-700">
          <summary className="cursor-pointer px-3 py-2 text-xs text-slate-300">
            Console output ({run.consoleLogs.length} line{run.consoleLogs.length === 1 ? '' : 's'})
          </summary>
          <pre className="max-h-56 overflow-auto border-t border-ink-700 p-3 font-mono text-[11px] text-slate-400">
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
