'use client';

import * as React from 'react';
import { Field, Input, Textarea } from '@/components/ui';
import { QuestionPanel, type StudentQuestion } from '@/components/exam/QuestionPanel';
import type { StepFieldProps } from './BasicInfoStep';

const FORMAT_HINT =
  'Supports # headings, - bullet lists, `code`, **bold**, [links](https://…) and ![images](https://…). Blank lines separate paragraphs.';

/** Step 2: the problem statement, with a live student-panel preview beside it. */
export function ProblemStep({
  draft,
  set,
  errors,
  readOnly,
  studentQuestion,
}: StepFieldProps & { studentQuestion: StudentQuestion }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <fieldset disabled={readOnly} className="min-w-0 space-y-5">
        <legend className="sr-only">Problem statement</legend>
        <Field
          label="Description"
          required
          error={errors.description}
          htmlFor="q-description"
          hint={FORMAT_HINT}
        >
          <Textarea
            id="q-description"
            rows={12}
            value={draft.description}
            maxLength={20_000}
            placeholder={
              '# Task\nBuild a to-do list where…\n\n- Typing a task and pressing Add appends it\n- …'
            }
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
        <Field
          label="Instructions"
          error={errors.instructions}
          htmlFor="q-instructions"
          hint="Optional. Shown to students in a highlighted “Requirements” box."
        >
          <Textarea
            id="q-instructions"
            rows={5}
            value={draft.instructions}
            maxLength={20_000}
            onChange={(e) => set('instructions', e.target.value)}
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Constraints"
            error={errors.constraints}
            htmlFor="q-constraints"
            hint="Optional. Shown to students in a highlighted “Constraints” box."
          >
            <Textarea
              id="q-constraints"
              rows={4}
              value={draft.constraints}
              maxLength={5000}
              onChange={(e) => set('constraints', e.target.value)}
            />
          </Field>
          <Field
            label="Expected behaviour"
            error={errors.expectedBehavior}
            htmlFor="q-expected"
            hint="Optional. Shown to students: what the finished page does."
          >
            <Textarea
              id="q-expected"
              rows={4}
              value={draft.expectedBehavior}
              maxLength={5000}
              onChange={(e) => set('expectedBehavior', e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Media URL"
          error={errors.mediaUrl}
          htmlFor="q-media"
          hint="Optional https:// image of the expected result, shown under the problem."
        >
          <Input
            id="q-media"
            type="url"
            inputMode="url"
            value={draft.mediaUrl}
            maxLength={500}
            placeholder="https://…"
            onChange={(e) => set('mediaUrl', e.target.value)}
          />
        </Field>
      </fieldset>

      <aside
        aria-label="Student panel preview"
        className="min-w-0 space-y-2 lg:sticky lg:top-4 lg:self-start"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student view (live)</p>
        <div className="h-[560px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
          <QuestionPanel question={studentQuestion} />
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500">
          The same question panel students get, updated as you type.
        </p>
      </aside>
    </div>
  );
}
