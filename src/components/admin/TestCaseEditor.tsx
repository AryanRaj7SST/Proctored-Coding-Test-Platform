'use client';

import * as React from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, EmptyState, Input, Select, Tabs } from '@/components/ui';
import { SPEC_LIMITS, type FnCompareMode } from '@shared/test-spec';
import { Notice } from './questions/bits';
import { duplicateTest, newKey, newTest, suiteProblems, testProblems, testServerErrors } from './questions/draft';
import { formatMarks, marksWord, equalShare, parseMarks, splitSummary } from './questions/marks';
import { TemplatePicker } from './questions/TemplatePicker';
import { TestCaseCard } from './questions/TestCaseCard';
import { JsonTestImporterModal } from './questions/JsonTestImporterModal';
import type { DraftTest, QuestionDraft } from './questions/types';

interface FnTableRow {
  _key: string;
  name: string;
  fn: string;
  argsText: string;
  expectedText: string;
  compare: FnCompareMode;
  hidden: boolean;
  enabled: boolean;
}

function testToFnRow(test: DraftTest, defaultFn: string = 'solve'): FnTableRow {
  let fn = defaultFn;
  let argsText = '[]';
  let expectedText = '""';
  let compare: FnCompareMode = 'deepEqual';

  try {
    const parsed = JSON.parse(test.testCode);
    const fnAssertion = (parsed.assertions as Array<Record<string, unknown>>)?.find((a) => a.type === 'fn');
    if (fnAssertion) {
      if (typeof fnAssertion.fn === 'string') fn = fnAssertion.fn;
      if (fnAssertion.args !== undefined) argsText = JSON.stringify(fnAssertion.args);
      if (fnAssertion.expected !== undefined) expectedText = JSON.stringify(fnAssertion.expected);
      if (typeof fnAssertion.compare === 'string') compare = fnAssertion.compare as FnCompareMode;
    }
  } catch {}

  return {
    _key: test._key,
    name: test.name,
    fn,
    argsText,
    expectedText,
    compare,
    hidden: Boolean(test.hidden),
    enabled: test.enabled !== false,
  };
}

function fnRowToTest(row: FnTableRow): DraftTest {
  let args: unknown = [];
  try {
    args = JSON.parse(row.argsText);
  } catch {
    args = [row.argsText];
  }
  if (!Array.isArray(args)) args = [args];

  let expected: unknown = null;
  try {
    expected = JSON.parse(row.expectedText);
  } catch {
    expected = row.expectedText;
  }

  const body = {
    assertions: [
      {
        type: 'fn',
        fn: row.fn || 'solve',
        args,
        expected,
        compare: row.compare || 'deepEqual',
      },
    ],
  };

  return {
    _key: row._key,
    name: row.name || `${row.fn}(${row.argsText.slice(0, 20)})`,
    description: '',
    expectedBehavior: '',
    enabled: row.enabled,
    hidden: row.hidden,
    testCode: JSON.stringify(body, null, 2),
  };
}

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
  const [viewMode, setViewMode] = React.useState<'cards' | 'table'>('cards');

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
            <Sparkles className="mr-1 h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
            AI Prompt / JSON
          </Button>
          <Button size="sm" onClick={() => setPicking(true)} disabled={readOnly || atLimit}>
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
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

      {tests.length > 0 ? (
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <Tabs
            tabs={[
              { id: 'cards', label: 'Cards View' },
              { id: 'table', label: 'Function Table Editor' },
            ]}
            active={viewMode}
            onChange={(id) => setViewMode(id as 'cards' | 'table')}
          />
        </div>
      ) : null}

      {tests.length === 0 ? (
        <EmptyState
          title="No test cases yet"
          description="Test cases check what the student's page does: elements, styles, clicks, typing and JavaScript. The question cannot be validated or published without at least one enabled test case."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" onClick={() => setPicking(true)} disabled={readOnly}>
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Add the first test case
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setJsonModalOpen(true)}
                disabled={readOnly}
              >
                <Sparkles className="mr-1 h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                Import via JSON / AI Prompt
              </Button>
            </div>
          }
        />
      ) : viewMode === 'table' ? (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-2 px-3 w-10">#</th>
                  <th className="py-2 px-3 w-32">Function</th>
                  <th className="py-2 px-3">Arguments (JSON array)</th>
                  <th className="py-2 px-3">Expected (JSON)</th>
                  <th className="py-2 px-3 w-36">Compare</th>
                  <th className="py-2 px-3 w-20 text-center">Hidden?</th>
                  <th className="py-2 px-3 w-16 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {tests.map((test, idx) => {
                  const row = testToFnRow(test);
                  return (
                    <tr key={test._key} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 text-slate-400 font-sans">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <Input
                          className="h-7 text-xs font-mono"
                          value={row.fn}
                          placeholder="solve"
                          readOnly={readOnly}
                          onChange={(e) => {
                            const updated = { ...row, fn: e.target.value };
                            onChange(tests.map((t) => (t._key === test._key ? fnRowToTest(updated) : t)));
                          }}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          className="h-7 text-xs font-mono"
                          value={row.argsText}
                          placeholder="[1, 2]"
                          readOnly={readOnly}
                          onChange={(e) => {
                            const updated = { ...row, argsText: e.target.value };
                            onChange(tests.map((t) => (t._key === test._key ? fnRowToTest(updated) : t)));
                          }}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          className="h-7 text-xs font-mono"
                          value={row.expectedText}
                          placeholder="3"
                          readOnly={readOnly}
                          onChange={(e) => {
                            const updated = { ...row, expectedText: e.target.value };
                            onChange(tests.map((t) => (t._key === test._key ? fnRowToTest(updated) : t)));
                          }}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Select
                          className="h-7 text-xs font-sans"
                          value={row.compare}
                          disabled={readOnly}
                          onChange={(e) => {
                            const updated = { ...row, compare: e.target.value as FnCompareMode };
                            onChange(tests.map((t) => (t._key === test._key ? fnRowToTest(updated) : t)));
                          }}
                        >
                          <option value="deepEqual">deepEqual</option>
                          <option value="unorderedArray">unorderedArray</option>
                          <option value="float">float</option>
                          <option value="trim">trim</option>
                        </Select>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={row.hidden}
                          disabled={readOnly}
                          onChange={(e) => {
                            const updated = { ...row, hidden: e.target.checked };
                            onChange(tests.map((t) => (t._key === test._key ? fnRowToTest(updated) : t)));
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={readOnly}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                          onClick={() => setPendingDelete(test)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={readOnly || atLimit}
            onClick={() => {
              const newRow: FnTableRow = {
                _key: newKey(),
                name: `Test case ${tests.length + 1}`,
                fn: 'solve',
                argsText: '[]',
                expectedText: '0',
                compare: 'deepEqual',
                hidden: false,
                enabled: true,
              };
              onChange([...tests, fnRowToTest(newRow)]);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Add Row
          </Button>
        </div>
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
