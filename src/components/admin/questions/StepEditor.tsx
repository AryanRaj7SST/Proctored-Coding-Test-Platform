'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Input, Select } from '@/components/ui';
import { STEP_ACTIONS } from '@shared/test-spec';
import { IconButton, MiniField } from './bits';
import { parseNumberInput, readNumber, readString, withKey } from './field-access';
import { STEP_LABELS, defaultStep, stepNeedsSelector, type RawObject, type StepAction } from './test-body';

const COMMON_KEYS = [
  'Enter',
  'Escape',
  'Tab',
  'Space',
  'Backspace',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
];

const mono = 'h-8 font-mono text-xs';
const compact = 'h-8 text-xs';

/** One interaction step: action picker + the fields that action needs. */
export function StepEditor({
  index,
  count,
  value,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  value: RawObject;
  onChange: (next: RawObject) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const action = readString(value, 'action');
  const known = (STEP_ACTIONS as readonly string[]).includes(action);
  const set = (key: string, v: unknown) => onChange(withKey(value, key, v));
  const viewport = (value.viewport ?? {}) as Record<string, unknown>;

  return (
    <div className="rounded-md bg-ink-900 p-3 ring-1 ring-ink-700">
      <div className="flex flex-wrap items-end gap-2">
        <span className="mb-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[11px] font-semibold text-slate-300">
          {index + 1}
        </span>
        <MiniField label="Action" className="w-52">
          {(id) => (
            <Select
              id={id}
              className={compact}
              value={action}
              onChange={(e) => onChange(defaultStep(e.target.value as StepAction, value))}
            >
              {!known ? <option value={action}>Unknown ({action || 'none'})</option> : null}
              {STEP_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {STEP_LABELS[a]}
                </option>
              ))}
            </Select>
          )}
        </MiniField>

        {stepNeedsSelector(action) || action === 'press' ? (
          <MiniField
            label={action === 'press' ? 'Selector (optional)' : 'CSS selector'}
            className="min-w-40 flex-1"
          >
            {(id) => (
              <Input
                id={id}
                className={mono}
                value={readString(value, 'selector')}
                placeholder="#submit-btn"
                onChange={(e) =>
                  set('selector', action === 'press' && !e.target.value ? undefined : e.target.value)
                }
              />
            )}
          </MiniField>
        ) : null}

        {action === 'click' ? (
          <MiniField label="Match # (optional)" className="w-32">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                className={compact}
                placeholder="1st"
                value={typeof value.nth === 'number' ? String(value.nth + 1) : ''}
                onChange={(e) => {
                  const n = parseNumberInput(e.target.value);
                  set('nth', n === undefined || n <= 1 ? undefined : n - 1);
                }}
              />
            )}
          </MiniField>
        ) : null}

        {action === 'clickText' ? (
          <>
            <MiniField label="Visible text" className="min-w-40 flex-1">
              {(id) => (
                <Input
                  id={id}
                  className={compact}
                  value={readString(value, 'text')}
                  placeholder="Add to cart"
                  onChange={(e) => set('text', e.target.value)}
                />
              )}
            </MiniField>
            <MiniField label="Element" className="w-28">
              {(id) => (
                <Select
                  id={id}
                  className={compact}
                  value={readString(value, 'role')}
                  onChange={(e) => set('role', e.target.value || undefined)}
                >
                  <option value="">Any</option>
                  <option value="button">Button</option>
                  <option value="link">Link</option>
                </Select>
              )}
            </MiniField>
            <label className="mb-2 inline-flex items-center gap-1.5 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={value.exact === true}
                onChange={(e) => set('exact', e.target.checked ? true : undefined)}
                className="h-3.5 w-3.5 accent-brand-500"
              />
              Exact match
            </label>
          </>
        ) : null}

        {action === 'fill' || action === 'select' ? (
          <MiniField label={action === 'fill' ? 'Text to type' : 'Option value'} className="min-w-32 flex-1">
            {(id) => (
              <Input
                id={id}
                className={compact}
                value={readString(value, 'value')}
                onChange={(e) => set('value', e.target.value)}
              />
            )}
          </MiniField>
        ) : null}

        {action === 'press' ? (
          <MiniField label="Key" className="w-36">
            {(id) => (
              <>
                <Input
                  id={id}
                  list={`${id}-keys`}
                  className={mono}
                  value={readString(value, 'key')}
                  onChange={(e) => set('key', e.target.value)}
                />
                <datalist id={`${id}-keys`}>
                  {COMMON_KEYS.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </>
            )}
          </MiniField>
        ) : null}

        {action === 'wait' ? (
          <MiniField label="Milliseconds (max 5000)" className="w-44">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                max={5000}
                className={compact}
                value={readNumber(value, 'ms')}
                onChange={(e) => set('ms', parseNumberInput(e.target.value))}
              />
            )}
          </MiniField>
        ) : null}

        {action === 'waitFor' ? (
          <MiniField label="Until it is" className="w-32">
            {(id) => (
              <Select
                id={id}
                className={compact}
                value={readString(value, 'state') || 'visible'}
                onChange={(e) => set('state', e.target.value)}
              >
                <option value="visible">Visible</option>
                <option value="hidden">Hidden</option>
                <option value="attached">In the DOM</option>
              </Select>
            )}
          </MiniField>
        ) : null}

        {action === 'setViewport' ? (
          <>
            <MiniField label="Width (px)" className="w-28">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={200}
                  max={2560}
                  className={compact}
                  value={readNumber(viewport, 'width')}
                  onChange={(e) => set('viewport', { ...viewport, width: parseNumberInput(e.target.value) })}
                />
              )}
            </MiniField>
            <MiniField label="Height (px)" className="w-28">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={200}
                  max={2560}
                  className={compact}
                  value={readNumber(viewport, 'height')}
                  onChange={(e) => set('viewport', { ...viewport, height: parseNumberInput(e.target.value) })}
                />
              )}
            </MiniField>
          </>
        ) : null}

        <div className="mb-0.5 ml-auto flex items-center">
          <IconButton label={`Move step ${index + 1} up`} onClick={() => onMove(-1)} disabled={index === 0}>
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton
            label={`Move step ${index + 1} down`}
            onClick={() => onMove(1)}
            disabled={index === count - 1}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={`Remove step ${index + 1}`} onClick={onRemove} tone="bad">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
