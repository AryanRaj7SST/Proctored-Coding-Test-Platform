'use client';

import * as React from 'react';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';
import { questionFromBank, totalMarksOf, type SelectedQuestion } from '../builder-state';
import { DIFFICULTY_TONE, formatMarks, plural } from '../format';
import { Notice } from '../shared';
import type { QuestionBankItem, TestStatus } from '../types';
import { QuestionPicker } from './QuestionPicker';
import type { StepProps } from './step-props';

export function LockedNotice({ sittingCount }: { sittingCount: number }) {
  return (
    <Notice tone="warn" title="Questions and marks are locked">
      {plural(sittingCount, 'student has', 'students have')} already started this test. Its questions and
      marks can no longer change, so every score stays comparable. Schedule, access and settings can still be
      edited.
    </Notice>
  );
}

/** "pinned v2 · latest v3" -- which question version the test grades against. */
export function VersionLabel({ q }: { q: Pick<SelectedQuestion, 'pinnedVersion' | 'currentVersion'> }) {
  if (q.pinnedVersion === null) return <span>v{q.currentVersion} · pins on publish</span>;
  if (q.pinnedVersion !== q.currentVersion) {
    return (
      <span className="text-amber-300" title="The test grades against the pinned version.">
        pinned v{q.pinnedVersion} · latest v{q.currentVersion}
      </span>
    );
  }
  return <span>pinned v{q.pinnedVersion}</span>;
}

const iconButton =
  'rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-ink-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent';

/** Step 2: choose PUBLISHED questions and put them in order. */
export function QuestionsStep({
  form,
  setForm,
  errors,
  readOnly,
  locked,
  sittingCount,
  status,
  categories,
  tags,
}: StepProps & {
  locked: boolean;
  sittingCount: number;
  status: TestStatus | null;
  categories: string[];
  tags: string[];
}) {
  const disabled = readOnly || locked;
  const selectedIds = React.useMemo(() => new Set(form.questions.map((q) => q.questionId)), [form.questions]);
  const total = totalMarksOf(form.questions);

  const add = (item: QuestionBankItem) =>
    setForm((prev) =>
      prev.questions.some((q) => q.questionId === item.id)
        ? prev
        : { ...prev, questions: [...prev.questions, questionFromBank(item)] },
    );

  const remove = (id: string) =>
    setForm((prev) => ({ ...prev, questions: prev.questions.filter((q) => q.questionId !== id) }));

  const move = (index: number, delta: number) =>
    setForm((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.questions.length) return prev;
      const next = prev.questions.slice();
      const [item] = next.splice(index, 1);
      if (item) next.splice(target, 0, item);
      return { ...prev, questions: next };
    });

  return (
    <div className="space-y-4">
      {locked ? <LockedNotice sittingCount={sittingCount} /> : null}
      {!locked && status === 'PUBLISHED' ? (
        <Notice tone="info">
          This test is published but nobody has started it yet. Saving a changed question list re-pins every
          question to its latest version.
        </Notice>
      ) : null}

      <Card>
        <CardHeader
          title="Questions in this test"
          subtitle={`${plural(form.questions.length, 'question')} · ${formatMarks(total)} marks · students see them in this order${form.shuffleQuestions ? ' (shuffled per student)' : ''}`}
        />
        <CardBody>
          {errors.questions ? (
            <p className="mb-3 text-xs text-bad" role="alert">
              {errors.questions}
            </p>
          ) : null}
          {form.questions.length === 0 ? (
            <EmptyState
              title="No questions yet"
              description="Add published questions from the bank below. You can reorder them and set marks next."
            />
          ) : (
            <ol className="space-y-1.5">
              {form.questions.map((q, i) => {
                const unpublished = q.status !== 'PUBLISHED';
                return (
                  <li
                    key={q.questionId}
                    className={cn(
                      'flex items-center gap-3 rounded-md bg-ink-900 px-3 py-2 ring-1',
                      unpublished ? 'ring-warn/40' : 'ring-ink-700',
                    )}
                  >
                    <span className="w-5 shrink-0 text-right text-xs tabular-nums text-slate-500">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-100">{q.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <Badge tone={DIFFICULTY_TONE[q.difficulty]}>{q.difficulty.toLowerCase()}</Badge>
                        <span>{plural(q.enabledTests, 'enabled test')}</span>
                        <span>·</span>
                        <VersionLabel q={q} />
                        <span>· {formatMarks(Number(q.marks) || 0)} marks</span>
                        {unpublished ? (
                          <Badge tone="warn">
                            {q.status.toLowerCase()} · must be published before this test can be published
                          </Badge>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        className={iconButton}
                        disabled={disabled || i === 0}
                        onClick={() => move(i, -1)}
                        aria-label={`Move ${q.title} up`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={iconButton}
                        disabled={disabled || i === form.questions.length - 1}
                        onClick={() => move(i, 1)}
                        aria-label={`Move ${q.title} down`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={cn(iconButton, 'text-rose-400 hover:text-rose-300')}
                        disabled={disabled}
                        onClick={() => remove(q.questionId)}
                        aria-label={`Remove ${q.title}`}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardBody>
      </Card>

      {disabled ? null : (
        <Card>
          <CardHeader
            title="Add from the question bank"
            subtitle="Only published questions are listed. A question's default marks are used until you change them."
          />
          <CardBody>
            <QuestionPicker selectedIds={selectedIds} onAdd={add} categories={categories} tags={tags} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
