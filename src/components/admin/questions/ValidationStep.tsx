'use client';

import * as React from 'react';
import { Check, Play, X } from 'lucide-react';
import { Badge, Button, StatusBadge } from '@/components/ui';
import { cn, formatDateTime } from '@/lib/utils';
import { Notice } from './bits';
import { ValidationResults } from './ValidationResults';
import type { AdminQuestion, ValidationRun } from './types';

const VALIDATION_COPY = {
  NOT_VALIDATED: { tone: 'warn', label: 'Not validated' },
  PASSED: { tone: 'ok', label: 'Passed' },
  FAILED: { tone: 'bad', label: 'Failed' },
} as const;

function ChecklistItem({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      <span
        className={cn(
          'mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
          ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
        )}
      >
        {ok ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
        <span className="sr-only">{ok ? 'Done:' : 'Missing:'}</span>
      </span>
      <span className={ok ? 'text-slate-700 font-medium' : 'text-slate-600'}>{children}</span>
    </li>
  );
}

/** Step 5: run every enabled test case against the reference solution and show the verdicts. */
export function ValidationStep({
  question,
  run,
  runStale,
  runnerNotice,
  validating,
  dirty,
  hasReference,
  enabledCount,
  invalidCount,
  readOnly,
  onValidate,
  onGoTo,
}: {
  question: AdminQuestion;
  run: ValidationRun | null;
  runStale: boolean;
  runnerNotice: string | null;
  validating: boolean;
  dirty: boolean;
  hasReference: boolean;
  enabledCount: number;
  invalidCount: number;
  readOnly: boolean;
  onValidate: () => void;
  onGoTo: (step: 'code' | 'tests') => void;
}) {
  const state = VALIDATION_COPY[question.validation];
  const ready = hasReference && enabledCount > 0 && invalidCount === 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3 rounded-lg bg-white p-4 border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current state</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={state.tone}>Validation: {state.label}</Badge>
            <StatusBadge status={question.status} />
            <span className="text-xs text-slate-500">version {question.version}</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            {question.validatedAt
              ? `Last validated ${formatDateTime(question.validatedAt)}.`
              : 'This version has not been validated yet.'}{' '}
            A passing run moves a Draft to Validated. Editing the description, starter code, reference
            solution or test cases clears the result.
          </p>
          {question.validation === 'FAILED' && question.validationMessage && !run ? (
            <p className="rounded-md bg-rose-50 p-2.5 text-xs text-rose-800 border border-rose-200">
              Last failure: {question.validationMessage}
            </p>
          ) : null}
        </div>

        <div className="space-y-3 rounded-lg bg-white p-4 border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Before validating</p>
          <ul className="space-y-1.5">
            <ChecklistItem ok={hasReference}>
              Reference solution added{' '}
              {!hasReference ? (
                <button
                  type="button"
                  onClick={() => onGoTo('code')}
                  className="font-medium text-blue-600 hover:underline"
                >
                  (add it in Starter code)
                </button>
              ) : null}
            </ChecklistItem>
            <ChecklistItem ok={enabledCount > 0}>
              At least one enabled test case{enabledCount > 0 ? ` (${enabledCount} enabled)` : ''}
            </ChecklistItem>
            <ChecklistItem ok={invalidCount === 0}>
              All test cases are valid{' '}
              {invalidCount > 0 ? (
                <button
                  type="button"
                  onClick={() => onGoTo('tests')}
                  className="font-medium text-blue-600 hover:underline"
                >
                  ({invalidCount} to fix)
                </button>
              ) : null}
            </ChecklistItem>
          </ul>
          {dirty ? (
            <p className="text-xs font-medium text-amber-700">Unsaved changes will be saved before validating.</p>
          ) : null}
          <Button onClick={onValidate} loading={validating} disabled={!ready || readOnly}>
            {!validating ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {validating
              ? `Running ${enabledCount} test case${enabledCount === 1 ? '' : 's'}…`
              : 'Validate Question'}
          </Button>
        </div>
      </div>

      {runnerNotice ? (
        <Notice tone="warn" title="The test runner is not available right now" role="alert">
          <p>{runnerNotice}</p>
          <p>
            This is an infrastructure problem, not a verdict on your question: its validation state has not
            changed. Try again in a moment.
          </p>
        </Notice>
      ) : null}

      {run ? (
        <ValidationResults run={run} stale={runStale} />
      ) : !runnerNotice ? (
        <p className="text-sm text-slate-500">
          Press “Validate Question” to run every enabled test case against the reference solution in the
          isolated runner. Every test case must pass before the question can be published.
        </p>
      ) : null}
    </div>
  );
}
