'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { apiPatch, apiPost, ApiError } from '@/lib/api';
import {
  buildPayload,
  dirtySteps,
  EMPTY_FORM,
  formFromDetail,
  questionsChanged,
  stepOfField,
  STEPS,
  validateForm,
  type BuilderForm,
  type StepId,
} from './builder-state';
import { BuilderSummary } from './BuilderSummary';
import { Notice, PhaseBadge } from './shared';
import { Stepper, type StepMark } from './Stepper';
import { AccessStep } from './steps/AccessStep';
import { BasicsStep } from './steps/BasicsStep';
import { MarksStep } from './steps/MarksStep';
import { PreviewStep } from './steps/PreviewStep';
import { PublishStep } from './steps/PublishStep';
import { QuestionsStep } from './steps/QuestionsStep';
import { ScheduleStep } from './steps/ScheduleStep';
import { SettingsStep } from './steps/SettingsStep';
import type { StepProps } from './steps/step-props';
import type { TestDetail } from './types';

const EDITABLE_STEPS: StepId[] = ['basics', 'questions', 'marks', 'schedule', 'access', 'settings'];

/**
 * The test builder wizard, for /admin/exams/new (no test yet: the first save
 * creates a DRAFT and moves to /admin/exams/[id]) and /admin/exams/[id].
 *
 * All steps edit one form; "Save" PATCHes it and adopts the server's view of
 * the test. The server enforces every rule -- the UI only explains them.
 */
