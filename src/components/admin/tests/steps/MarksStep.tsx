'use client';

import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, Table, Td, Th } from '@/components/ui';
import { totalMarksOf } from '../builder-state';
import { DIFFICULTY_TONE, formatMarks, marksError, passMarkText, toCents } from '../format';
import { Notice } from '../shared';
import { LockedNotice } from './QuestionsStep';
import type { StepProps } from './step-props';

/** "3.33 per test × 3" -- the server splits a question's marks equally between its enabled tests. */
function splitHint(marks: string, enabledTests: number): string {
  if (enabledTests <= 0) return 'No enabled tests';
  if (marksError(marks)) return '--';
  const cents = toCents(marks);
  const exact = cents % enabledTests === 0;
  return `${exact ? '' : '≈ '}${formatMarks(cents / 100 / enabledTests)} per test × ${enabledTests}`;
}

/** Step 3: marks per question, live total, and the passing percentage. */
export function MarksStep({
  form,
  update,
  setForm,
  errors,
  readOnly,
  locked,
  sittingCount,
}: StepProps & { locked: boolean; sittingCount: number }) {
  const total = totalMarksOf(form.questions);

  const setMarks = (id: string, marks: string) =>
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => (q.questionId === id ? { ...q, marks } : q)),
    }));

  return (
    <div className="space-y-4">
      {locked ? <LockedNotice sittingCount={sittingCount} /> : null}

      <Card>
        <CardHeader
          title="Marks per question"
          subtitle="Each question's marks are split equally between its enabled test cases when grading."
          action={
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
              <p className="text-lg font-semibold tabular-nums text-slate-900" aria-live="polite">
                {formatMarks(total)} marks
              </p>
            </div>
          }
        />
        <CardBody className="p-0">
          {form.questions.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No questions yet" description="Add questions in the previous step first." />
            </div>
          ) : (
            <fieldset disabled={readOnly || locked} className="min-w-0">
              <legend className="sr-only">Marks for each question</legend>
              <Table>
                <thead>
                  <tr>
                    <Th className="w-10">#</Th>
                    <Th>Question</Th>
                    <Th>Enabled tests</Th>
                    <Th className="w-40">Marks</Th>
                    <Th>Split</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {form.questions.map((q, i) => {
                    const error = errors[`questions.${i}.marks`];
                    const isDefault = toCents(q.marks) === toCents(q.defaultMarks);
                    const inputId = `marks-${q.questionId}`;
                    return (
                      <tr key={q.questionId}>
                        <Td className="text-xs tabular-nums text-slate-500">{i + 1}</Td>
                        <Td>
                          <label htmlFor={inputId} className="block text-sm font-medium text-slate-900">
                            {q.title}
                          </label>
                          <Badge tone={DIFFICULTY_TONE[q.difficulty]} className="mt-1">
                            {q.difficulty.toLowerCase()}
                          </Badge>
                        </Td>
                        <Td className="text-slate-700">
                          {q.enabledTests === 0 ? (
                            <span className="text-amber-700 font-medium">0 — cannot award marks</span>
                          ) : (
                            q.enabledTests
                          )}
                        </Td>
                        <Td>
                          <Input
                            id={inputId}
                            inputMode="decimal"
                            value={q.marks}
                            aria-invalid={Boolean(error) || undefined}
                            aria-describedby={error ? `${inputId}-err` : `${inputId}-hint`}
                            onChange={(e) => setMarks(q.questionId, e.target.value)}
                            onBlur={() => {
                              if (q.marks.trim() === '') setMarks(q.questionId, String(q.defaultMarks));
                            }}
                            className={error ? 'ring-bad' : undefined}
                          />
                          {error ? (
                            <p id={`${inputId}-err`} className="mt-1 text-xs text-bad" role="alert">
                              {error}
                            </p>
                          ) : (
                            <p id={`${inputId}-hint`} className="mt-1 text-xs text-slate-500">
                              Default {formatMarks(q.defaultMarks)}
                            </p>
                          )}
                        </Td>
                        <Td className="text-xs text-slate-600">{splitHint(q.marks, q.enabledTests)}</Td>
                        <Td>
                          {isDefault ? null : (
                            <button
                              type="button"
                              onClick={() => setMarks(q.questionId, String(q.defaultMarks))}
                              className="text-xs text-blue-600 hover:underline disabled:opacity-40"
                            >
                              Use default
                            </button>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </fieldset>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Passing percentage" subtitle="Decides PASS or FAIL for each graded sitting." />
        <CardBody className="space-y-3">
          <fieldset
            disabled={readOnly}
            className="grid min-w-0 gap-4 sm:grid-cols-[12rem_1fr] sm:items-start"
          >
            <Field label="Pass at (%)" required error={errors.passingPercentage} htmlFor="t-pass">
              <Input
                id="t-pass"
                inputMode="decimal"
                value={form.passingPercentage}
                onChange={(e) => update('passingPercentage', e.target.value)}
              />
            </Field>
            <div className="rounded-md bg-slate-50 px-3 py-2.5 border border-slate-200 shadow-xs sm:mt-6">
              <p className="text-sm font-semibold text-slate-900" aria-live="polite">
                {passMarkText(total, form.passingPercentage)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                A student passes when their score reaches the pass mark (e.g. 40% of 100: 40 passes, 39
                fails).
              </p>
            </div>
          </fieldset>
          {locked ? (
            <Notice tone="info">
              Changing the passing percentage re-evaluates PASS/FAIL for sittings that are already graded.
            </Notice>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
