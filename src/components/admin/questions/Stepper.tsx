'use client';

import * as React from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WIZARD_STEPS, type WizardStepId } from './types';

export interface StepState {
  /** Short status shown under the label ("3 enabled", "passed"). */
  hint?: string;
  hintTone?: 'neutral' | 'ok' | 'warn' | 'bad';
  hasErrors?: boolean;
  locked?: boolean;
  lockedReason?: string;
}

const HINT_TONES = {
  neutral: 'text-slate-500',
  ok: 'text-emerald-600',
  warn: 'text-amber-600',
  bad: 'text-rose-600',
} as const;

/** Numbered, clickable wizard steps. Locked steps explain why they are locked. */
export function Stepper({
  current,
  onSelect,
  states,
}: {
  current: WizardStepId;
  onSelect: (id: WizardStepId) => void;
  states: Partial<Record<WizardStepId, StepState>>;
}) {
  return (
    <nav aria-label="Question editor steps" className="overflow-x-auto">
      <ol className="shadow-xs flex min-w-max gap-1 rounded-lg border border-slate-200 bg-white p-1.5">
        {WIZARD_STEPS.map((step, index) => {
          const state = states[step.id] ?? {};
          const active = step.id === current;
          return (
            <li key={step.id} className="flex-1">
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                disabled={state.locked}
                aria-current={active ? 'step' : undefined}
                title={state.locked ? state.lockedReason : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500',
                  active ? 'shadow-xs border border-blue-200/80 bg-blue-50/80' : 'hover:bg-slate-50',
                  state.locked && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    state.hasErrors
                      ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                      : active
                        ? 'shadow-xs bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {state.locked ? <Lock className="h-3 w-3" /> : state.hasErrors ? '!' : index + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block whitespace-nowrap text-xs',
                      active ? 'font-semibold text-blue-900' : 'font-medium text-slate-600',
                    )}
                  >
                    {step.label}
                  </span>
                  {state.hint ? (
                    <span
                      className={cn(
                        'block whitespace-nowrap text-[11px]',
                        HINT_TONES[state.hintTone ?? 'neutral'],
                      )}
                    >
                      {state.hint}
                    </span>
                  ) : null}
                </span>
                {state.hasErrors ? <span className="sr-only">(has problems)</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
