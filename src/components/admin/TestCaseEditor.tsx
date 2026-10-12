'use client';

import * as React from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Button, ConfirmDialog, EmptyState } from '@/components/ui';
import { SPEC_LIMITS } from '@shared/test-spec';
import { Notice } from './questions/bits';
import { duplicateTest, newTest, suiteProblems, testProblems, testServerErrors } from './questions/draft';
import { formatMarks, marksWord, equalShare, parseMarks, splitSummary } from './questions/marks';
import { TemplatePicker } from './questions/TemplatePicker';
import { TestCaseCard } from './questions/TestCaseCard';
import { JsonTestImporterModal } from './questions/JsonTestImporterModal';
import type { DraftTest, QuestionDraft } from './questions/types';

/**
 * Step 4 of the question editor: the question's test cases.
 *
 * Every enabled test case is visible to students and the question's marks are
 * split equally between the enabled ones -- there are no hidden tests and no
 * per-test marks to edit. Bodies are validated with the same
 * `validateTestCaseBody` the server and runner use.
 */
export function TestCaseEditor({
  tests,
  onChange,
  marks,
  readOnly,
  serverErrors = {},
  questionDraft,
}: {
  tests: DraftTest[];
  onChange: (next: DraftTest[]) => void;
  /** The question's marks as typed (string), used for the live equal split. */
  marks: string;
  readOnly?: boolean;
  /** ApiError.details from the last save ("tests", "tests.2.name", ...). */
  serverErrors?: Record<string, string>;
  questionDraft?: Partial<QuestionDraft>;
}) {
  const [open, setOpen] = React.useState<Set<string>>(
    () => new Set(tests.length === 1 ? [tests[0]!._key] : []),
  );
  const [picking, setPicking] = React.useState(false);
  const [jsonModalOpen, setJsonModalOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<DraftTest | null>(null);

  const enabledCount = tests.filter((t) => t.enabled).length;
  const parsedMarks = parseMarks(marks);
  const { share } = equalShare(parsedMarks ?? 0, enabledCount);
  const shareText =
    parsedMarks !== null && enabledCount > 0 ? `${formatMarks(share)} ${marksWord(share)}` : null;
  const suite = suiteProblems(tests);
  const invalidCount = tests.filter((t) => testProblems(t, tests).length > 0).length;
  const names = tests.map((t) => t.name);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const update = (key: string, patch: Partial<DraftTest>) =>
    onChange(tests.map((t) => (t._key === key ? { ...t, ...patch } : t)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= tests.length) return;
    const next = tests.slice();
    const [item] = next.splice(index, 1);
    if (item) next.splice(target, 0, item);
    onChange(next);
  };

  const add = (test: DraftTest, at = tests.length) => {
    const next = tests.slice();
    next.splice(at, 0, test);
    onChange(next);
    setOpen((prev) => new Set(prev).add(test._key));
  };

  const atLimit = tests.length >= SPEC_LIMITS.maxTests;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{splitSummary(marks, enabledCount)}</p>
          <p className="text-xs text-slate-500">
            {tests.length} test case{tests.length === 1 ? '' : 's'}
            {tests.length !== enabledCount
              ? ` · ${tests.length - enabledCount} disabled (not run or counted)`
              : ''}
            {' · '}every enabled test case is shown to students. Marks are split automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setJsonModalOpen(true)}
            disabled={readOnly || atLimit}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1 text-blue-600" aria-hidden="true" />
            AI Prompt / JSON
          </Button>
          <Button size="sm" onClick={() => setPicking(true)} disabled={readOnly || atLimit}>
            <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            Add test case
          </Button>
        </div>
      </div>

      {tests.length > 0 && enabledCount === 0 ? (
        <Notice tone="warn" title="No test case is enabled" role="alert">
          <p>
            Disabled test cases are not run, shown or counted. Enable at least one; the question cannot be
            saved, validated or published without one.
          </p>
        </Notice>
      ) : null}
      {serverErrors.tests ? (
        <Notice tone="bad" title="The server rejected the test cases" role="alert">
          <ul className="list-disc space-y-0.5 pl-4">
            {serverErrors.tests.split(' | ').map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {suite
        .filter((p) => !p.startsWith('Enable at least one'))
        .map((p) => (
          <Notice key={p} tone="bad">
            {p}
          </Notice>
        ))}
      {invalidCount > 0 ? (
        <Notice tone="bad">
          {invalidCount} test case{invalidCount === 1 ? ' has' : 's have'} problems. Saving is blocked until
          they are fixed.
        </Notice>
      ) : null}

      {tests.length === 0 ? (
        <EmptyState
          title="No test cases yet"
          description="Test cases check what the student's page does: elements, styles, clicks, typing and JavaScript. The question cannot be validated or published without at least one enabled test case."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" onClick={() => setPicking(true)} disabled={readOnly}>
                <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Add the first test case
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setJsonModalOpen(true)}
                disabled={readOnly}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1 text-blue-600" aria-hidden="true" />
                Import via JSON / AI Prompt
              </Button>
            </div>
          }
        />
      ) : (
        <ol className="space-y-2">
          {tests.map((test, index) => (
            <TestCaseCard
              key={test._key}
              test={test}
              index={index}
              count={tests.length}
              problems={testProblems(test, tests)}
              serverErrors={testServerErrors(serverErrors, index)}
              shareText={test.enabled ? shareText : null}
              open={open.has(test._key)}
              readOnly={readOnly}
              onToggleOpen={() => toggle(test._key)}
              onChange={(patch) => update(test._key, patch)}
              onMove={(delta) => move(index, delta)}
              onDuplicate={() => {
                if (!atLimit) add(duplicateTest(test, names), index + 1);
              }}
              onRemove={() => setPendingDelete(test)}
            />
          ))}
        </ol>
      )}

      <TemplatePicker
        open={picking}
        onClose={() => setPicking(false)}
        onOpenJsonModal={() => setJsonModalOpen(true)}
        onPick={(template) => {
          setPicking(false);
          add(newTest(template, names));
        }}
      />

      <JsonTestImporterModal
        open={jsonModalOpen}
        onClose={() => setJsonModalOpen(false)}
        existingNames={names}
        questionDraft={questionDraft}
        onImport={(imported) => {
          const next = [...tests, ...imported];
          onChange(next);
          setOpen((prev) => {
            const s = new Set(prev);
            imported.forEach((t) => s.add(t._key));
            return s;
          });
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        theme="light"
        danger
        title="Delete test case?"
        message={`"${pendingDelete?.name.trim() || 'Untitled test case'}" will be removed when you save. This cannot be undone after saving.`}
        confirmLabel="Delete test case"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onChange(tests.filter((t) => t._key !== pendingDelete._key));
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
