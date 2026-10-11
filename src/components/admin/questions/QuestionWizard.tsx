'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Eye } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { TestCaseEditor } from '@/components/admin/TestCaseEditor';
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '@/lib/api';
import { Notice } from './bits';
import { BasicInfoStep } from './BasicInfoStep';
import { CodeStep } from './CodeStep';
import { PreviewStep } from './PreviewStep';
import { ProblemStep } from './ProblemStep';
import { PublishStep, type StatusAction } from './PublishStep';
import { RegradeDiffModal } from './RegradeDiffModal';
import type { RegradeQuestionSummary } from '@/server/grading/grade-attempt';
import { Stepper, type StepState } from './Stepper';
import { ValidationStep } from './ValidationStep';
import { isRunnerErrorCode } from './ValidationResults';
import {
  buildPayload,
  draftFromQuestion,
  emptyDraft,
  fieldErrors,
  hasReference,
  normalizeQuestion,
  resetsValidation,
  stepOfErrorKey,
  suiteProblems,
  testProblems,
  testsDiffer,
  testsFromQuestion,
} from './draft';
import { splitSummary } from './marks';
import { buildStudentQuestion } from './student-view';
import {
  WIZARD_STEPS,
  type AdminQuestion,
  type DraftTest,
  type QuestionDraft,
  type ValidationRun,
  type WizardStepId,
} from './types';

const STEP_SUBTITLES: Record<WizardStepId, string> = {
  basic: 'Name the question and set its marks. Marks are split equally between enabled test cases.',
  problem: 'What students read. Rendered exactly as in the test workspace.',
  code: 'The starter files students begin with, and your reference solution for validation.',
  tests: 'Behaviour checks run against the student’s page. Every enabled test case is visible to students.',
  validate: 'Run every enabled test case against the reference solution before publishing.',
  preview: 'See the question and its test cases the way a student will.',
  publish: 'Publish, unpublish, archive, restore or delete. The server enforces every rule.',
};

const STATUS_TOASTS: Record<StatusAction, string> = {
  publish: 'Question published. It can now be added to tests.',
  unpublish: 'Question unpublished.',
  archive: 'Question archived.',
  unarchive: 'Question restored.',
};

const PUBLISHED_EDIT_WARNING =
  'Saving will return this question to Draft; tests that already use it keep their pinned version.';

function withoutKeys(errors: Record<string, string>, prefix: string): Record<string, string> {
  const keys = Object.keys(errors).filter((k) => k === prefix || k.startsWith(`${prefix}.`));
  if (keys.length === 0) return errors;
  const next = { ...errors };
  for (const k of keys) delete next[k];
  return next;
}

/**
 * The question editor: a seven-step wizard shared by /admin/questions/new and
 * /admin/questions/[id]/edit. The server owns status, validation and every
 * rule; this component gathers input, shows the server's answers and gives
 * instant (advisory) feedback.
 */
