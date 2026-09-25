import { cn } from '@/lib/utils';

export type QuestionResultStatus =
  'PASSED' | 'PARTIAL' | 'FAILED' | 'RUNNER_ERROR' | 'NOT_RUN' | null | undefined;

export type QuestionState = 'NOT_SUBMITTED' | 'PENDING' | 'PASSED' | 'PARTIAL' | 'FAILED';

/**
 * A question's state for the student, from the server's attempt fields only.
 * PASSED means every enabled test case passed; a submitted question without a
 * grade is "grading pending" -- never shown as a failure or a 0.
 */
export function questionState(attempt: {
  status: string;
  gradingPending?: boolean;
  resultStatus?: QuestionResultStatus;
}): QuestionState {
  if (attempt.status === 'IN_PROGRESS') return 'NOT_SUBMITTED';
  if (attempt.gradingPending) return 'PENDING';
  if (
    attempt.resultStatus === 'PASSED' ||
    attempt.resultStatus === 'PARTIAL' ||
    attempt.resultStatus === 'FAILED'
  ) {
    return attempt.resultStatus;
  }
  return 'PENDING';
}

const STYLE: Record<QuestionState, { label: string; dot: string; text: string }> = {
  NOT_SUBMITTED: { label: 'Not submitted', dot: 'border border-slate-300 bg-white', text: 'text-slate-400' },
  PENDING: { label: 'Grading pending', dot: 'bg-amber-400', text: 'text-amber-600' },
  PASSED: { label: 'Passed', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  PARTIAL: { label: 'Partially passed', dot: 'bg-amber-500', text: 'text-amber-600' },
  FAILED: { label: 'Failed', dot: 'bg-rose-500', text: 'text-rose-600' },
};

/** Coloured dot, for the compact question navigator. */
export function QuestionStatusDot({ state }: { state: QuestionState }) {
  return (
    <span
      className={cn('h-3 w-3 shrink-0 rounded-full', STYLE[state].dot)}
      title={STYLE[state].label}
      aria-label={STYLE[state].label}
      role="img"
    />
  );
}

/** Dot plus label, for the question overview table. */
export function QuestionStatusLabel({ state }: { state: QuestionState }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium', STYLE[state].text)}>
      <span className={cn('h-2.5 w-2.5 rounded-full', STYLE[state].dot)} aria-hidden="true" />
      {STYLE[state].label}
    </span>
  );
}
