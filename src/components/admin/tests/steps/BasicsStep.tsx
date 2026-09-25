'use client';

import { Card, CardBody, CardHeader, Field, Input, Textarea } from '@/components/ui';
import type { StepProps } from './step-props';

/** Step 1: title, dashboard description, and the instructions students read before starting. */
export function BasicsStep({ form, update, errors, readOnly }: StepProps) {
  return (
    <Card>
      <CardHeader
        title="Basic information"
        subtitle="What students see on their dashboard and on the start screen."
      />
      <CardBody>
        <fieldset disabled={readOnly} className="min-w-0 space-y-4">
          <Field label="Title" required error={errors.title} htmlFor="t-title">
            <Input
              id="t-title"
              value={form.title}
              maxLength={160}
              placeholder="e.g. Lab Quiz 2 — DOM events"
              onChange={(e) => update('title', e.target.value)}
            />
          </Field>
          <Field
            label="Description"
            hint="One or two lines shown on the student's test card."
            error={errors.description}
            htmlFor="t-desc"
          >
            <Textarea
              id="t-desc"
              rows={2}
              maxLength={5000}
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </Field>
          <Field
            label="Instructions for students"
            hint="Shown before the student starts: rules, allowed resources, how grading works."
            error={errors.instructions}
            htmlFor="t-instr"
          >
            <Textarea
              id="t-instr"
              rows={8}
              maxLength={20_000}
              value={form.instructions}
              placeholder={
                'Read every question carefully.\nYour work autosaves; the timer does not pause.\nSwitching tabs is recorded.'
              }
              onChange={(e) => update('instructions', e.target.value)}
            />
          </Field>
          <Field
            label="Batch label"
            hint="Optional cohort label. It pre-fills the batch when you assign students."
            error={errors.batch}
            htmlFor="t-batch"
          >
            <Input
              id="t-batch"
              value={form.batch}
              maxLength={64}
              placeholder="e.g. 2026-A"
              onChange={(e) => update('batch', e.target.value)}
              className="sm:max-w-xs"
            />
          </Field>
        </fieldset>
      </CardBody>
    </Card>
  );
}
