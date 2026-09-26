import { describe, it, expect } from 'vitest';
import {
  normalizeColorLiteral,
  cssValueMatches,
  compareNumeric,
  isSafeSelector,
  isColorProperty,
  validateTestCaseBody,
  validateRunnerSpec,
  validateTestSuiteShape,
  describeAssertion,
  describeStep,
  expectedValue,
  SPEC_LIMITS,
  ASSERTION_TYPES,
} from '@shared/test-spec';

describe('normalizeColorLiteral', () => {
  it('resolves named colours the way a browser reports them', () => {
    expect(normalizeColorLiteral('tomato')).toBe('rgb(255, 99, 71)');
    expect(normalizeColorLiteral('  WHITE ')).toBe('rgb(255, 255, 255)');
  });

  it('expands short and long hex', () => {
    expect(normalizeColorLiteral('#fff')).toBe('rgb(255, 255, 255)');
    expect(normalizeColorLiteral('#FF6347')).toBe('rgb(255, 99, 71)');
  });

  it('handles alpha in hex and rgba()', () => {
    expect(normalizeColorLiteral('#00000080')).toMatch(/^rgba\(0, 0, 0, 0\.50?2?\)$/);
    expect(normalizeColorLiteral('rgba(1, 2, 3, 0.5)')).toBe('rgba(1, 2, 3, 0.5)');
  });

  it('treats transparent as fully transparent black, like getComputedStyle', () => {
    expect(normalizeColorLiteral('transparent')).toBe('rgba(0, 0, 0, 0)');
  });

  it('returns null for things it cannot resolve offline', () => {
    expect(normalizeColorLiteral('var(--brand)')).toBeNull();
    expect(normalizeColorLiteral('not-a-colour')).toBeNull();
    expect(normalizeColorLiteral('')).toBeNull();
  });
});

describe('cssValueMatches', () => {
  it('matches equivalent colour spellings', () => {
    expect(cssValueMatches('rgb(255, 99, 71)', 'tomato', true)).toBe(true);
    expect(cssValueMatches('rgb(255, 99, 71)', '#ff6347', true)).toBe(true);
    expect(cssValueMatches('rgba(255, 99, 71, 1)', 'tomato', true)).toBe(true);
  });

  it('rejects a different colour', () => {
    expect(cssValueMatches('rgb(0, 0, 0)', 'tomato', true)).toBe(false);
  });

  it('tolerates sub-pixel differences in lengths', () => {
    expect(cssValueMatches('20.4px', '20px', false)).toBe(true);
    expect(cssValueMatches('21px', '20px', false)).toBe(false);
  });

  it('compares non-numeric values literally and case-insensitively', () => {
    expect(cssValueMatches('Grid', 'grid', false)).toBe(true);
    expect(cssValueMatches('flex', 'grid', false)).toBe(false);
  });
});

describe('compareNumeric', () => {
  it('applies the tolerance to eq/lte/gte only', () => {
    expect(compareNumeric(20.4, 'eq', 20, 0.5)).toBe(true);
    expect(compareNumeric(20.6, 'eq', 20, 0.5)).toBe(false);
    expect(compareNumeric(20, 'lt', 20)).toBe(false);
    expect(compareNumeric(20.4, 'lte', 20, 0.5)).toBe(true);
    expect(compareNumeric(19.6, 'gte', 20, 0.5)).toBe(true);
  });
});

describe('isSafeSelector', () => {
  it('accepts ordinary CSS selectors', () => {
    expect(isSafeSelector('.grid > .card:nth-child(2)')).toBe(true);
    expect(isSafeSelector('#box')).toBe(true);
  });

  it('rejects empty, oversized, multiline and javascript: values', () => {
    expect(isSafeSelector('')).toBe(false);
    expect(isSafeSelector('a'.repeat(SPEC_LIMITS.maxSelectorLength + 1))).toBe(false);
    expect(isSafeSelector('a\nb')).toBe(false);
    expect(isSafeSelector('javascript:alert(1)')).toBe(false);
    expect(isSafeSelector(42)).toBe(false);
  });
});

describe('isColorProperty', () => {
  it('knows which properties need colour-aware comparison', () => {
    expect(isColorProperty('background-color')).toBe(true);
    expect(isColorProperty('Color')).toBe(true);
    expect(isColorProperty('gap')).toBe(false);
  });
});