export function TestBuilder({
  initial,
  initialStep = 'basics',
  assignedCount = 0,
  categories,
  tags,
}: {
  initial: TestDetail | null;
  initialStep?: StepId;
  assignedCount?: number;
  categories: string[];
  tags: string[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [detail, setDetail] = React.useState<TestDetail | null>(initial);
  const [base, setBase] = React.useState<BuilderForm>(() => (initial ? formFromDetail(initial) : EMPTY_FORM));
  const [form, setForm] = React.useState<BuilderForm>(base);
  const [step, setStep] = React.useState<StepId>(initial ? initialStep : 'basics');
  const [serverErrors, setServerErrors] = React.useState<Record<string, string>>({});
  const [attempted, setAttempted] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  /** The last failed save's message (toasts fade; conflicts deserve to stay visible). */
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const isNew = detail === null;
  const readOnly = detail?.status === 'ARCHIVED';
  const locked = detail?.locked ?? false;
  const dirty = React.useMemo(() => dirtySteps(form, base), [form, base]);
  const isDirty = dirty.size > 0;

  // Client checks: shown once a save was attempted, except obvious typing
  // errors (marks, numbers) which help as you type. Server errors always show.
  const clientErrors = React.useMemo(() => validateForm(form), [form]);
  const errors = React.useMemo(() => {
    const visible = attempted
      ? clientErrors
      : Object.fromEntries(Object.entries(clientErrors).filter(([k]) => k !== 'title'));
    return { ...serverErrors, ...visible };
  }, [attempted, clientErrors, serverErrors]);

  const update = React.useCallback(<K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Editing a field clears the server's complaint about it.
    const field = key === 'editedStart' ? 'startTime' : key === 'editedEnd' ? 'endTime' : String(key);
    setServerErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  // Warn before a full page unload with unsaved edits.
  React.useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const goTo = React.useCallback(
    (next: StepId) => {
      if (isNew && next !== 'basics') return;
      setStep(next);
      if (!isNew) {
        const url = new URL(window.location.href);
        url.searchParams.set('step', next);
        window.history.replaceState(null, '', url.toString());
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [isNew],
  );

  const adopt = React.useCallback((next: TestDetail) => {
    const nextForm = formFromDetail(next);
    setDetail(next);
    setBase(nextForm);
    setForm(nextForm);
    setServerErrors({});
    setSaveError(null);
    setAttempted(false);
  }, []);

  const firstErrorStep = (fields: string[]): StepId | null => {
    const steps = new Set(fields.map(stepOfField));
    return STEPS.find((s) => steps.has(s.id))?.id ?? null;
  };

  const failWith = (err: unknown, fallback: string) => {
    if (err instanceof ApiError) {
      const details = err.details ?? {};
      setServerErrors(details);
      setSaveError(err.message);
      toast.push(err.message, 'error');
      const target = firstErrorStep(Object.keys(details));
      if (target && target !== step) goTo(target);
    } else {
      setSaveError(fallback);
      toast.push(fallback, 'error');
    }
  };

  const checkClient = (): boolean => {
    const fields = Object.keys(clientErrors);
    if (fields.length === 0) return true;
    setAttempted(true);
    toast.push('Fix the highlighted fields first.', 'error');
    const target = firstErrorStep(fields);
    if (target && target !== step) goTo(target);
    return false;
  };

  const create = async () => {
    setAttempted(true);
    if (!checkClient()) return;
    setSaving(true);
    try {
      const created = await apiPost<{ id: string }>(
        '/api/exams',
        buildPayload(form, { includeQuestions: false }),
      );
      toast.push('Draft created. Now add questions.', 'success');
      router.replace(`/admin/exams/${created.id}?step=questions`);
    } catch (err) {
      failWith(err, 'Could not create the test.');
      setSaving(false);
    }
  };

  const save = async (then?: StepId) => {
    if (!detail) return;
    if (!checkClient()) return;
    if (!isDirty) {
      if (then) goTo(then);
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload(form, {
        includeQuestions: questionsChanged(form.questions, base.questions),
      });
      const next = await apiPatch<TestDetail>(`/api/exams/${detail.id}`, payload);
      adopt(next);
      toast.push('Test saved.', 'success');
      if (then) goTo(then);
    } catch (err) {
      failWith(err, 'Could not save the test.');
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setForm(base);
    setServerErrors({});
    setSaveError(null);
    setAttempted(false);
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const prevStep = STEPS[stepIndex - 1]?.id;
  const nextStep = STEPS[stepIndex + 1]?.id;

  const marks: Partial<Record<StepId, StepMark>> = {};
  if (!isNew) {
    const errorSteps = new Set(Object.keys(errors).map(stepOfField));
    for (const s of STEPS) {
      if (errorSteps.has(s.id)) marks[s.id] = 'error';
      else if (dirty.has(s.id)) marks[s.id] = 'dirty';
    }
    if (!marks.basics && form.title.trim().length >= 3) marks.basics = 'done';
    if (!marks.questions && form.questions.length > 0) marks.questions = 'done';
    if (!marks.marks && form.questions.length > 0) marks.marks = 'done';
    if (!marks.publish && detail.status !== 'DRAFT') marks.publish = 'done';
  }

  const stepProps: StepProps = { form, update, setForm, errors, readOnly };

  const body = (() => {
    switch (step) {
      case 'basics':
        return <BasicsStep {...stepProps} />;
      case 'questions':
        return (
          <QuestionsStep
            {...stepProps}
            locked={locked}
            sittingCount={detail?.sittingCount ?? 0}
            status={detail?.status ?? null}
            categories={categories}
            tags={tags}
          />
        );
      case 'marks':
        return <MarksStep {...stepProps} locked={locked} sittingCount={detail?.sittingCount ?? 0} />;
      case 'schedule':
        return <ScheduleStep {...stepProps} status={detail?.status ?? null} />;
      case 'access':
        return (
          <AccessStep
            {...stepProps}
            testId={detail?.id ?? null}
            assignedCount={assignedCount}
            dirty={isDirty}
          />
        );
      case 'settings':
        return <SettingsStep {...stepProps} testId={detail?.id ?? null} />;
      case 'preview':
        return <PreviewStep form={form} status={detail?.status ?? null} dirty={isDirty} />;
      case 'publish':
        return detail ? (
          <PublishStep
            detail={detail}
            form={form}
            dirty={isDirty}
            assignedCount={assignedCount}
            onDetail={adopt}
          />
        ) : null;
    }
  })();

  const editable = EDITABLE_STEPS.includes(step) && !readOnly;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/admin/exams" className="text-xs text-slate-500 hover:text-slate-800">
            ← All tests
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
              {isNew ? 'Create a test' : form.title.trim() || detail.title}
            </h1>
            {detail ? <PhaseBadge phase={detail.phase} /> : null}
            {isDirty && !isNew ? <span className="text-xs font-medium text-amber-700">Unsaved changes</span> : null}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {isNew
              ? 'Start with the basics. The test is saved as a draft; nothing is visible to students until you publish.'
              : 'Build the test step by step. Students see nothing until it is published.'}
          </p>
        </div>
        {detail ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/exams/${detail.id}/assignments`}
              onClick={(e) => {
                if (isDirty && !window.confirm('You have unsaved changes. Leave without saving them?')) {
                  e.preventDefault();
                }
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 transition"
            >
              Assignments ({assignedCount})
            </Link>
            {isDirty ? (
              <Button variant="ghost" onClick={discard} disabled={saving}>
                Discard
              </Button>
            ) : null}
            {!readOnly ? (
              <Button onClick={() => void save()} loading={saving} disabled={!isDirty}>
                Save
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Stepper current={step} onSelect={goTo} enabled={!isNew} marks={marks} />

      {saveError ? (
        <Notice tone="bad" title="Not saved">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span role="alert">{saveError}</span>
            <button type="button" className="text-rose-700 font-medium underline" onClick={() => setSaveError(null)}>
              Dismiss
            </button>
          </div>
        </Notice>
      ) : null}

      {readOnly ? (
        <Notice tone="neutral" title="This test is archived">
          Archived tests are read-only. Restore it from the Publish step to make changes.
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 space-y-4">
          {body}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div>
              {prevStep && !isNew ? (
                <Button variant="ghost" onClick={() => goTo(prevStep)}>
                  ← Back
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isNew ? (
                <Button onClick={() => void create()} loading={saving}>
                  Create draft &amp; continue
                </Button>
              ) : editable && nextStep ? (
                <>
                  {isDirty ? (
                    <Button variant="secondary" onClick={() => void save()} disabled={saving}>
                      Save
                    </Button>
                  ) : null}
                  <Button onClick={() => void save(nextStep)} loading={saving}>
                    {isDirty ? 'Save & continue' : 'Continue'}
                  </Button>
                </>
              ) : nextStep ? (
                <Button onClick={() => goTo(nextStep)}>Continue</Button>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start" aria-label="Test summary">
          <BuilderSummary form={form} assignedCount={isNew ? null : assignedCount} />
        </aside>
      </div>
    </div>
  );
}
