'use client';

import { cn } from '@/lib/utils';
import { STEPS, type StepId } from './builder-state';

export type StepMark = 'error' | 'dirty' | 'done' | null;

/**
 * The builder's step list. Steps are buttons once the test exists; before the
 * first save only the first step is reachable.
 */
export function Stepper({
  current,
  onSelect,
  enabled,
  marks,
}: {
  current: StepId;
  onSelect: (step: StepId) => void;
  enabled: boolean;
  marks: Partial<Record<StepId, StepMark>>;
}) {
  return (
    <nav aria-label="Test builder steps" className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1 rounded-lg bg-white p-1.5 border border-slate-200 shadow-xs">
        {STEPS.map((step, i) => {
          const active = step.id === current;
          const reachable = enabled || i === 0;
          const mark = marks[step.id] ?? null;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                disabled={!reachable}
                aria-current={active ? 'step' : undefined}
                title={reachable ? undefined : 'Create the draft first'}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600',
                  active ? 'bg-blue-50 text-blue-700 font-semibold shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  !reachable && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-slate-400',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-inset',
                    mark === 'error'
                      ? 'bg-rose-100 text-rose-700 ring-rose-300'
                      : mark === 'done'
                        ? 'bg-emerald-100 text-emerald-700 ring-emerald-300'
                        : active
                          ? 'bg-blue-600 text-white ring-blue-600'
                          : 'bg-slate-100 text-slate-500 ring-slate-200',
                  )}
                >
                  {mark === 'error' ? '!' : mark === 'done' ? '✓' : i + 1}
                </span>
                {step.label}
                {mark === 'dirty' ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden="true" />
                    <span className="sr-only">(unsaved changes)</span>
                  </>
                ) : null}
                {mark === 'error' ? <span className="sr-only">(has errors)</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
