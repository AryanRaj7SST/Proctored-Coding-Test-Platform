/**
 * Behaviour test DSL -- shared by the Next.js app (authoring + compilation)
 * and the runner service (execution).
 *
 * Design rule (product requirement #51): a test asserts what the page *does*
 * once rendered -- computed styles, DOM state, layout geometry, visible text,
 * interaction outcomes. It never inspects the student's source text. There is
 * deliberately no `sourceContains` assertion in this DSL.
 *
 * This file is dependency-free on purpose so it can be executed directly by
 * `node` (type stripping) and imported by both packages.
 */

export interface Viewport {
  width: number;
  height: number;
}

export type Step =
  | { action: 'setViewport'; viewport: Viewport }
  | { action: 'click'; selector: string; nth?: number }
  | { action: 'clickText'; text: string; role?: 'button' | 'link'; exact?: boolean }
  | { action: 'fill'; selector: string; value: string }
  | { action: 'press'; key: string; selector?: string }
  | { action: 'hover'; selector: string }
  | { action: 'wait'; ms: number }
  | { action: 'waitFor'; selector: string; state?: 'visible' | 'hidden' | 'attached' }
  | { action: 'scrollTo'; selector: string };

export type NumericOp = 'eq' | 'lt' | 'lte' | 'gt' | 'gte';

export type Assertion =
  | { type: 'exists'; selector: string; message?: string }
  | { type: 'notExists'; selector: string; message?: string }
  | { type: 'visible'; selector: string; message?: string }
  | { type: 'hidden'; selector: string; message?: string }
  | { type: 'count'; selector: string; equals: number; message?: string }
  | { type: 'text'; selector: string; equals?: string; contains?: string; message?: string }
  | {
      type: 'css';
      selector: string;
      property: string;
      equals?: string;
      oneOf?: string[];
      color?: boolean;
      message?: string;
    }
  | {
      type: 'cssNumber';
      selector: string;
      property: string;
      op: NumericOp;
      value: number;
      tolerance?: number;
      message?: string;
    }
  | { type: 'attribute'; selector: string; name: string; equals?: string; contains?: string; message?: string }
  | {
      type: 'size';
      selector: string;
      dimension: 'width' | 'height';
      op: NumericOp;
      value: number;
      tolerance?: number;
      message?: string;
    }
  | { type: 'gridColumns'; selector: string; equals: number; equalWidths?: boolean; tolerance?: number; message?: string }
  | { type: 'gap'; selector: string; equals: number; axis?: 'row' | 'column' | 'both'; tolerance?: number; message?: string }
  | { type: 'boxesPerRow'; selector: string; equals: number; tolerance?: number; message?: string }
  | { type: 'noConsoleErrors'; message?: string };

/** What an admin authors for a single test case (stored in QuestionTest.testCode). */
export interface TestCaseBody {
  viewport?: Viewport;
  steps?: Step[];
  assertions: Assertion[];
  failureMessage?: string;
  timeoutMs?: number;
}

/** One test as sent to the runner (assembled server-side from DB rows). */
export interface RunnerTest extends TestCaseBody {
  id: string;
  name: string;
  points: number;
  hidden: boolean;
}

/** Full payload the server compiles and hands to the runner. */
export interface RunnerSpec {
  version: 1;
  viewport: Viewport;
  setup?: Step[];
  tests: RunnerTest[];
}

export interface RunnerTestResult {
  id: string;
  testName: string;
  passed: boolean;
  /** Student-safe message. Never contains spec internals or stack traces. */
  message?: string;
  durationMs: number;
}

export interface RunnerRunResult {
  runId: string;
  status: 'COMPLETED' | 'FAILED' | 'TIMEOUT';
  results: RunnerTestResult[];
  durationMs: number;
  consoleLogs: string[];
  error?: string;
}

export const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 720 };
export const VIEWPORT_PRESETS: Record<string, Viewport> = {
  desktop: { width: 1280, height: 720 },
  laptop: { width: 1024, height: 768 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 480, height: 800 },
  'mobile-small': { width: 360, height: 640 },
};

export const ASSERTION_TYPES = [
  'exists',
  'notExists',
  'visible',
  'hidden',
  'count',
  'text',
  'css',
  'cssNumber',
  'attribute',
  'size',
  'gridColumns',
  'gap',
  'boxesPerRow',
  'noConsoleErrors',
] as const;

