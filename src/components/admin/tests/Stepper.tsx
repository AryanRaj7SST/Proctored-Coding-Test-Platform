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
      <ol className="flex min-w-max items-center gap-1 rounded-lg bg-ink-850 p-1.5 ring-1 ring-ink-700">
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
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500',
                  active ? 'bg-ink-700 text-white' : 'text-slate-400 hover:bg-ink-800 hover:text-slate-200',
                  !reachable && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-slate-400',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-inset',
                    mark === 'error'
                      ? 'bg-bad/20 text-bad ring-bad/40'
                      : mark === 'done'
                        ? 'bg-ok/15 text-ok ring-ok/30'
                        : active
                          ? 'bg-brand-600 text-white ring-brand-500'
                          : 'bg-ink-900 text-slate-400 ring-ink-600',
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
