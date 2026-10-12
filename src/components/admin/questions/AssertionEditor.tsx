'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Input, Select, Textarea } from '@/components/ui';
import { ASSERTION_TYPES } from '@shared/test-spec';
import { IconButton, MiniField } from './bits';
import { parseNumberInput, readNumber, readString, withKey } from './field-access';
import {
  ASSERTION_GROUPS,
  ASSERTION_LABELS,
  NUMERIC_OPS,
  defaultAssertion,
  type AssertionType,
  type RawObject,
} from './test-body';

const COMMON_CSS_PROPERTIES = [
  'color',
  'background-color',
  'display',
  'position',
  'font-size',
  'font-weight',
  'text-align',
  'justify-content',
  'align-items',
  'flex-direction',
  'flex-wrap',
  'border-radius',
  'border-color',
  'margin-top',
  'padding',
  'opacity',
  'visibility',
  'width',
  'height',
  'grid-template-columns',
];

const mono = 'h-8 font-mono text-xs';
const compact = 'h-8 text-xs';

/** One check: type picker + the fields that type needs + an optional custom description. */
export function AssertionEditor({
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
  const type = readString(value, 'type');
  const known = (ASSERTION_TYPES as readonly string[]).includes(type);
  const set = (key: string, v: unknown) => onChange(withKey(value, key, v));
  const needsSelector = known && type !== 'js' && type !== 'noConsoleErrors';

  return (
    <div className="space-y-2 rounded-md bg-slate-50 p-3 border border-slate-200 shadow-xs">
      <div className="flex flex-wrap items-end gap-2">
        <span className="mb-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700">
          {index + 1}
        </span>
        <MiniField label="Check" className="w-56">
          {(id) => (
            <Select
              id={id}
              className={compact}
              value={type}
              onChange={(e) => onChange(defaultAssertion(e.target.value as AssertionType, value))}
            >
              {!known ? <option value={type}>Unknown ({type || 'none'})</option> : null}
              {ASSERTION_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.types.map((t) => (
                    <option key={t} value={t}>
                      {ASSERTION_LABELS[t]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          )}
        </MiniField>

        {needsSelector ? (
          <MiniField label="CSS selector" className="min-w-40 flex-1">
            {(id) => (
              <Input
                id={id}
                className={mono}
                value={readString(value, 'selector')}
                placeholder=".card"
                onChange={(e) => set('selector', e.target.value)}
              />
            )}
          </MiniField>
        ) : null}

        <div className="mb-0.5 ml-auto flex items-center">
          <IconButton label={`Move check ${index + 1} up`} onClick={() => onMove(-1)} disabled={index === 0}>
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton
            label={`Move check ${index + 1} down`}
            onClick={() => onMove(1)}
            disabled={index === count - 1}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={`Remove check ${index + 1}`} onClick={onRemove} tone="bad">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <TypeFields type={type} value={value} set={set} onChange={onChange} />

      {known ? (
        <MiniField
          label="Custom description (optional)"
          hint="Replaces the generated sentence students see for this check."
        >
          {(id) => (
            <Input
              id={id}
              className={compact}
              value={readString(value, 'message')}
              maxLength={500}
              placeholder="e.g. The total should update to $30."
              onChange={(e) => set('message', e.target.value || undefined)}
            />
          )}
        </MiniField>
      ) : null}
    </div>
  );
}

function TypeFields({
  type,
  value,
  set,
  onChange,
}: {
  type: string;
  value: RawObject;
  set: (key: string, v: unknown) => void;
  onChange: (next: RawObject) => void;
}) {
  switch (type) {
    case 'count':
    case 'gridColumns':
    case 'boxesPerRow':
      return (
        <div className="flex flex-wrap items-end gap-2">
          <MiniField
            label={
              type === 'count' ? 'Exactly this many' : type === 'gridColumns' ? 'Columns' : 'Items per row'
            }
            className="w-40"
          >
            {(id) => (
              <Input
                id={id}
                type="number"
                min={type === 'count' ? 0 : 1}
                step={1}
                className={compact}
                value={readNumber(value, 'equals')}
                onChange={(e) => set('equals', parseNumberInput(e.target.value))}
              />
            )}
          </MiniField>
          {type === 'gridColumns' ? (
            <label className="mb-2 inline-flex items-center gap-1.5 text-xs text-slate-700 font-medium">
              <input
                type="checkbox"
                checked={value.equalWidths === true}
                onChange={(e) => set('equalWidths', e.target.checked ? true : undefined)}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              Columns must be equal width
            </label>
          ) : null}
          {type !== 'count' ? <ToleranceField value={value} set={set} /> : null}
        </div>
      );
    case 'text':
    case 'value':
    case 'attribute':
      return <MatchFields type={type} value={value} set={set} onChange={onChange} />;
    case 'hasClass':
    case 'notHasClass':
      return (
        <MiniField label="Class name (without the dot)" className="max-w-xs">
          {(id) => (
            <Input
              id={id}
              className={mono}
              value={readString(value, 'className')}
              placeholder="active"
              onChange={(e) => set('className', e.target.value)}
            />
          )}
        </MiniField>
      );
    case 'checked':
      return (
        <MiniField label="Expected state" className="w-40">
          {(id) => (
            <Select
              id={id}
              className={compact}
              value={value.equals === false ? 'unchecked' : 'checked'}
              onChange={(e) => set('equals', e.target.value === 'checked')}
            >
              <option value="checked">Checked</option>
              <option value="unchecked">Unchecked</option>
            </Select>
          )}
        </MiniField>
      );
    case 'validity':
      return (
        <MiniField
          label="Expected validity"
          className="w-60"
          hint="Uses the field's built-in validation (required, type, pattern, min/max…)."
        >
          {(id) => (
            <Select
              id={id}
              className={compact}
              value={value.valid === false ? 'invalid' : 'valid'}
              onChange={(e) => set('valid', e.target.value === 'valid')}
            >
              <option value="invalid">Invalid (input rejected)</option>
              <option value="valid">Valid (input accepted)</option>
            </Select>
          )}
        </MiniField>
      );
    case 'css':
      return <CssFields value={value} set={set} onChange={onChange} />;
    case 'cssNumber':
    case 'size':
      return (
        <div className="flex flex-wrap items-end gap-2">
          {type === 'cssNumber' ? (
            <PropertyField value={value} set={set} />
          ) : (
            <MiniField label="Dimension" className="w-28">
              {(id) => (
                <Select
                  id={id}
                  className={compact}
                  value={readString(value, 'dimension') || 'width'}
                  onChange={(e) => set('dimension', e.target.value)}
                >
                  <option value="width">Width</option>
                  <option value="height">Height</option>
                </Select>
              )}
            </MiniField>
          )}
          <MiniField label="Comparison" className="w-36">
            {(id) => (
              <Select
                id={id}
                className={compact}
                value={readString(value, 'op') || 'eq'}
                onChange={(e) => set('op', e.target.value)}
              >
                {NUMERIC_OPS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </Select>
            )}
          </MiniField>
          <MiniField label={type === 'size' ? 'Value (px)' : 'Value (number)'} className="w-32">
            {(id) => (
              <Input
                id={id}
                type="number"
                step="any"
                className={compact}
                value={readNumber(value, 'value')}
                onChange={(e) => set('value', parseNumberInput(e.target.value))}
              />
            )}
          </MiniField>
          <ToleranceField value={value} set={set} />
        </div>
      );
    case 'gap':
      return (
        <div className="flex flex-wrap items-end gap-2">
          <MiniField label="Gap (px)" className="w-28">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                step="any"
                className={compact}
                value={readNumber(value, 'equals')}
                onChange={(e) => set('equals', parseNumberInput(e.target.value))}
              />
            )}
          </MiniField>
          <MiniField label="Direction" className="w-40">
            {(id) => (
              <Select
                id={id}
                className={compact}
                value={readString(value, 'axis') || 'both'}
                onChange={(e) => set('axis', e.target.value)}
              >
                <option value="both">Rows and columns</option>
                <option value="column">Between columns</option>
                <option value="row">Between rows</option>
              </Select>
            )}
          </MiniField>
          <ToleranceField value={value} set={set} />
        </div>
      );
    case 'js':
      return <JsFields value={value} set={set} onChange={onChange} />;
    case 'noConsoleErrors':
      return <p className="text-xs text-slate-400">Passes when the page logs no errors to the console.</p>;
    case 'exists':
    case 'notExists':
    case 'visible':
    case 'hidden':
      return null;
    default:
      return (
        <p className="text-xs text-warn">
          This check type is not recognised. Switch to Advanced (JSON) to fix it, or pick a check above.
        </p>
      );
  }
}

function ToleranceField({ value, set }: { value: RawObject; set: (key: string, v: unknown) => void }) {
  return (
    <MiniField label="Tolerance (optional)" className="w-36">
      {(id) => (
        <Input
          id={id}
          type="number"
          min={0}
          step="any"
          placeholder="0.5"
          className={compact}
          value={readNumber(value, 'tolerance')}
          onChange={(e) => set('tolerance', parseNumberInput(e.target.value))}
        />
      )}
    </MiniField>
  );
}

function PropertyField({ value, set }: { value: RawObject; set: (key: string, v: unknown) => void }) {
  return (
    <MiniField label="CSS property" className="w-48">
      {(id) => (
        <>
          <Input
            id={id}
            list={`${id}-props`}
            className={mono}
            value={readString(value, 'property')}
            onChange={(e) => set('property', e.target.value.trim())}
          />
          <datalist id={`${id}-props`}>
            {COMMON_CSS_PROPERTIES.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </>
      )}
    </MiniField>
  );
}

/** equals / contains for text, value and attribute checks. */
function MatchFields({
  type,
  value,
  set,
  onChange,
}: {
  type: 'text' | 'value' | 'attribute';
  value: RawObject;
  set: (key: string, v: unknown) => void;
  onChange: (next: RawObject) => void;
}) {
  const mode: 'equals' | 'contains' =
    value.equals === undefined && value.contains !== undefined ? 'contains' : 'equals';
  const current = readString(value, mode);
  return (
    <div className="flex flex-wrap items-end gap-2">
      {type === 'attribute' ? (
        <MiniField label="Attribute" className="w-40">
          {(id) => (
            <Input
              id={id}
              className={mono}
              value={readString(value, 'name')}
              placeholder="aria-expanded"
              onChange={(e) => set('name', e.target.value.trim())}
            />
          )}
        </MiniField>
      ) : null}
      <MiniField label="Match" className="w-32">
        {(id) => (
          <Select
            id={id}
            className={compact}
            value={mode}
            onChange={(e) => {
              const nextMode = e.target.value as 'equals' | 'contains';
              const other = nextMode === 'equals' ? 'contains' : 'equals';
              onChange(withKey(withKey(value, other, undefined), nextMode, current));
            }}
          >
            <option value="equals">Equals</option>
            <option value="contains">Contains</option>
          </Select>
        )}
      </MiniField>
      <MiniField
        label={type === 'text' ? 'Text' : type === 'value' ? 'Value' : 'Attribute value'}
        className="min-w-40 flex-1"
      >
        {(id) => (
          <Input id={id} className={compact} value={current} onChange={(e) => set(mode, e.target.value)} />
        )}
      </MiniField>
    </div>
  );
}

function CssFields({
  value,
  set,
  onChange,
}: {
  value: RawObject;
  set: (key: string, v: unknown) => void;
  onChange: (next: RawObject) => void;
}) {
  const oneOf = Array.isArray(value.oneOf)
    ? value.oneOf.filter((v): v is string => typeof v === 'string')
    : null;
  const mode: 'equals' | 'oneOf' = value.equals === undefined && oneOf ? 'oneOf' : 'equals';
  const colour = value.color === true ? 'on' : value.color === false ? 'off' : 'auto';
  return (
    <div className="flex flex-wrap items-end gap-2">
      <PropertyField value={value} set={set} />
      <MiniField label="Match" className="w-32">
        {(id) => (
          <Select
            id={id}
            className={compact}
            value={mode}
            onChange={(e) => {
              if (e.target.value === 'oneOf') {
                const seed = readString(value, 'equals');
                onChange(withKey(withKey(value, 'equals', undefined), 'oneOf', seed ? [seed] : []));
              } else {
                onChange(withKey(withKey(value, 'oneOf', undefined), 'equals', oneOf?.[0] ?? ''));
              }
            }}
          >
            <option value="equals">Equals</option>
            <option value="oneOf">One of</option>
          </Select>
        )}
      </MiniField>
      <MiniField
        label={mode === 'oneOf' ? 'Accepted values (comma separated)' : 'Expected value'}
        className="min-w-40 flex-1"
      >
        {(id) =>
          mode === 'oneOf' ? (
            <Input
              id={id}
              className={mono}
              value={(oneOf ?? []).join(', ')}
              placeholder="flex, inline-flex"
              onChange={(e) =>
                set(
                  'oneOf',
                  e.target.value
                    .split(',')
                    .map((v) => v.trim())
                    .filter(Boolean),
                )
              }
            />
          ) : (
            <Input
              id={id}
              className={mono}
              value={readString(value, 'equals')}
              placeholder="tomato, 16px, flex…"
              onChange={(e) => set('equals', e.target.value)}
            />
          )
        }
      </MiniField>
      <MiniField label="Compare as colour" className="w-40">
        {(id) => (
          <Select
            id={id}
            className={compact}
            value={colour}
            onChange={(e) =>
              set('color', e.target.value === 'on' ? true : e.target.value === 'off' ? false : undefined)
            }
          >
            <option value="auto">Auto (by property)</option>
            <option value="on">Yes</option>
            <option value="off">No</option>
          </Select>
        )}
      </MiniField>
    </div>
  );
}

type JsExpectation = 'true' | 'false' | 'number' | 'string';

function JsFields({
  value,
  set,
  onChange,
}: {
  value: RawObject;
  set: (key: string, v: unknown) => void;
  onChange: (next: RawObject) => void;
}) {
  const equals = value.equals;
  const expectation: JsExpectation =
    equals === false
      ? 'false'
      : typeof equals === 'number'
        ? 'number'
        : typeof equals === 'string'
          ? 'string'
          : 'true';
  return (
    <div className="space-y-2">
      <MiniField
        label="Expression (runs in the student's page)"
        hint="Keep it side-effect free. Example: typeof window.add === 'function' && window.add(2, 3) === 5"
      >
        {(id) => (
          <Textarea
            id={id}
            rows={2}
            spellCheck={false}
            maxLength={500}
            className="font-mono text-xs"
            value={readString(value, 'expression')}
            onChange={(e) => set('expression', e.target.value)}
          />
        )}
      </MiniField>
      <div className="flex flex-wrap items-end gap-2">
        <MiniField label="Passes when it returns" className="w-44">
          {(id) => (
            <Select
              id={id}
              className={compact}
              value={expectation}
              onChange={(e) => {
                const next = e.target.value as JsExpectation;
                const seed =
                  next === 'false' ? false : next === 'number' ? 0 : next === 'string' ? '' : undefined;
                onChange(withKey(value, 'equals', seed));
              }}
            >
              <option value="true">true</option>
              <option value="false">false</option>
              <option value="number">A number</option>
              <option value="string">A string</option>
            </Select>
          )}
        </MiniField>
        {expectation === 'number' ? (
          <MiniField label="Expected number" className="w-36">
            {(id) => (
              <Input
                id={id}
                type="number"
                step="any"
                className={compact}
                value={readNumber(value, 'equals')}
                onChange={(e) => set('equals', parseNumberInput(e.target.value) ?? 0)}
              />
            )}
          </MiniField>
        ) : null}
        {expectation === 'string' ? (
          <MiniField label="Expected string" className="min-w-40 flex-1">
            {(id) => (
              <Input
                id={id}
                className={mono}
                value={readString(value, 'equals')}
                onChange={(e) => set('equals', e.target.value)}
              />
            )}
          </MiniField>
        ) : null}
      </div>
    </div>
  );
}