export const STEP_ACTIONS = [
  'setViewport',
  'click',
  'clickText',
  'fill',
  'press',
  'hover',
  'wait',
  'waitFor',
  'scrollTo',
] as const;

export const SPEC_LIMITS = {
  maxSelectorLength: 300,
  maxSteps: 40,
  maxAssertions: 40,
  maxTests: 40,
  maxWaitMs: 5000,
  minViewport: 200,
  maxViewport: 2560,
  maxTextLength: 500,
} as const;

/* ------------------------------------------------------------------ */
/* Colour normalisation                                                */
/* ------------------------------------------------------------------ */

/**
 * Common CSS colour keywords. The runner resolves expected colours inside the
 * browser (authoritative for all 148 keywords); this table makes authoring-time
 * validation and offline unit tests work without a browser.
 */
export const NAMED_COLORS: Record<string, [number, number, number]> = {
  transparent: [0, 0, 0],
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  lime: [0, 255, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  aqua: [0, 255, 255],
  magenta: [255, 0, 255],
  fuchsia: [255, 0, 255],
  silver: [192, 192, 192],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  maroon: [128, 0, 0],
  olive: [128, 128, 0],
  purple: [128, 0, 128],
  teal: [0, 128, 128],
  navy: [0, 0, 128],
  orange: [255, 165, 0],
  tomato: [255, 99, 71],
  coral: [255, 127, 80],
  salmon: [250, 128, 114],
  crimson: [220, 20, 60],
  gold: [255, 215, 0],
  khaki: [240, 230, 140],
  indigo: [75, 0, 130],
  violet: [238, 130, 238],
  pink: [255, 192, 203],
  brown: [165, 42, 42],
  beige: [245, 245, 220],
  ivory: [255, 255, 240],
  lavender: [230, 230, 250],
  plum: [221, 160, 221],
  orchid: [218, 112, 214],
  turquoise: [64, 224, 208],
  skyblue: [135, 206, 235],
  steelblue: [70, 130, 180],
  royalblue: [65, 105, 225],
  dodgerblue: [30, 144, 255],
  midnightblue: [25, 25, 112],
  seagreen: [46, 139, 87],
  forestgreen: [34, 139, 34],
  darkgreen: [0, 100, 0],
  limegreen: [50, 205, 50],
  springgreen: [0, 255, 127],
  chocolate: [210, 105, 30],
  sienna: [160, 82, 45],
  peru: [205, 133, 63],
  tan: [210, 180, 140],
  wheat: [245, 222, 179],
  whitesmoke: [245, 245, 245],
  gainsboro: [220, 220, 220],
  lightgray: [211, 211, 211],
  lightgrey: [211, 211, 211],
  darkgray: [169, 169, 169],
  darkgrey: [169, 169, 169],
  dimgray: [105, 105, 105],
  dimgrey: [105, 105, 105],
  slategray: [112, 128, 144],
  slategrey: [112, 128, 144],
};

const clamp255 = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

/**
 * Normalise any authored colour literal to the canonical form a browser
 * reports from getComputedStyle: `rgb(r, g, b)` or `rgba(r, g, b, a)`.
 * Returns null when the value is not a colour we can resolve offline.
 */
export function normalizeColorLiteral(input: string): string | null {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return null;

  if (raw === 'transparent') return 'rgba(0, 0, 0, 0)';

  const named = NAMED_COLORS[raw];
  if (named) return `rgb(${named[0]}, ${named[1]}, ${named[2]})`;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(raw);
  if (hex && hex[1]) {
    const h = hex[1];
    const expand = (s: string): number => parseInt(s.length === 1 ? s + s : s, 16);
    if (h.length === 3 || h.length === 4) {
      const r = expand(h[0] as string);
      const g = expand(h[1] as string);
      const b = expand(h[2] as string);
      if (h.length === 4) {
        const a = expand(h[3] as string) / 255;
        return `rgba(${r}, ${g}, ${b}, ${trimAlpha(a)})`;
      }
      return `rgb(${r}, ${g}, ${b})`;
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) {
      const a = parseInt(h.slice(6, 8), 16) / 255;
      return `rgba(${r}, ${g}, ${b}, ${trimAlpha(a)})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  }

  const fn = /^rgba?\(([^)]+)\)$/.exec(raw);
  if (fn && fn[1]) {
    const parts = fn[1]
      .split(/[\s,/]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 3) {
      const toNum = (p: string): number => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p));
      const r = clamp255(toNum(parts[0] as string));
      const g = clamp255(toNum(parts[1] as string));
      const b = clamp255(toNum(parts[2] as string));
      if (parts.length >= 4) {
        const ap = parts[3] as string;
        const a = ap.endsWith('%') ? parseFloat(ap) / 100 : parseFloat(ap);
        if (Number.isFinite(a) && a < 1) return `rgba(${r}, ${g}, ${b}, ${trimAlpha(a)})`;
      }
      if ([r, g, b].every((n) => Number.isFinite(n))) return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return null;
}

function trimAlpha(a: number): string {
  const rounded = Math.round(a * 1000) / 1000;
  return String(rounded);
}

/** Compare a browser-reported value against an authored expectation. */
export function cssValueMatches(actual: string, expected: string, isColor: boolean): boolean {
  const a = String(actual ?? '').trim();
  const e = String(expected ?? '').trim();
  if (a.toLowerCase() === e.toLowerCase()) return true;
  if (isColor) {
    const na = normalizeColorLiteral(a);
    const ne = normalizeColorLiteral(e);
    if (na && ne) {
      if (na === ne) return true;
      // rgb(x,y,z) and rgba(x,y,z,1) describe the same colour.
      return stripOpaqueAlpha(na) === stripOpaqueAlpha(ne);
    }
    return false;
  }
  // Tolerate "10px" vs "10" and trailing zeroes for lengths.
  const numA = parseFloat(a);
  const numE = parseFloat(e);
  if (Number.isFinite(numA) && Number.isFinite(numE) && /^-?[\d.]+(px|%|em|rem)?$/.test(a)) {
    return Math.abs(numA - numE) < 0.51;
  }
  return false;
}

function stripOpaqueAlpha(v: string): string {
  const m = /^rgba\((\d+), (\d+), (\d+), 1\)$/.exec(v);
  return m ? `rgb(${m[1]}, ${m[2]}, ${m[3]})` : v;
}

export function compareNumeric(actual: number, op: NumericOp, value: number, tolerance = 0.5): boolean {
  switch (op) {
    case 'eq':
      return Math.abs(actual - value) <= tolerance;
    case 'lt':
      return actual < value;
    case 'lte':
      return actual <= value + tolerance;
    case 'gt':
      return actual > value;
    case 'gte':
      return actual >= value - tolerance;
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

const COLOR_PROPERTIES = [
  'color',
  'background-color',
  'backgroundcolor',
  'border-color',
  'border-top-color',
  'border-bottom-color',
  'border-left-color',
  'border-right-color',
  'outline-color',
  'fill',
  'stroke',
  'caret-color',
  'text-decoration-color',
];

export function isColorProperty(property: string): boolean {
  return COLOR_PROPERTIES.includes(String(property).trim().toLowerCase());
}

/** Reject selectors that could escape the sandbox page or blow up the runner. */
export function isSafeSelector(selector: unknown): selector is string {
  if (typeof selector !== 'string') return false;
  const s = selector.trim();
  if (!s || s.length > SPEC_LIMITS.maxSelectorLength) return false;
  // No javascript: / data: payloads smuggled into a selector, no newlines.
  if (/[\n\r\u0000]/.test(s)) return false;
  if (/javascript:/i.test(s)) return false;
  return true;
}

function validViewport(v: unknown, errors: string[], path: string): Viewport | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'object' || v === null) {
    errors.push(`${path}: viewport must be an object`);
    return undefined;
  }
  const { width, height } = v as Record<string, unknown>;
  const w = Number(width);
  const h = Number(height);
  const inRange = (n: number): boolean =>
    Number.isFinite(n) && n >= SPEC_LIMITS.minViewport && n <= SPEC_LIMITS.maxViewport;
  if (!inRange(w) || !inRange(h)) {
    errors.push(`${path}: viewport width/height must be between ${SPEC_LIMITS.minViewport} and ${SPEC_LIMITS.maxViewport}`);
    return undefined;
  }
  return { width: Math.round(w), height: Math.round(h) };
}

function validateStep(raw: unknown, errors: string[], path: string): Step | null {
  if (typeof raw !== 'object' || raw === null) {
    errors.push(`${path}: step must be an object`);
    return null;
  }
  const s = raw as Record<string, unknown>;
  const action = String(s.action ?? '');
  if (!(STEP_ACTIONS as readonly string[]).includes(action)) {
    errors.push(`${path}: unknown step action "${action}"`);
    return null;
  }
  const needsSelector = ['click', 'fill', 'hover', 'waitFor', 'scrollTo'];
  if (needsSelector.includes(action) && !isSafeSelector(s.selector)) {
    errors.push(`${path}: step "${action}" requires a valid selector`);
    return null;
  }
  switch (action) {
    case 'setViewport': {
      const vp = validViewport(s.viewport, errors, path);
      return vp ? { action: 'setViewport', viewport: vp } : null;
    }
    case 'click':
      return { action: 'click', selector: String(s.selector), ...(s.nth !== undefined ? { nth: Number(s.nth) } : {}) };
    case 'clickText': {
      const text = String(s.text ?? '');
      if (!text || text.length > SPEC_LIMITS.maxTextLength) {
        errors.push(`${path}: clickText requires non-empty text`);
        return null;
      }
      const role = s.role === 'button' || s.role === 'link' ? s.role : undefined;
      return { action: 'clickText', text, ...(role ? { role } : {}), ...(s.exact ? { exact: true } : {}) };
    }
    case 'fill':
      return { action: 'fill', selector: String(s.selector), value: String(s.value ?? '') };
    case 'press': {
      const key = String(s.key ?? '');
      if (!key) {
        errors.push(`${path}: press requires a key`);
        return null;
      }
      return { action: 'press', key, ...(isSafeSelector(s.selector) ? { selector: String(s.selector) } : {}) };
    }
    case 'hover':
      return { action: 'hover', selector: String(s.selector) };
    case 'wait': {
      const ms = Number(s.ms);
      if (!Number.isFinite(ms) || ms < 0 || ms > SPEC_LIMITS.maxWaitMs) {
        errors.push(`${path}: wait ms must be between 0 and ${SPEC_LIMITS.maxWaitMs}`);
        return null;
      }
      return { action: 'wait', ms: Math.round(ms) };
    }
    case 'waitFor': {
      const state = s.state === 'hidden' || s.state === 'attached' ? s.state : 'visible';
      return { action: 'waitFor', selector: String(s.selector), state };
    }
    case 'scrollTo':
      return { action: 'scrollTo', selector: String(s.selector) };
    default:
      return null;
  }
}

function validateAssertion(raw: unknown, errors: string[], path: string): Assertion | null {
  if (typeof raw !== 'object' || raw === null) {
    errors.push(`${path}: assertion must be an object`);
    return null;
  }
  const a = raw as Record<string, unknown>;
  const type = String(a.type ?? '');
  if (!(ASSERTION_TYPES as readonly string[]).includes(type)) {
    errors.push(`${path}: unknown assertion type "${type}"`);
    return null;
  }
  const message = typeof a.message === 'string' && a.message.length <= SPEC_LIMITS.maxTextLength ? a.message : undefined;
  const withMsg = <T extends object>(o: T): T => (message ? { ...o, message } : o);

  if (type !== 'noConsoleErrors' && !isSafeSelector(a.selector)) {
    errors.push(`${path}: assertion "${type}" requires a valid selector`);
    return null;
  }
  const selector = String(a.selector);
  const num = (k: string): number => Number(a[k]);
  const tol = (): number | undefined => (a.tolerance !== undefined ? Number(a.tolerance) : undefined);

  switch (type) {
    case 'exists':
    case 'notExists':
    case 'visible':
    case 'hidden':
      return withMsg({ type, selector } as Assertion);
    case 'count': {
      const equals = num('equals');
      if (!Number.isInteger(equals) || equals < 0) {
        errors.push(`${path}: count.equals must be a non-negative integer`);
        return null;
      }
      return withMsg({ type: 'count' as const, selector, equals });
    }
    case 'text': {
      const equals = typeof a.equals === 'string' ? a.equals : undefined;
      const contains = typeof a.contains === 'string' ? a.contains : undefined;
      if (equals === undefined && contains === undefined) {
        errors.push(`${path}: text assertion needs "equals" or "contains"`);
        return null;
      }
      return withMsg({
        type: 'text' as const,
        selector,
        ...(equals !== undefined ? { equals } : {}),
        ...(contains !== undefined ? { contains } : {}),
      });
    }
    case 'css': {
      const property = String(a.property ?? '').trim();
      if (!property || !/^[-a-zA-Z]+$/.test(property)) {
        errors.push(`${path}: css assertion needs a valid CSS property name`);
        return null;
      }
      const equals = typeof a.equals === 'string' ? a.equals : undefined;
      const oneOf = Array.isArray(a.oneOf) ? a.oneOf.filter((x): x is string => typeof x === 'string') : undefined;
      if (equals === undefined && (!oneOf || oneOf.length === 0)) {
        errors.push(`${path}: css assertion needs "equals" or a non-empty "oneOf"`);
        return null;
      }
      const color = a.color === undefined ? isColorProperty(property) : Boolean(a.color);
      return withMsg({
        type: 'css' as const,
        selector,
        property,
        color,
        ...(equals !== undefined ? { equals } : {}),
        ...(oneOf ? { oneOf } : {}),
      });
    }
    case 'cssNumber': {
      const property = String(a.property ?? '').trim();
      const op = String(a.op ?? 'eq') as NumericOp;
      if (!property || !['eq', 'lt', 'lte', 'gt', 'gte'].includes(op) || !Number.isFinite(num('value'))) {
        errors.push(`${path}: cssNumber needs property, op and numeric value`);
        return null;
      }
      return withMsg({
        type: 'cssNumber' as const,
        selector,
        property,
        op,
        value: num('value'),
        ...(tol() !== undefined ? { tolerance: tol() as number } : {}),
      });
    }
    case 'attribute': {
      const name = String(a.name ?? '').trim();
      if (!name || !/^[-a-zA-Z0-9:_]+$/.test(name)) {
        errors.push(`${path}: attribute assertion needs a valid attribute name`);
        return null;
      }
      const equals = typeof a.equals === 'string' ? a.equals : undefined;
      const contains = typeof a.contains === 'string' ? a.contains : undefined;
      if (equals === undefined && contains === undefined) {
        errors.push(`${path}: attribute assertion needs "equals" or "contains"`);
        return null;
      }
      return withMsg({
        type: 'attribute' as const,
        selector,
        name,
        ...(equals !== undefined ? { equals } : {}),
        ...(contains !== undefined ? { contains } : {}),
      });
    }
    case 'size': {
      const dimension: 'width' | 'height' = a.dimension === 'height' ? 'height' : 'width';
      const op = String(a.op ?? 'eq') as NumericOp;
      if (!['eq', 'lt', 'lte', 'gt', 'gte'].includes(op) || !Number.isFinite(num('value'))) {
        errors.push(`${path}: size needs op and numeric value`);
        return null;
      }
      return withMsg({
        type: 'size' as const,
        selector,
        dimension,
        op,
        value: num('value'),
        ...(tol() !== undefined ? { tolerance: tol() as number } : {}),
      });
    }
    case 'gridColumns': {
      const equals = num('equals');
      if (!Number.isInteger(equals) || equals < 1) {
        errors.push(`${path}: gridColumns.equals must be a positive integer`);
        return null;
      }
      return withMsg({
        type: 'gridColumns' as const,
        selector,
        equals,
        ...(a.equalWidths !== undefined ? { equalWidths: Boolean(a.equalWidths) } : {}),
        ...(tol() !== undefined ? { tolerance: tol() as number } : {}),
      });
    }
    case 'gap': {
      const equals = num('equals');
      if (!Number.isFinite(equals) || equals < 0) {
        errors.push(`${path}: gap.equals must be a non-negative number`);
        return null;
      }
      const axis: 'row' | 'column' | 'both' = a.axis === 'row' || a.axis === 'column' ? a.axis : 'both';
      return withMsg({
        type: 'gap' as const,
        selector,
        equals,
        axis,
        ...(tol() !== undefined ? { tolerance: tol() as number } : {}),
      });
    }
    case 'boxesPerRow': {
      const equals = num('equals');
      if (!Number.isInteger(equals) || equals < 1) {
        errors.push(`${path}: boxesPerRow.equals must be a positive integer`);
        return null;
      }
      return withMsg({
        type: 'boxesPerRow' as const,
        selector,
        equals,
        ...(tol() !== undefined ? { tolerance: tol() as number } : {}),
      });
    }
    default:
      return null;
  }
}

/** Validate one authored test body (the JSON stored in QuestionTest.testCode). */
export function validateTestCaseBody(raw: unknown): ValidationResult<TestCaseBody> {
  const errors: string[] = [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, errors: ['Test body is not valid JSON.'] };
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, errors: ['Test body must be a JSON object.'] };
  }
  const body = parsed as Record<string, unknown>;

  const viewport = validViewport(body.viewport, errors, 'test');

  const stepsRaw = body.steps === undefined ? [] : body.steps;
  if (!Array.isArray(stepsRaw)) {
    errors.push('test.steps must be an array');
  } else if (stepsRaw.length > SPEC_LIMITS.maxSteps) {
    errors.push(`test.steps may contain at most ${SPEC_LIMITS.maxSteps} steps`);
  }
  const steps: Step[] = [];
  if (Array.isArray(stepsRaw)) {
    stepsRaw.slice(0, SPEC_LIMITS.maxSteps).forEach((s, i) => {
      const step = validateStep(s, errors, `steps[${i}]`);
      if (step) steps.push(step);
    });
  }

  const assertionsRaw = body.assertions;
  if (!Array.isArray(assertionsRaw) || assertionsRaw.length === 0) {
    errors.push('test.assertions must be a non-empty array');
  } else if (assertionsRaw.length > SPEC_LIMITS.maxAssertions) {
    errors.push(`test.assertions may contain at most ${SPEC_LIMITS.maxAssertions} assertions`);
  }
  const assertions: Assertion[] = [];
  if (Array.isArray(assertionsRaw)) {
    assertionsRaw.slice(0, SPEC_LIMITS.maxAssertions).forEach((a, i) => {
      const assertion = validateAssertion(a, errors, `assertions[${i}]`);
      if (assertion) assertions.push(assertion);
    });
  }

  const timeoutMs = body.timeoutMs === undefined ? undefined : Number(body.timeoutMs);
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs < 500 || timeoutMs > 20000)) {
    errors.push('test.timeoutMs must be between 500 and 20000');
  }

  const failureMessage =
    typeof body.failureMessage === 'string' && body.failureMessage.length <= SPEC_LIMITS.maxTextLength
      ? body.failureMessage
      : undefined;

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      ...(viewport ? { viewport } : {}),
      ...(steps.length ? { steps } : {}),
      assertions,
      ...(failureMessage ? { failureMessage } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    },
  };
}

/** Validate a whole compiled runner spec (used by the runner on ingress). */
export function validateRunnerSpec(raw: unknown): ValidationResult<RunnerSpec> {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) return { ok: false, errors: ['spec must be an object'] };
  const spec = raw as Record<string, unknown>;
  if (Number(spec.version) !== 1) errors.push('spec.version must be 1');

  const viewport = validViewport(spec.viewport, errors, 'spec') ?? DEFAULT_VIEWPORT;
  const testsRaw = spec.tests;
  if (!Array.isArray(testsRaw) || testsRaw.length === 0) {
    errors.push('spec.tests must be a non-empty array');
    return { ok: false, errors };
  }
  if (testsRaw.length > SPEC_LIMITS.maxTests) errors.push(`spec.tests may contain at most ${SPEC_LIMITS.maxTests} tests`);

  const setup: Step[] = [];
  if (Array.isArray(spec.setup)) {
    spec.setup.slice(0, SPEC_LIMITS.maxSteps).forEach((s, i) => {
      const step = validateStep(s, errors, `setup[${i}]`);
      if (step) setup.push(step);
    });
  }

  const tests: RunnerTest[] = [];
  const seenIds = new Set<string>();
  testsRaw.slice(0, SPEC_LIMITS.maxTests).forEach((t, i) => {
    if (typeof t !== 'object' || t === null) {
      errors.push(`tests[${i}]: must be an object`);
      return;
    }
    const rec = t as Record<string, unknown>;
    const id = String(rec.id ?? '');
    const name = String(rec.name ?? '');
    if (!id) errors.push(`tests[${i}]: missing id`);
    if (seenIds.has(id)) errors.push(`tests[${i}]: duplicate id "${id}"`);
    seenIds.add(id);
    if (!name) errors.push(`tests[${i}]: missing name`);
    const points = Number(rec.points ?? 0);
    if (!Number.isFinite(points) || points < 0) errors.push(`tests[${i}]: points must be >= 0`);
    const body = validateTestCaseBody(rec);
    if (!body.ok || !body.value) {
      body.errors.forEach((e) => errors.push(`tests[${i}].${e}`));
      return;
    }
    tests.push({ id, name, points: Math.round(points), hidden: rec.hidden !== false, ...body.value });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { version: 1, viewport, ...(setup.length ? { setup } : {}), tests } };
}

/** Human-readable, student-safe description of what an assertion expects. */
export function describeAssertion(a: Assertion): string {
  if ('message' in a && a.message) return a.message;
  switch (a.type) {
    case 'exists':
      return `Expected an element matching "${a.selector}" to exist.`;
    case 'notExists':
      return `Expected no element matching "${a.selector}".`;
    case 'visible':
      return `Expected "${a.selector}" to be visible.`;
    case 'hidden':
      return `Expected "${a.selector}" to be hidden.`;
    case 'count':
      return `Expected ${a.equals} element(s) matching "${a.selector}".`;
    case 'text':
      return a.equals !== undefined
        ? `Expected "${a.selector}" to read "${a.equals}".`
        : `Expected "${a.selector}" to contain "${a.contains}".`;
    case 'css':
      return `Expected "${a.selector}" to have ${a.property} of ${a.equals ?? (a.oneOf ?? []).join(' or ')}.`;
    case 'cssNumber':
      return `Expected "${a.selector}" ${a.property} ${a.op} ${a.value}.`;
    case 'attribute':
      return `Expected "${a.selector}" attribute ${a.name} to ${a.equals !== undefined ? `equal "${a.equals}"` : `contain "${a.contains}"`}.`;
    case 'size':
      return `Expected "${a.selector}" ${a.dimension} ${a.op} ${a.value}px.`;
    case 'gridColumns':
      return `Expected "${a.selector}" to render ${a.equals} columns.`;
    case 'gap':
      return `Expected "${a.selector}" to use a ${a.equals}px gap.`;
    case 'boxesPerRow':
      return `Expected ${a.equals} item(s) per row for "${a.selector}".`;
    case 'noConsoleErrors':
      return 'Expected the page to run without console errors.';
    default:
      return 'Assertion failed.';
  }
}

export function totalPoints(tests: { points: number }[]): number {
  return tests.reduce((sum, t) => sum + (Number.isFinite(t.points) ? Math.max(0, Math.round(t.points)) : 0), 0);
}

/** Question-authoring gate (product requirement #52). */
export function validateTestSuiteShape(
  tests: { name: string; points: number; testCode: string; testType?: string }[],
): ValidationResult<true> {
  const errors: string[] = [];
  if (tests.length === 0) errors.push('A question needs at least one test case.');
  const names = new Set<string>();
  tests.forEach((t, i) => {
    const name = String(t.name ?? '').trim();
    if (!name) errors.push(`Test ${i + 1}: name is required.`);
    if (names.has(name.toLowerCase())) errors.push(`Test ${i + 1}: duplicate test name "${name}".`);
    names.add(name.toLowerCase());
    if (!Number.isFinite(t.points) || t.points < 0) errors.push(`Test ${i + 1}: points must be >= 0.`);
    if ((t.testType ?? 'DECLARATIVE') === 'DECLARATIVE') {
      const body = validateTestCaseBody(t.testCode);
      if (!body.ok) body.errors.forEach((e) => errors.push(`Test ${i + 1} ("${name}"): ${e}`));
    }
  });
  if (totalPoints(tests) <= 0) errors.push('Total points across tests must be greater than 0.');
  return errors.length ? { ok: false, errors } : { ok: true, errors: [], value: true };
}
