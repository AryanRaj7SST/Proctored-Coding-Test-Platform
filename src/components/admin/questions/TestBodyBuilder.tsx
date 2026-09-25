'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button, Input, Select, Tabs } from '@/components/ui';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { DEFAULT_VIEWPORT, SPEC_LIMITS, VIEWPORT_PRESETS } from '@shared/test-spec';
import { MiniField, Notice } from './bits';
import { AssertionEditor } from './AssertionEditor';
import { StepEditor } from './StepEditor';
import { parseNumberInput } from './field-access';
import {
  defaultAssertion,
  defaultStep,
  formatJson,
  parseBody,
  serializeBody,
  type BodyModel,
  type RawObject,
} from './test-body';

export type BuilderMode = 'builder' | 'json';

function move<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(target, 0, item);
  return next;
}

function viewportPreset(model: BodyModel): string {
  if (!model.viewport) return 'default';
  const match = Object.entries(VIEWPORT_PRESETS).find(
    ([, vp]) => vp.width === model.viewport?.width && vp.height === model.viewport?.height,
  );
  return match ? match[0] : 'custom';
}

/**
 * Edits one test case body. The JSON string is the single source of truth:
 * the builder parses it, edits the parsed object and serialises it back, so
 * both views always show the same test. Invalid JSON can only be fixed in the
 * JSON view; the builder explains why it cannot show it.
 */
export function TestBodyBuilder({
  testCode,
  onChange,
  mode,
  onModeChange,
  readOnly,
}: {
  testCode: string;
  onChange: (next: string) => void;
  mode: BuilderMode;
  onModeChange: (mode: BuilderMode) => void;
  readOnly?: boolean;
}) {
  const parsed = React.useMemo(() => parseBody(testCode), [testCode]);

  const update = (patch: Partial<BodyModel>) => {
    if (!parsed.ok) return;
    onChange(serializeBody({ ...parsed.model, ...patch }));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          tabs={[
            { id: 'builder', label: 'Builder' },
            { id: 'json', label: 'Advanced (JSON)' },
          ]}
          active={mode}
          onChange={(id) => onModeChange(id as BuilderMode)}
        />
        {mode === 'json' ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={readOnly || !parsed.ok}
            onClick={() => onChange(formatJson(testCode))}
          >
            Format JSON
          </Button>
        ) : null}
      </div>

      {mode === 'json' ? (
        <div className="overflow-hidden rounded-md ring-1 ring-ink-700">
          <CodeEditor
            value={testCode}
            language="javascript"
            onChange={onChange}
            readOnly={readOnly}
            height={320}
          />
        </div>
      ) : !parsed.ok ? (
        <Notice
          tone="warn"
          title="The builder cannot show this test body"
          action={
            <Button size="sm" variant="secondary" onClick={() => onModeChange('json')}>
              Open JSON
            </Button>
          }
        >
          <p>{parsed.reason} Fix it in Advanced (JSON) mode; the builder will pick it up again.</p>
        </Notice>
      ) : (
        <fieldset disabled={readOnly}>
          <BuilderForm model={parsed.model} update={update} />
        </fieldset>
      )}
    </div>
  );
}