describe('validateTestCaseBody', () => {
  it('accepts a minimal valid body', () => {
    const result = validateTestCaseBody(
      JSON.stringify({ assertions: [{ type: 'exists', selector: '#box' }] }),
    );
    expect(result.ok).toBe(true);
    expect(result.value?.assertions).toHaveLength(1);
  });

  it('accepts an object as well as a JSON string', () => {
    expect(validateTestCaseBody({ assertions: [{ type: 'noConsoleErrors' }] }).ok).toBe(true);
  });

  it('rejects a body with no assertions -- a test that asserts nothing always passes', () => {
    const result = validateTestCaseBody(JSON.stringify({ assertions: [] }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/assertion/i);
  });

  it('rejects malformed JSON with a readable message', () => {
    const result = validateTestCaseBody('{ not json');
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toBeTruthy();
  });

  it('rejects unknown assertion types', () => {
    const result = validateTestCaseBody({
      assertions: [{ type: 'sourceContains', value: 'addEventListener' }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/sourceContains|unknown/i);
  });

  it('rejects an unsafe selector', () => {
    expect(validateTestCaseBody({ assertions: [{ type: 'exists', selector: 'javascript:x' }] }).ok).toBe(
      false,
    );
  });

  it('enforces the assertion count limit', () => {
    const assertions = Array.from({ length: SPEC_LIMITS.maxAssertions + 1 }, () => ({
      type: 'exists',
      selector: '#a',
    }));
    expect(validateTestCaseBody({ assertions }).ok).toBe(false);
  });

  it('validates interaction steps too', () => {
    expect(
      validateTestCaseBody({
        steps: [{ action: 'click', selector: '#add' }],
        assertions: [{ type: 'exists', selector: '#box' }],
      }).ok,
    ).toBe(true);
    expect(
      validateTestCaseBody({ steps: [{ action: 'teleport' }], assertions: [{ type: 'noConsoleErrors' }] }).ok,
    ).toBe(false);
  });

  it('has no source-inspection assertion in the vocabulary at all', () => {
    // Behaviour-based grading is a product rule, not a convention.
    expect(ASSERTION_TYPES).not.toContain('sourceContains');
    expect(ASSERTION_TYPES.some((t) => /source|code|regex/i.test(t))).toBe(false);
  });
});

describe('validateRunnerSpec', () => {
  const valid = {
    version: 1,
    viewport: { width: 1280, height: 720 },
    tests: [
      { id: 't1', name: 'a', points: 10, hidden: true, assertions: [{ type: 'exists', selector: '#box' }] },
    ],
  };

  it('accepts a well-formed spec', () => {
    expect(validateRunnerSpec(valid).ok).toBe(true);
  });

  it('rejects a spec with no tests', () => {
    expect(validateRunnerSpec({ ...valid, tests: [] }).ok).toBe(false);
  });

  it('rejects an absurd viewport rather than letting the runner allocate it', () => {
    expect(validateRunnerSpec({ ...valid, viewport: { width: 999_999, height: 999_999 } }).ok).toBe(false);
  });
});

describe('validateTestSuiteShape', () => {
  const t = (name: string, enabled = true) => ({
    name,
    enabled,
    testType: 'DECLARATIVE',
    testCode: JSON.stringify({ assertions: [{ type: 'exists', selector: '#box' }] }),
  });

  it('accepts a healthy suite', () => {
    expect(validateTestSuiteShape([t('one'), t('two')]).ok).toBe(true);
  });

  it('rejects duplicate test names -- the DB unique index would fail anyway', () => {
    const result = validateTestSuiteShape([t('same'), t('same')]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/duplicate/i);
  });

  it('rejects a suite with no enabled test case', () => {
    expect(validateTestSuiteShape([t('one', false), t('two', false)]).ok).toBe(false);
    expect(validateTestSuiteShape([t('one', false), t('two')]).ok).toBe(true);
  });

  it('rejects an empty suite', () => {
    expect(validateTestSuiteShape([]).ok).toBe(false);
  });

  it('reports the offending test by name', () => {
    const bad = { name: 'broken', testType: 'DECLARATIVE', testCode: '{oops' };
    expect(validateTestSuiteShape([bad]).errors.join(' ')).toContain('broken');
  });
});

describe('describeAssertion', () => {
  it('produces readable English for every assertion type', () => {
    const samples = [
      { type: 'exists', selector: '#box' },
      { type: 'count', selector: '.card', equals: 3 },
      { type: 'css', selector: '#box', property: 'background-color', equals: 'tomato', color: true },
      { type: 'gridColumns', selector: '.grid', equals: 3, equalWidths: true },
      { type: 'gap', selector: '.grid', equals: 20 },
      { type: 'boxesPerRow', selector: '.card', equals: 2 },
      { type: 'noConsoleErrors' },
    ] as const;
    for (const s of samples) {
      const text = describeAssertion(s as never);
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(5);
    }
  });
});

describe('web-development checks: classes, values, forms, JavaScript behaviour', () => {
  const body = (assertions: unknown[], steps: unknown[] = []) =>
    validateTestCaseBody(JSON.stringify({ steps, assertions }));

  it('accepts class, value, checked, validity and js checks', () => {
    const result = body(
      [
        { type: 'hasClass', selector: '#box', className: 'active' },
        { type: 'notHasClass', selector: '#box', className: 'hidden' },
        { type: 'value', selector: '#name', equals: 'Ada' },
        { type: 'checked', selector: '#agree', equals: true },
        { type: 'validity', selector: '#signup', valid: false },
        { type: 'js', expression: 'window.add(2, 3)', equals: 5 },
      ],
      [
        { action: 'check', selector: '#agree' },
        { action: 'select', selector: '#country', value: 'IN' },
        { action: 'uncheck', selector: '#news' },
      ],
    );
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects malformed checks with a readable reason', () => {
    expect(body([{ type: 'hasClass', selector: '#box', className: 'two words' }]).ok).toBe(false);
    expect(body([{ type: 'value', selector: '#name' }]).ok).toBe(false);
    expect(body([{ type: 'js', expression: '' }]).ok).toBe(false);
    expect(body([{ type: 'js', expression: 'x'.repeat(SPEC_LIMITS.maxExpressionLength + 1) }]).ok).toBe(
      false,
    );
    expect(body([{ type: 'exists', selector: '#a' }], [{ action: 'select', selector: '#c' }]).ok).toBe(true);
  });

  it('describes every check and step for students, and states what it expects', () => {
    expect(describeAssertion({ type: 'hasClass', selector: '#box', className: 'on' })).toMatch(/class "on"/);
    expect(describeAssertion({ type: 'js', expression: 'add(2,3)', equals: 5 })).toContain('add(2,3)');
    expect(expectedValue({ type: 'checked', selector: '#a', equals: false })).toBe('unchecked');
    expect(expectedValue({ type: 'validity', selector: '#f', valid: true })).toBe('valid');
    expect(expectedValue({ type: 'text', selector: '#t', equals: 'Hello' })).toBe('Hello');
    expect(expectedValue({ type: 'size', selector: '#s', dimension: 'width', op: 'gte', value: 200 })).toBe(
      '>= 200px',
    );
    expect(describeStep({ action: 'select', selector: '#c', value: 'IN' })).toBe('Choose "IN" in "#c".');
    expect(describeStep({ action: 'check', selector: '#a' })).toBe('Tick "#a".');
  });
});

describe('every assertion type survives validation (app and runner agree)', () => {
  const minimal: Record<(typeof ASSERTION_TYPES)[number], Record<string, unknown>> = {
    exists: { selector: '#a' },
    notExists: { selector: '#a' },
    visible: { selector: '#a' },
    hidden: { selector: '#a' },
    count: { selector: '#a', equals: 1 },
    text: { selector: '#a', equals: 'x' },
    css: { selector: '#a', property: 'color', equals: 'red' },
    cssNumber: { selector: '#a', property: 'margin-top', op: 'gte', value: 1 },
    attribute: { selector: '#a', name: 'alt', equals: 'x' },
    size: { selector: '#a', property: 'width', op: 'gte', value: 1 },
    gridColumns: { selector: '#a', equals: 2 },
    gap: { selector: '#a', equals: 8 },
    boxesPerRow: { selector: '#a', equals: 1 },
    noConsoleErrors: {},
    hasClass: { selector: '#a', className: 'on' },
    notHasClass: { selector: '#a', className: 'on' },
    value: { selector: '#a', equals: 'x' },
    checked: { selector: '#a', equals: true },
    validity: { selector: '#a', valid: true },
    js: { expression: '1 + 1', equals: 2 },
  };

  it.each(ASSERTION_TYPES.map((type) => [type]))('%s is kept and the runner accepts it', (type) => {
    const body = validateTestCaseBody({ assertions: [{ type, ...minimal[type] }] });
    expect(body.ok, body.errors.join('; ')).toBe(true);
    expect(body.value?.assertions).toHaveLength(1);
    expect(body.value?.assertions[0]?.type).toBe(type);
    const spec = validateRunnerSpec({
      version: 1,
      viewport: { width: 1280, height: 720 },
      tests: [{ id: 't1', name: 'T', points: 0, hidden: false, ...body.value }],
    });
    expect(spec.ok, spec.errors.join('; ')).toBe(true);
  });

  it('a "No console errors" check inside a multi-check test is not silently dropped', () => {
    const body = validateTestCaseBody({
      assertions: [{ type: 'visible', selector: '#a' }, { type: 'noConsoleErrors' }],
    });
    expect(body.value?.assertions.map((a) => a.type)).toEqual(['visible', 'noConsoleErrors']);
  });
});
