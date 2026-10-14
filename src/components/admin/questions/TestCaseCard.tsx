'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Copy, Trash2 } from 'lucide-react';
import { Badge, Field, Input, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { IconButton, Switch } from './bits';
import { ReadableTestPreview } from './ReadableTestPreview';
import { TestBodyBuilder, type BuilderMode } from './TestBodyBuilder';
import { parseBody } from './test-body';
import type { DraftTest } from './types';

/** One test case: collapsed summary row, expandable editor + "what students see". */
export function TestCaseCard({
  test,
  index,
  count,
  problems,
  serverErrors,
  shareText,
  open,
  readOnly,
  onToggleOpen,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: {
  test: DraftTest;
  index: number;
  count: number;
  problems: string[];
  serverErrors: string[];
  /** "2 marks" for an enabled test, null for a disabled one. */
  shareText: string | null;
  open: boolean;
  readOnly?: boolean;
  onToggleOpen: () => void;
  onChange: (patch: Partial<DraftTest>) => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  // Start in JSON mode when the stored body is something the builder cannot show.
  const [mode, setMode] = React.useState<BuilderMode>(() =>
    parseBody(test.testCode).ok ? 'builder' : 'json',
  );
  const allProblems = [...problems, ...serverErrors];
  const valid = allProblems.length === 0;
  const idPrefix = `test-${test._key}`;
  const panelId = `${idPrefix}-panel`;

  return (
    <li
      className={cn(
        'shadow-xs rounded-lg border bg-white transition',
        valid ? 'border-slate-200' : 'border-rose-300 ring-1 ring-rose-200',
        !test.enabled && 'opacity-80',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          )}
          <span className="font-mono text-xs text-slate-500">#{index + 1}</span>
          <span
            className={cn('truncate text-sm', test.enabled ? 'font-medium text-slate-900' : 'text-slate-400')}
          >
            {test.name.trim() || 'Untitled test case'}
          </span>
          {!valid ? (
            <Badge tone="bad">
              {allProblems.length} problem{allProblems.length === 1 ? '' : 's'}
            </Badge>
          ) : null}
          {test.hidden ? <Badge tone="warn">hidden</Badge> : null}
          {!test.enabled ? <Badge tone="neutral">disabled · not counted</Badge> : null}
        </button>

        {shareText ? <span className="font-mono text-xs font-medium text-slate-500">{shareText}</span> : null}

        <div className="flex items-center gap-1">
          <Switch
            checked={test.enabled}
            onChange={(enabled) => onChange({ enabled })}
            label={`${test.enabled ? 'Disable' : 'Enable'} test case ${index + 1}`}
            disabled={readOnly}
          />
          <IconButton
            label={`Move test case ${index + 1} up`}
            onClick={() => onMove(-1)}
            disabled={readOnly || index === 0}
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton
            label={`Move test case ${index + 1} down`}
            onClick={() => onMove(1)}
            disabled={readOnly || index === count - 1}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={`Duplicate test case ${index + 1}`} onClick={onDuplicate} disabled={readOnly}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
          <IconButton
            label={`Delete test case ${index + 1}`}
            onClick={onRemove}
            tone="bad"
            disabled={readOnly}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {open ? (
        <div
          id={panelId}
          className="grid gap-4 border-t border-slate-100 p-4 xl:grid-cols-[minmax(0,1fr)_300px]"
        >
          <div className="min-w-0 space-y-4">
            <fieldset disabled={readOnly} className="space-y-4">
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2.5">
                <Switch
                  checked={Boolean(test.hidden)}
                  onChange={(hidden) => onChange({ hidden })}
                  label={`Hidden test case ${index + 1}`}
                  disabled={readOnly}
                />
                <div className="text-xs">
                  <span className="font-medium text-slate-800">Hidden test case</span>
                  <p className="text-slate-500">
                    Conceals test definition, steps, checks, and failure details from students.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Name" required htmlFor={`${idPrefix}-name`} hint="Unique within this question.">
                  <Input
                    id={`${idPrefix}-name`}
                    value={test.name}
                    maxLength={140}
                    onChange={(e) => onChange({ name: e.target.value })}
                    placeholder="Clicking Add appends a list item"
                  />
                </Field>
                <Field
                  label="Short description"
                  htmlFor={`${idPrefix}-desc`}
                  hint="Optional. Shown when there is no expected behaviour."
                >
                  <Input
                    id={`${idPrefix}-desc`}
                    value={test.description}
                    maxLength={2000}
                    onChange={(e) => onChange({ description: e.target.value })}
                  />
                </Field>
              </div>
              <Field
                label="Expected behaviour"
                htmlFor={`${idPrefix}-expected`}
                hint="Student-visible. Describe in plain words what the page should do for this test to pass."
              >
                <Textarea
                  id={`${idPrefix}-expected`}
                  rows={2}
                  maxLength={2000}
                  value={test.expectedBehavior}
                  onChange={(e) => onChange({ expectedBehavior: e.target.value })}
                />
              </Field>
            </fieldset>

            <TestBodyBuilder
              testCode={test.testCode}
              onChange={(testCode) => onChange({ testCode })}
              mode={mode}
              onModeChange={setMode}
              readOnly={readOnly}
            />
          </div>

          <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start" aria-label="What students see">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">What students see</p>
            <ReadableTestPreview
              name={test.name}
              description={test.description}
              expectedBehavior={test.expectedBehavior}
              testCode={test.testCode}
              shareText={shareText}
              hidden={test.hidden}
            />
            {!test.enabled ? (
              <p className="text-xs text-slate-500">
                Disabled: students do not see it and it is not run or counted.
              </p>
            ) : null}
            {allProblems.length > 0 ? (
              <div
                className="shadow-xs rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
                role="alert"
              >
                <p className="font-semibold text-rose-900">Fix before saving:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-rose-700">
                  {allProblems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </li>
  );
}
