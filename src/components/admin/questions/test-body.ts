/**
 * Loose, editable model of a test case body for the structured builder.
 *
 * The builder edits the parsed JSON object directly (not the validated value)
 * so half-filled rows -- an empty selector while typing -- survive edits. The
 * shared `validateTestCaseBody` is what decides whether the body is valid;
 * nothing here second-guesses it.
 */

import { STEP_ACTIONS, ASSERTION_TYPES } from '@shared/test-spec';

export type RawObject = Record<string, unknown>;

export interface BodyModel {
  viewport?: { width?: number; height?: number };
  steps: RawObject[];
  assertions: RawObject[];
  failureMessage?: string;
  timeoutMs?: number;
  /** Any other keys the author wrote, preserved verbatim. */
  rest: RawObject;
}

export type ParsedBody = { ok: true; model: BodyModel } | { ok: false; reason: string };

const isObject = (v: unknown): v is RawObject => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parse the stored JSON into the builder model, or explain why the builder cannot show it. */
export function parseBody(testCode: string): ParsedBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(testCode);
  } catch {
    return { ok: false, reason: 'The JSON cannot be parsed.' };
  }
  if (!isObject(parsed)) return { ok: false, reason: 'The test body must be a JSON object.' };
  const { viewport, steps, assertions, failureMessage, timeoutMs, ...rest } = parsed;
  if (steps !== undefined && !Array.isArray(steps)) return { ok: false, reason: '"steps" must be an array.' };
  if (assertions !== undefined && !Array.isArray(assertions)) {
    return { ok: false, reason: '"assertions" must be an array.' };
  }
  if (
    (steps ?? []).some((s: unknown) => !isObject(s)) ||
    (assertions ?? []).some((a: unknown) => !isObject(a))
  ) {
    return { ok: false, reason: 'Every step and check must be a JSON object.' };
  }
  if (viewport !== undefined && !isObject(viewport)) {
    return { ok: false, reason: '"viewport" must be an object.' };
  }
  if (failureMessage !== undefined && typeof failureMessage !== 'string') {
    return { ok: false, reason: '"failureMessage" must be a string.' };
  }
  if (timeoutMs !== undefined && typeof timeoutMs !== 'number') {
    return { ok: false, reason: '"timeoutMs" must be a number.' };
  }
  return {
    ok: true,
    model: {
      ...(viewport ? { viewport: viewport as BodyModel['viewport'] } : {}),
      steps: (steps ?? []) as RawObject[],
      assertions: (assertions ?? []) as RawObject[],
      ...(failureMessage !== undefined ? { failureMessage } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      rest,
    },
  };
}

/** Serialise the builder model back to the JSON stored in `testCode`. */
export function serializeBody(model: BodyModel): string {
  const out: RawObject = {
    ...(model.viewport ? { viewport: model.viewport } : {}),
    ...(model.steps.length ? { steps: model.steps } : {}),
    assertions: model.assertions,
    ...(model.failureMessage ? { failureMessage: model.failureMessage } : {}),
    ...(model.timeoutMs !== undefined ? { timeoutMs: model.timeoutMs } : {}),
    ...model.rest,
  };
  return JSON.stringify(out, null, 2);
}

/** Pretty-print JSON if it parses; otherwise return it untouched. */
export function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

export type StepAction = (typeof STEP_ACTIONS)[number];

export const STEP_LABELS: Record<StepAction, string> = {
  click: 'Click an element',
  clickText: 'Click by visible text',
  fill: 'Type into a field',
  press: 'Press a key',
  hover: 'Hover over an element',
  check: 'Tick a checkbox',
  uncheck: 'Untick a checkbox',
  select: 'Choose a dropdown option',
  scrollTo: 'Scroll to an element',
  waitFor: 'Wait for an element',
  wait: 'Wait (milliseconds)',
  setViewport: 'Resize the page',
};

const SELECTOR_ACTIONS: StepAction[] = [
  'click',
  'fill',
  'hover',
  'waitFor',
  'scrollTo',
  'check',
  'uncheck',
  'select',
];

export function stepNeedsSelector(action: string): boolean {
  return (SELECTOR_ACTIONS as string[]).includes(action);
}

