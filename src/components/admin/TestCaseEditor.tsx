'use client';

import * as React from 'react';
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';
import {
  VIEWPORT_PRESETS,
  describeAssertion,
  validateTestCaseBody,
  type TestCaseBody,
} from '@shared/test-spec';
import type { QuestionTestInput } from '@/lib/validation';

export type DraftTest = Omit<QuestionTestInput, 'id'> & { id?: string; _key: string };

export function newDraftTest(order: number): DraftTest {
  return {
    _key: `new-${Math.random().toString(36).slice(2, 9)}`,
    name: '',
    description: '',
    testType: 'DECLARATIVE',
    testCode: JSON.stringify(
      {
        viewport: { width: 1280, height: 720 },
        steps: [],
        assertions: [{ type: 'exists', selector: '#box', message: 'The element should be on the page.' }],
      } satisfies TestCaseBody,
      null,
      2,
    ),
    expectedBehavior: '',
    points: 10,
    order,
    hidden: true,
  };
}

const SNIPPETS: { label: string; body: TestCaseBody }[] = [
  {
    label: 'Element exists',
    body: { assertions: [{ type: 'exists', selector: '#box', message: 'The element should be on the page.' }] },
  },
  {
    label: 'Click changes a colour',
    body: {
      steps: [{ action: 'click', selector: '#add' }],
      assertions: [
        { type: 'css', selector: '#box', property: 'background-color', equals: 'tomato', color: true },
      ],
    },
  },
  {
    label: 'Three equal columns with a gap',
    body: {
      viewport: { width: 1280, height: 720 },
      assertions: [
        { type: 'gridColumns', selector: '.grid', equals: 3, equalWidths: true },
        { type: 'gap', selector: '.grid', equals: 20, axis: 'column' },
      ],
    },
  },
  {
    label: 'Responsive: one per row on mobile',
    body: {
      viewport: { width: 400, height: 800 },
      assertions: [{ type: 'boxesPerRow', selector: '.card', equals: 1 }],
    },
  },
  {
    label: 'No console errors',
    body: { assertions: [{ type: 'noConsoleErrors' }] },
  },
];

/**
 * Authoring UI for the behaviour DSL.
 *
 * The body is validated with exactly the same `validateTestCaseBody` the server
 * and the runner use, so what the author sees here is what will execute. There
 * is deliberately no way to assert on the student's source text — see
 * shared/test-spec.ts.
 */
