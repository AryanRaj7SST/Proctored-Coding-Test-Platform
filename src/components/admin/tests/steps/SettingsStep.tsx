'use client';

import Link from 'next/link';
import { Card, CardBody, CardHeader, Field, Input } from '@/components/ui';
import { ChoiceCard } from '../shared';
import type { ResultVisibility } from '../types';
import type { StepProps } from './step-props';

const VISIBILITY: { value: ResultVisibility; title: string; description: string }[] = [
  {
    value: 'HIDDEN',
    title: 'Hidden',
    description: 'Students only see that their work was submitted. You still see every score.',
  },
  {
    value: 'SCORE_ONLY',
    title: 'Score only',
    description: 'After grading, students see their score, percentage and PASS/FAIL — not per-test details.',
  },
  {
    value: 'FULL',
    title: 'Full breakdown',
    description:
      'After grading, students see their score plus which test cases passed or failed per question.',
  },
];

/** Step 6: result visibility and proctoring. */
export function SettingsStep({
  form,
  update,
  errors,
  readOnly,
  testId,
}: StepProps & { testId: string | null }) {
  const violations = Number(form.maxViolations);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Results students can see"
          subtitle="Applies once a student's sitting has been graded."
        />
        <CardBody>
          <fieldset disabled={readOnly} className="min-w-0 space-y-2">
            <legend className="sr-only">Result visibility</legend>
            {VISIBILITY.map((v) => (
              <ChoiceCard
                key={v.value}
                name="resultVisibility"
                value={v.value}
                checked={form.resultVisibility === v.value}
                onChange={(value) => update('resultVisibility', value as ResultVisibility)}
                title={v.title}
                description={v.description}
              />
            ))}
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Proctoring"
          subtitle="Tab switches, fullscreen exits and clipboard use are always recorded."
        />
        <CardBody>
          <fieldset disabled={readOnly} className="min-w-0 space-y-4">
            <Field
              label="Auto-submit after this many violations"
              hint={
                violations === 0
                  ? '0 = never auto-submit. Violations are still recorded for review.'
                  : `A sitting is submitted automatically once it reaches ${Number.isFinite(violations) ? violations : '…'} violations.`
              }
              error={errors.maxViolations}
              htmlFor="t-violations"
            >
              <Input
                id="t-violations"
                type="number"
                min={0}
                max={100}
                value={form.maxViolations}
                onChange={(e) => update('maxViolations', e.target.value)}
                className="sm:max-w-[10rem]"
              />
            </Field>

            <label className="flex cursor-pointer items-start gap-3" htmlFor="t-shuffle">
              <input
                id="t-shuffle"
                type="checkbox"
                checked={form.shuffleQuestions}
                onChange={(e) => update('shuffleQuestions', e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-blue-600"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">Shuffle question order</span>
                <span className="block text-xs text-slate-500">
                  Each student gets the questions in a different order. Marks are unaffected.
                </span>
              </span>
            </label>

            <p className="text-xs text-slate-500">
              Copy and paste are blocked for every student. To exempt one student (an accommodation), use the
              clipboard toggle in{' '}
              {testId ? (
                <Link href={`/admin/exams/${testId}/assignments`} className="text-blue-600 hover:underline">
                  assignments
                </Link>
              ) : (
                'assignments'
              )}
              .
            </p>
          </fieldset>
        </CardBody>
      </Card>
    </div>
  );
}