export function QuestionWizard({
  initialQuestion,
  initialStep,
  categories,
  knownTags,
}: {
  initialQuestion: AdminQuestion | null;
  initialStep?: WizardStepId;
  categories: string[];
  knownTags: string[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [question, setQuestion] = React.useState<AdminQuestion | null>(initialQuestion);
  const [draft, setDraft] = React.useState<QuestionDraft>(() =>
    initialQuestion ? draftFromQuestion(initialQuestion) : emptyDraft(),
  );
  const [tests, setTests] = React.useState<DraftTest[]>(() =>
    initialQuestion ? testsFromQuestion(initialQuestion) : [],
  );
  const [step, setStep] = React.useState<WizardStepId>(() => {
    const wanted = WIZARD_STEPS.find((s) => s.id === initialStep);
    return wanted && (!wanted.needsSavedQuestion || initialQuestion) ? wanted.id : 'basic';
  });
  // Field errors appear after the first save / next attempt (immediately when editing).
  const [attempted, setAttempted] = React.useState(Boolean(initialQuestion));
  const [serverErrors, setServerErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const savingRef = React.useRef(false);
  const [validating, setValidating] = React.useState(false);
  const [run, setRun] = React.useState<ValidationRun | null>(null);
  const [runSignature, setRunSignature] = React.useState<string | null>(null);
  const [runnerNotice, setRunnerNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<StatusAction | 'delete' | null>(null);
  const [confirmPublishedSave, setConfirmPublishedSave] = React.useState(false);
  const confirmResolver = React.useRef<((ok: boolean) => void) | null>(null);
  const [confirmLeave, setConfirmLeave] = React.useState(false);
  const [regrading, setRegrading] = React.useState(false);
  const [confirmRegradeCount, setConfirmRegradeCount] = React.useState<number | null>(null);
  const [regradeSummary, setRegradeSummary] = React.useState<RegradeQuestionSummary | null>(null);

  const handleStartRepublishAndRegrade = async () => {
    if (!question || regrading) return;
    try {
      const res = await apiGet<{ totalAttempts: number }>(`/api/questions/${question.id}/regrade`);
      setConfirmRegradeCount(res.totalAttempts);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not check affected attempts.', 'error');
    }
  };

  const executeRepublishAndRegrade = async () => {
    if (!question) return;
    setConfirmRegradeCount(null);
    setRegrading(true);
    try {
      let target = question;
      if (dirty) {
        const saved = await save();
        if (!saved) {
          setRegrading(false);
          return;
        }
        target = saved;
      }

      const valResult = await apiPost<ValidationRun>(`/api/questions/${target.id}/validate`);
      setRun(valResult);
      if (!valResult.ok) {
        toast.push(
          `Save & Republish blocked: validation failed (${valResult.passedCount}/${valResult.totalCount} tests passed). Fix reference solution or test suite before regrading.`,
          'error',
        );
        setRegrading(false);
        goTo('validate');
        return;
      }

      const summary = await apiPost<RegradeQuestionSummary>(`/api/questions/${target.id}/regrade`);
      setQuestion(normalizeQuestion(await apiGet<object>(`/api/questions/${target.id}`)));
      setRegradeSummary(summary);
      toast.push(`Republish and regrade completed. ${summary.changedCount} attempt score(s) updated.`, 'success');
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Republish and regrade failed.', 'error');
    } finally {
      setRegrading(false);
    }
  };

  const isNew = question === null;
  const readOnly = question?.status === 'ARCHIVED';

  /* ------------------------------------------------ derived state */

  const savedDraft = React.useMemo(() => (question ? draftFromQuestion(question) : emptyDraft()), [question]);
  const savedTests = React.useMemo(() => (question ? testsFromQuestion(question) : []), [question]);
  const signature = React.useMemo(() => JSON.stringify(buildPayload(draft, tests)), [draft, tests]);
  const savedSignature = React.useMemo(
    () => JSON.stringify(buildPayload(savedDraft, savedTests)),
    [savedDraft, savedTests],
  );
  const dirty = signature !== savedSignature;
  const willResetValidation = !isNew && dirty && resetsValidation(draft, tests, savedDraft, savedTests);

  const clientErrors = React.useMemo(() => fieldErrors(draft), [draft]);
  const errors = React.useMemo(
    () => ({ ...(attempted ? clientErrors : {}), ...serverErrors }),
    [attempted, clientErrors, serverErrors],
  );
  const invalidCount = React.useMemo(
    () => tests.filter((t) => testProblems(t, tests).length > 0).length,
    [tests],
  );
  const suite = React.useMemo(() => suiteProblems(tests), [tests]);
  const enabledCount = tests.filter((t) => t.enabled).length;

  const studentQuestion = React.useMemo(
    () =>
      buildStudentQuestion({
        id: question?.id,
        title: draft.title,
        description: draft.description,
        instructions: draft.instructions,
        constraints: draft.constraints,
        expectedBehavior: draft.expectedBehavior,
        mediaUrl: draft.mediaUrl,
        difficulty: draft.difficulty,
        marks: draft.marks,
        starterHtml: draft.starterHtml,
        starterCss: draft.starterCss,
        starterJs: draft.starterJs,
        tests: tests.map((t) => ({ ...t, key: t._key })),
      }),
    [draft, tests, question?.id],
  );

  const stepHasErrors = (id: WizardStepId) =>
    Object.keys(errors).some((k) => stepOfErrorKey(k) === id) ||
    (id === 'tests' && (invalidCount > 0 || suite.length > 0));

  /* ------------------------------------------------ editing */

  const set = React.useCallback(<K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setServerErrors((prev) => withoutKeys(prev, key));
  }, []);

  const updateTests = React.useCallback((next: DraftTest[]) => {
    setTests(next);
    setServerErrors((prev) => withoutKeys(prev, 'tests'));
  }, []);

  const goTo = React.useCallback((id: WizardStepId) => {
    setStep(id);
    window.history.replaceState(null, '', `${window.location.pathname}?step=${id}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const applySaved = (fresh: AdminQuestion) => {
    setQuestion(fresh);
    setDraft(draftFromQuestion(fresh));
    setTests((prev) => testsFromQuestion(fresh, prev));
  };

  /* ------------------------------------------------ saving */

  /** Why the current state cannot be saved (UX only; the server re-checks everything). */
  const saveBlocker = (): { message: string; step: WizardStepId } | null => {
    const fe = fieldErrors(draft);
    const firstKey = Object.keys(fe)[0];
    if (firstKey)
      return {
        message: fe[firstKey] ?? 'Fix the highlighted fields.',
        step: stepOfErrorKey(firstKey) ?? 'basic',
      };
    // The server checks the suite only when it receives it (always on create).
    const sendsTests = tests.length > 0 && (!question || testsDiffer(tests, savedTests));
    if (sendsTests && invalidCount > 0) {
      return {
        message: `${invalidCount} test case${invalidCount === 1 ? ' has' : 's have'} problems. Fix them before saving.`,
        step: 'tests',
      };
    }
    if (sendsTests && suite[0]) return { message: suite[0], step: 'tests' };
    if (question && question.tests.length > 0 && tests.length === 0) {
      return {
        message:
          'A saved question must keep at least one test case. Add one before saving, or archive the question.',
        step: 'tests',
      };
    }
    return null;
  };

  const askPublishedSave = () =>
    new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
      setConfirmPublishedSave(true);
    });

  const resolvePublishedSave = (ok: boolean) => {
    setConfirmPublishedSave(false);
    confirmResolver.current?.(ok);
    confirmResolver.current = null;
  };

  const save = async (thenStep?: WizardStepId): Promise<AdminQuestion | null> => {
    if (savingRef.current || readOnly) return null;
    if (question && !dirty) {
      if (thenStep) goTo(thenStep);
      return question;
    }
    setAttempted(true);
    const blocker = saveBlocker();
    if (blocker) {
      toast.push(blocker.message, 'error');
      goTo(blocker.step);
      return null;
    }
    if (question?.status === 'PUBLISHED' && willResetValidation && !(await askPublishedSave())) return null;

    savingRef.current = true;
    setSaving(true);
    setServerErrors({});
    try {
      let fresh: AdminQuestion;
      if (!question) {
        const created = await apiPost<{ id: string }>('/api/questions', buildPayload(draft, tests));
        fresh = normalizeQuestion(await apiGet<object>(`/api/questions/${created.id}`));
        applySaved(fresh);
        toast.push('Draft saved.', 'success');
        // Hand over to the edit route, which loads the saved question from the server.
        router.replace(`/admin/questions/${fresh.id}/edit?step=${thenStep ?? step}`);
        return fresh;
      }
      // Send the test cases only when they changed: the server then leaves them
      // untouched (ids, version and validation stay as they are). It also
      // rejects an empty list, so an untested question saves without one.
      const sendTests = tests.length > 0 && testsDiffer(tests, savedTests);
      fresh = normalizeQuestion(
        await apiPatch<object>(
          `/api/questions/${question.id}`,
          buildPayload(draft, sendTests ? tests : null),
        ),
      );
      applySaved(fresh);
      const backToDraft = question.status !== 'DRAFT' && fresh.status === 'DRAFT';
      toast.push(
        backToDraft ? 'Saved. The question is back in Draft: validate it again.' : 'Saved.',
        'success',
      );
      if (thenStep) goTo(thenStep);
      return fresh;
    } catch (err) {
      if (err instanceof ApiError) {
        const details = err.details ?? {};
        setServerErrors(details);
        toast.push(err.message, 'error');
        const firstStep = Object.keys(details)
          .map(stepOfErrorKey)
          .find((s): s is WizardStepId => s !== null);
        if (firstStep) goTo(firstStep);
      } else {
        toast.push('Could not save the question. Check your connection and try again.', 'error');
      }
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Cmd/Ctrl+S saves from anywhere in the editor.
  const saveRef = React.useRef(save);
  saveRef.current = save;
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Warn before closing or reloading the tab with unsaved work.
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  /* ------------------------------------------------ validation */

  const validate = async () => {
    if (!question || validating) return;
    setValidating(true);
    setRunnerNotice(null);
    try {
      let target = question;
      if (dirty) {
        // "Validate Question" checks the SAVED question, so save first.
        const saved = await save();
        if (!saved) return;
        target = saved;
      }
      const result = await apiPost<ValidationRun>(`/api/questions/${target.id}/validate`);
      setRun(result);
      setRunSignature(JSON.stringify(buildPayload(draftFromQuestion(target), testsFromQuestion(target))));
      toast.push(
        result.ok
          ? `Validation passed: all ${result.totalCount} test case${result.totalCount === 1 ? '' : 's'} pass.`
          : `Validation failed: ${result.passedCount}/${result.totalCount} test cases passed.`,
        result.ok ? 'success' : 'error',
      );
      try {
        setQuestion(normalizeQuestion(await apiGet<object>(`/api/questions/${target.id}`)));
      } catch {
        setQuestion((q) =>
          q ? { ...q, status: result.status, validation: result.ok ? 'PASSED' : 'FAILED' } : q,
        );
      }
    } catch (err) {
      if (err instanceof ApiError && isRunnerErrorCode(err.code)) setRunnerNotice(err.message);
      else toast.push(err instanceof ApiError ? err.message : 'Validation could not run.', 'error');
    } finally {
      setValidating(false);
    }
  };

  /* ------------------------------------------------ lifecycle */

  const changeStatus = async (action: StatusAction): Promise<boolean> => {
    if (!question) return false;
    setBusy(action);
    try {
      const fresh = normalizeQuestion(
        await apiPost<object>(`/api/questions/${question.id}/status`, { action }),
      );
      setQuestion(fresh);
      toast.push(STATUS_TOASTS[action], 'success');
      return true;
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not change the status.', 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const remove = async (): Promise<boolean> => {
    if (!question) return false;
    setBusy('delete');
    try {
      await apiDelete(`/api/questions/${question.id}`);
      toast.push('Question deleted.', 'success');
      router.push('/admin/questions');
      return true;
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not delete the question.', 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  /* ------------------------------------------------ navigation */

  const index = WIZARD_STEPS.findIndex((s) => s.id === step);
  const current = WIZARD_STEPS[index] ?? WIZARD_STEPS[0]!;
  const prevStep = WIZARD_STEPS[index - 1];
  const nextStep = WIZARD_STEPS[index + 1];
  const nextNeedsSave = Boolean(nextStep?.needsSavedQuestion && isNew);

  const next = () => {
    if (!nextStep) return;
    if (nextNeedsSave) {
      void save(nextStep.id);
      return;
    }
    if (
      (step === 'basic' || step === 'problem') &&
      Object.keys(clientErrors).some((k) => stepOfErrorKey(k) === step)
    ) {
      setAttempted(true);
      toast.push('Fix the highlighted fields first.', 'error');
      return;
    }
    goTo(nextStep.id);
  };

  const validationHint =
    question === null
      ? undefined
      : question.validation === 'PASSED'
        ? ({ hint: 'passed', hintTone: 'ok' } as const)
        : question.validation === 'FAILED'
          ? ({ hint: 'failed', hintTone: 'bad' } as const)
          : ({ hint: 'not run', hintTone: 'warn' } as const);

  const stepStates: Partial<Record<WizardStepId, StepState>> = {
    basic: { hasErrors: stepHasErrors('basic') },
    problem: { hasErrors: stepHasErrors('problem') },
    code: {
      hasErrors: stepHasErrors('code'),
      hint: hasReference(draft) ? 'reference added' : 'no reference yet',
      hintTone: hasReference(draft) ? 'neutral' : 'warn',
    },
    tests: {
      hasErrors: stepHasErrors('tests'),
      hint: `${enabledCount} enabled`,
      hintTone: enabledCount > 0 ? 'neutral' : 'warn',
    },
    validate: { locked: isNew, lockedReason: 'Save the draft first', ...validationHint },
    publish: {
      locked: isNew,
      lockedReason: 'Save the draft first',
      ...(question
        ? {
            hint: question.status.toLowerCase(),
            hintTone: question.status === 'PUBLISHED' ? 'ok' : 'neutral',
          }
        : {}),
    },
  };

  const saveLabel = isNew || question?.status === 'DRAFT' ? 'Save draft' : 'Save changes';

  /* ------------------------------------------------ render */

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <button
            type="button"
            onClick={() => (dirty ? setConfirmLeave(true) : router.push('/admin/questions'))}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Questions
          </button>
          <h1 className="truncate text-xl font-semibold text-slate-50">
            {isNew ? 'New question' : draft.title.trim() || question?.title || 'Untitled question'}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            {question ? (
              <>
                <StatusBadge status={question.status} />
                <Badge
                  tone={
                    question.validation === 'PASSED'
                      ? 'ok'
                      : question.validation === 'FAILED'
                        ? 'bad'
                        : 'warn'
                  }
                >
                  validation {question.validation.replace('_', ' ').toLowerCase()}
                </Badge>
                <span>v{question.version}</span>
                <span className="font-mono text-slate-500">/{question.slug}</span>
              </>
            ) : (
              <Badge tone="neutral">not saved yet</Badge>
            )}
            {dirty ? (
              <span className="inline-flex items-center gap-1.5 text-warn" role="status">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warn" />
                Unsaved changes
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {question ? (
            <Link
              href={`/admin/questions/${question.id}/preview`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-slate-300 ring-1 ring-inset ring-ink-600 hover:bg-ink-800"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              Preview
            </Link>
          ) : null}
          <Button
            onClick={() => void save()}
            loading={saving}
            disabled={readOnly || (!isNew && !dirty)}
            title="Save (Ctrl/⌘ S)"
          >
            {saveLabel}
          </Button>
        </div>
      </div>

      {readOnly ? (
        <Notice
          tone="warn"
          title="This question is archived"
          action={
            step !== 'publish' ? (
              <Button size="sm" variant="secondary" onClick={() => goTo('publish')}>
                Go to Publish
              </Button>
            ) : null
          }
        >
          <p>Archived questions are read-only. Restore it from the Publish step to make changes.</p>
        </Notice>
      ) : null}
      {willResetValidation && question?.status === 'PUBLISHED' ? (
        <Notice tone="warn" role="status">
          <p>{PUBLISHED_EDIT_WARNING}</p>
        </Notice>
      ) : null}
      {willResetValidation && question?.status === 'VALIDATED' ? (
        <Notice tone="info" role="status">
          <p>Saving these changes clears the validation result and returns the question to Draft.</p>
        </Notice>
      ) : null}
      {serverErrors._ ? (
        <Notice tone="bad" role="alert">
          <p>{serverErrors._}</p>
        </Notice>
      ) : null}

      <Stepper current={step} onSelect={goTo} states={stepStates} />

      <Card>
        <CardHeader title={`${index + 1}. ${current.label}`} subtitle={STEP_SUBTITLES[step]} />
        <CardBody className="p-5">
          {step === 'basic' ? (
            <BasicInfoStep
              draft={draft}
              set={set}
              errors={errors}
              readOnly={readOnly}
              isNew={isNew}
              enabledCount={enabledCount}
              categories={categories}
              knownTags={knownTags}
            />
          ) : null}
          {step === 'problem' ? (
            <ProblemStep
              draft={draft}
              set={set}
              errors={errors}
              readOnly={readOnly}
              studentQuestion={studentQuestion}
            />
          ) : null}
          {step === 'code' ? <CodeStep draft={draft} set={set} errors={errors} readOnly={readOnly} /> : null}
          {step === 'tests' ? (
            <TestCaseEditor
              tests={tests}
              onChange={updateTests}
              marks={draft.marks}
              readOnly={readOnly}
              serverErrors={serverErrors}
            />
          ) : null}
          {step === 'validate' && question ? (
            <ValidationStep
              question={question}
              run={run}
              runStale={run !== null && runSignature !== signature}
              runnerNotice={runnerNotice}
              validating={validating}
              dirty={dirty}
              hasReference={hasReference(draft)}
              enabledCount={enabledCount}
              invalidCount={invalidCount}
              readOnly={readOnly}
              onValidate={() => void validate()}
              onGoTo={goTo}
            />
          ) : null}
          {step === 'preview' ? (
            <PreviewStep
              questionId={question?.id ?? null}
              studentQuestion={studentQuestion}
              summary={splitSummary(draft.marks, enabledCount)}
              draft={draft}
              dirty={dirty}
            />
          ) : null}
          {step === 'publish' && question ? (
            <PublishStep
              question={question}
              dirty={dirty}
              busy={busy}
              onAction={changeStatus}
              onDelete={remove}
              onSave={() => void save()}
              onRepublishAndRegrade={() => void handleStartRepublishAndRegrade()}
              regrading={regrading}
            />
          ) : null}
        </CardBody>
      </Card>

      <div className="flex items-center justify-between gap-3">
        {prevStep ? (
          <Button variant="ghost" onClick={() => goTo(prevStep.id)}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {prevStep.label}
          </Button>
        ) : (
          <span />
        )}
        {nextStep ? (
          <Button
            variant={nextNeedsSave ? 'primary' : 'secondary'}
            onClick={next}
            loading={nextNeedsSave && saving}
          >
            {nextNeedsSave ? `Save draft & continue to ${nextStep.label}` : nextStep.label}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmPublishedSave}
        theme="dark"
        title="Return this question to Draft?"
        message={`${PUBLISHED_EDIT_WARNING} You will need to validate and publish it again.`}
        confirmLabel="Save anyway"
        onCancel={() => resolvePublishedSave(false)}
        onConfirm={() => resolvePublishedSave(true)}
      />
      <ConfirmDialog
        open={confirmLeave}
        theme="dark"
        danger
        title="Discard unsaved changes?"
        message="You have changes that have not been saved. Leaving now discards them."
        confirmLabel="Discard and leave"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          router.push('/admin/questions');
        }}
      />
      <ConfirmDialog
        open={confirmRegradeCount !== null}
        theme="dark"
        title="Save & Republish (recalculate affected students)?"
        message={`This will re-grade ${confirmRegradeCount ?? 0} existing attempt(s) that used the previous version of this question. Some students' scores may change. This is logged and cannot be silently undone.`}
        confirmLabel="Save & Republish"
        busy={regrading}
        onCancel={() => setConfirmRegradeCount(null)}
        onConfirm={() => void executeRepublishAndRegrade()}
      />
      <RegradeDiffModal
        open={regradeSummary !== null}
        onClose={() => setRegradeSummary(null)}
        summary={regradeSummary}
      />
    </div>
  );
}