export function TestCaseEditor({
  tests,
  onChange,
  disabled,
}: {
  tests: DraftTest[];
  onChange: (next: DraftTest[]) => void;
  disabled?: boolean;
}) {
  const [openKey, setOpenKey] = React.useState<string | null>(tests[0]?._key ?? null);

  const update = (key: string, patch: Partial<DraftTest>) =>
    onChange(tests.map((t) => (t._key === key ? { ...t, ...patch } : t)));

  const remove = (key: string) =>
    onChange(tests.filter((t) => t._key !== key).map((t, i) => ({ ...t, order: i })));

  const move = (key: string, delta: number) => {
    const index = tests.findIndex((t) => t._key === key);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= tests.length) return;
    const next = tests.slice();
    const [item] = next.splice(index, 1);
    if (item) next.splice(target, 0, item);
    onChange(next.map((t, i) => ({ ...t, order: i })));
  };

  const totalPoints = tests.reduce((sum, t) => sum + (Number(t.points) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          {tests.length} test{tests.length === 1 ? '' : 's'} · {totalPoints} points total
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => {
            const draft = newDraftTest(tests.length);
            onChange([...tests, draft]);
            setOpenKey(draft._key);
          }}
        >
          Add test case
        </Button>
      </div>

      {tests.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink-600 p-4 text-center text-xs text-slate-500">
          No test cases yet. A question cannot be published until it has at least one test that passes against the
          reference solution.
        </p>
      ) : null}

      <ul className="space-y-2">
        {tests.map((test, i) => {
          const parsed = validateTestCaseBody(test.testCode);
          const open = openKey === test._key;
          return (
            <li key={test._key} className="rounded-md bg-ink-900 ring-1 ring-ink-700">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? null : test._key)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="text-xs text-slate-500">#{i + 1}</span>
                  <span className="truncate text-sm text-slate-200">{test.name || 'Untitled test'}</span>
                  <Badge tone={parsed.ok ? 'ok' : 'bad'}>{parsed.ok ? 'valid' : 'invalid'}</Badge>
                  <Badge tone={test.hidden ? 'neutral' : 'info'}>{test.hidden ? 'hidden' : 'visible'}</Badge>
                  <span className="text-xs text-slate-500">{test.points} pts</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(test._key, -1)}
                    disabled={disabled || i === 0}
                    aria-label="Move test up"
                    className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-ink-800 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(test._key, 1)}
                    disabled={disabled || i === tests.length - 1}
                    aria-label="Move test down"
                    className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-ink-800 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(test._key)}
                    disabled={disabled}
                    aria-label="Delete test"
                    className="rounded px-1.5 py-1 text-xs text-rose-400 hover:bg-ink-800 disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {open ? (
                <div className="space-y-3 border-t border-ink-700 p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <Field label="Test name" required htmlFor={`name-${test._key}`}>
                        <Input
                          id={`name-${test._key}`}
                          value={test.name}
                          disabled={disabled}
                          onChange={(e) => update(test._key, { name: e.target.value })}
                          placeholder="Clicking Add color turns the box tomato"
                        />
                      </Field>
                    </div>
                    <Field label="Points" htmlFor={`points-${test._key}`}>
                      <Input
                        id={`points-${test._key}`}
                        type="number"
                        min={0}
                        max={1000}
                        value={test.points}
                        disabled={disabled}
                        onChange={(e) => update(test._key, { points: Number(e.target.value) || 0 })}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Visible to students"
                      hint="Visible tests show their name in the question panel before the student runs anything."
                      htmlFor={`hidden-${test._key}`}
                    >
                      <Select
                        id={`hidden-${test._key}`}
                        value={test.hidden ? 'hidden' : 'visible'}
                        disabled={disabled}
                        onChange={(e) => update(test._key, { hidden: e.target.value === 'hidden' })}
                      >
                        <option value="hidden">Hidden</option>
                        <option value="visible">Visible (sample check)</option>
                      </Select>
                    </Field>
                    <Field label="Insert a starting point" htmlFor={`snippet-${test._key}`}>
                      <Select
                        id={`snippet-${test._key}`}
                        value=""
                        disabled={disabled}
                        onChange={(e) => {
                          const snippet = SNIPPETS.find((s) => s.label === e.target.value);
                          if (snippet) update(test._key, { testCode: JSON.stringify(snippet.body, null, 2) });
                        }}
                      >
                        <option value="">Choose a pattern…</option>
                        {SNIPPETS.map((s) => (
                          <option key={s.label} value={s.label}>
                            {s.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <Field
                    label="Description shown to students"
                    hint="Only used when the test is visible."
                    htmlFor={`desc-${test._key}`}
                  >
                    <Input
                      id={`desc-${test._key}`}
                      value={test.description ?? ''}
                      disabled={disabled}
                      onChange={(e) => update(test._key, { description: e.target.value })}
                    />
                  </Field>

                  <Field
                    label="Behaviour specification (JSON)"
                    error={parsed.ok ? undefined : parsed.errors.join(' · ')}
                    hint={
                      parsed.ok
                        ? 'Validated with the same parser the runner uses.'
                        : undefined
                    }
                    htmlFor={`code-${test._key}`}
                  >
                    <Textarea
                      id={`code-${test._key}`}
                      rows={12}
                      spellCheck={false}
                      value={test.testCode}
                      disabled={disabled}
                      onChange={(e) => update(test._key, { testCode: e.target.value })}
                      className="font-mono text-xs"
                    />
                  </Field>

                  {parsed.ok && parsed.value ? (
                    <div className="rounded-md bg-ink-850 p-3 text-xs ring-1 ring-ink-700">
                      <p className="mb-1 font-medium text-slate-300">This test will check that:</p>
                      <ul className="list-disc space-y-0.5 pl-5 text-slate-400">
                        {parsed.value.assertions.map((a, ai) => (
                          <li key={ai}>{describeAssertion(a)}</li>
                        ))}
                      </ul>
                      <p className="mt-2 text-slate-500">
                        Viewport:{' '}
                        {parsed.value.viewport
                          ? `${parsed.value.viewport.width}×${parsed.value.viewport.height}`
                          : `default (${VIEWPORT_PRESETS.desktop?.width}×${VIEWPORT_PRESETS.desktop?.height})`}
                        {parsed.value.steps?.length ? ` · ${parsed.value.steps.length} interaction step(s)` : ''}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
