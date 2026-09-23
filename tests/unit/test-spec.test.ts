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
  totalPoints,
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
  const t = (name: string, points = 10) => ({
    name,
    points,
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

  it('rejects a suite worth zero points', () => {
    expect(validateTestSuiteShape([t('one', 0)]).ok).toBe(false);
  });

  it('reports the offending test by name', () => {
    const bad = { name: 'broken', points: 5, testType: 'DECLARATIVE', testCode: '{oops' };
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

describe('totalPoints', () => {
  it('sums the suite', () => {
    expect(totalPoints([{ points: 10 }, { points: 30 }])).toBe(40);
  });

  it('is zero for an empty suite', () => {
    expect(totalPoints([])).toBe(0);
  });
});