/** A fresh step for `action`, carrying over the selector when it still applies. */
export function defaultStep(action: StepAction, previous?: RawObject): RawObject {
  const selector = typeof previous?.selector === 'string' ? previous.selector : '';
  switch (action) {
    case 'setViewport':
      return { action, viewport: { width: 480, height: 800 } };
    case 'clickText':
      return { action, text: typeof previous?.text === 'string' ? previous.text : '' };
    case 'fill':
    case 'select':
      return { action, selector, value: '' };
    case 'press':
      return { action, key: 'Enter', ...(selector ? { selector } : {}) };
    case 'wait':
      return { action, ms: 300 };
    case 'waitFor':
      return { action, selector, state: 'visible' };
    default:
      return { action, selector };
  }
}

/* ------------------------------------------------------------------ */
/* Assertions                                                          */
/* ------------------------------------------------------------------ */

export type AssertionType = (typeof ASSERTION_TYPES)[number];

export const ASSERTION_GROUPS: { label: string; types: AssertionType[] }[] = [
  { label: 'Elements', types: ['exists', 'notExists', 'visible', 'hidden', 'count'] },
  { label: 'Content & state', types: ['text', 'value', 'attribute', 'hasClass', 'notHasClass', 'checked'] },
  { label: 'Forms', types: ['validity'] },
  { label: 'Styles & layout', types: ['css', 'cssNumber', 'size', 'gridColumns', 'gap', 'boxesPerRow'] },
  { label: 'JavaScript', types: ['js', 'noConsoleErrors'] },
];

export const ASSERTION_LABELS: Record<AssertionType, string> = {
  exists: 'Element exists',
  notExists: 'Element does not exist',
  visible: 'Element is visible',
  hidden: 'Element is hidden',
  count: 'Number of matching elements',
  text: 'Text content',
  value: 'Input value',
  attribute: 'Attribute value',
  hasClass: 'Has a class',
  notHasClass: 'Does not have a class',
  checked: 'Checkbox / radio state',
  validity: 'Form field validity',
  css: 'CSS property value',
  cssNumber: 'CSS numeric value',
  size: 'Rendered width / height',
  gridColumns: 'Grid column count',
  gap: 'Gap between items',
  boxesPerRow: 'Items per row',
  js: 'JavaScript expression',
  noConsoleErrors: 'No console errors',
};

/** A fresh check for `type`, carrying over the selector and custom description. */
export function defaultAssertion(type: AssertionType, previous?: RawObject): RawObject {
  const selector = typeof previous?.selector === 'string' ? previous.selector : '';
  const message =
    typeof previous?.message === 'string' && previous.message ? { message: previous.message } : {};
  switch (type) {
    case 'noConsoleErrors':
      return { type, ...message };
    case 'js':
      return { type, expression: '', ...message };
    case 'count':
      return { type, selector, equals: 1, ...message };
    case 'text':
    case 'value':
      return { type, selector, equals: '', ...message };
    case 'attribute':
      return { type, selector, name: '', equals: '', ...message };
    case 'hasClass':
    case 'notHasClass':
      return { type, selector, className: '', ...message };
    case 'checked':
      return { type, selector, equals: true, ...message };
    case 'validity':
      return { type, selector, valid: false, ...message };
    case 'css':
      return { type, selector, property: 'color', equals: '', ...message };
    case 'cssNumber':
      return { type, selector, property: 'font-size', op: 'eq', value: 16, ...message };
    case 'size':
      return { type, selector, dimension: 'width', op: 'gte', value: 100, ...message };
    case 'gridColumns':
      return { type, selector, equals: 3, ...message };
    case 'gap':
      return { type, selector, equals: 16, axis: 'both', ...message };
    case 'boxesPerRow':
      return { type, selector, equals: 1, ...message };
    default:
      return { type, selector, ...message };
  }
}

export const NUMERIC_OPS: { value: string; label: string }[] = [
  { value: 'eq', label: '= equals' },
  { value: 'gte', label: '≥ at least' },
  { value: 'lte', label: '≤ at most' },
  { value: 'gt', label: '> more than' },
  { value: 'lt', label: '< less than' },
];