function BuilderForm({ model, update }: { model: BodyModel; update: (patch: Partial<BodyModel>) => void }) {
  // "Custom" stays selected even when the typed size happens to match a preset.
  const [customViewport, setCustomViewport] = React.useState(false);
  const preset = customViewport ? 'custom' : viewportPreset(model);

  const setStep = (i: number, next: RawObject) =>
    update({ steps: model.steps.map((s, idx) => (idx === i ? next : s)) });
  const setAssertion = (i: number, next: RawObject) =>
    update({ assertions: model.assertions.map((a, idx) => (idx === i ? next : a)) });

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">Page setup</legend>
        <div className="flex flex-wrap items-end gap-2">
          <MiniField label="Screen size" className="w-52">
            {(id) => (
              <Select
                id={id}
                className="h-8 text-xs"
                value={preset}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomViewport(v === 'custom');
                  const presetViewport = VIEWPORT_PRESETS[v];
                  if (v === 'default') update({ viewport: undefined });
                  else if (presetViewport) update({ viewport: { ...presetViewport } });
                  else update({ viewport: { ...(model.viewport ?? DEFAULT_VIEWPORT) } });
                }}
              >
                <option value="default">
                  Default ({DEFAULT_VIEWPORT.width}×{DEFAULT_VIEWPORT.height})
                </option>
                {Object.entries(VIEWPORT_PRESETS).map(([name, vp]) => (
                  <option key={name} value={name}>
                    {name} ({vp.width}×{vp.height})
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </Select>
            )}
          </MiniField>
          {preset === 'custom' ? (
            <>
              <MiniField label="Width (px)" className="w-28">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={SPEC_LIMITS.minViewport}
                    max={SPEC_LIMITS.maxViewport}
                    className="h-8 text-xs"
                    value={model.viewport?.width ?? ''}
                    onChange={(e) =>
                      update({ viewport: { ...model.viewport, width: parseNumberInput(e.target.value) } })
                    }
                  />
                )}
              </MiniField>
              <MiniField label="Height (px)" className="w-28">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={SPEC_LIMITS.minViewport}
                    max={SPEC_LIMITS.maxViewport}
                    className="h-8 text-xs"
                    value={model.viewport?.height ?? ''}
                    onChange={(e) =>
                      update({ viewport: { ...model.viewport, height: parseNumberInput(e.target.value) } })
                    }
                  />
                )}
              </MiniField>
            </>
          ) : null}
          <MiniField label="Timeout ms (optional)" className="w-40">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={500}
                max={20000}
                step={500}
                placeholder="runner default"
                className="h-8 text-xs"
                value={model.timeoutMs ?? ''}
                onChange={(e) => update({ timeoutMs: parseNumberInput(e.target.value) })}
              />
            )}
          </MiniField>
          <MiniField label="Failure message (optional)" className="min-w-48 flex-1">
            {(id) => (
              <Input
                id={id}
                className="h-8 text-xs"
                maxLength={SPEC_LIMITS.maxTextLength}
                placeholder="Shown to the student when this test fails"
                value={model.failureMessage ?? ''}
                onChange={(e) => update({ failureMessage: e.target.value || undefined })}
              />
            )}
          </MiniField>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Interactions{' '}
          <span className="font-normal normal-case text-slate-500">· run in order, before the checks</span>
        </legend>
        {model.steps.length === 0 ? (
          <p className="text-xs text-slate-500">
            No interactions: the checks run on the page as it loads. Add clicks, typing or key presses to test
            behaviour.
          </p>
        ) : (
          <div className="space-y-2">
            {model.steps.map((step, i) => (
              <StepEditor
                key={i}
                index={i}
                count={model.steps.length}
                value={step}
                onChange={(next) => setStep(i, next)}
                onMove={(delta) => update({ steps: move(model.steps, i, delta) })}
                onRemove={() => update({ steps: model.steps.filter((_, idx) => idx !== i) })}
              />
            ))}
          </div>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={model.steps.length >= SPEC_LIMITS.maxSteps}
          onClick={() => update({ steps: [...model.steps, defaultStep('click')] })}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add interaction
        </Button>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Checks <span className="font-normal normal-case text-slate-500">· all must pass</span>
        </legend>
        {model.assertions.length === 0 ? (
          <p className="text-xs text-bad">A test case needs at least one check.</p>
        ) : (
          <div className="space-y-2">
            {model.assertions.map((assertion, i) => (
              <AssertionEditor
                key={i}
                index={i}
                count={model.assertions.length}
                value={assertion}
                onChange={(next) => setAssertion(i, next)}
                onMove={(delta) => update({ assertions: move(model.assertions, i, delta) })}
                onRemove={() => update({ assertions: model.assertions.filter((_, idx) => idx !== i) })}
              />
            ))}
          </div>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={model.assertions.length >= SPEC_LIMITS.maxAssertions}
          onClick={() => update({ assertions: [...model.assertions, defaultAssertion('exists')] })}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add check
        </Button>
      </fieldset>
    </div>
  );
}
