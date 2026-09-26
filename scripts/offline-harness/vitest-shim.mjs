/**
 * A very small `vitest`-compatible surface.
 *
 * Purpose: this repository's unit tests can be executed WITHOUT installing any
 * npm dependency, by running them through Node's built-in TypeScript type
 * stripping plus the resolver hook in ./loader.mjs. That means `npm run
 * verify:offline` proves the pure logic really works even on a machine (or in a
 * CI step) where `npm install` has not run yet.
 *
 * It implements only the matchers this test suite actually uses. `vitest`
 * remains the real runner (`npm test`); this is a safety net, not a
 * replacement, and it deliberately fails loudly if a test reaches for a matcher
 * it does not implement.
 */

const state = {
  suites: [],
  stack: [],
  passed: 0,
  failed: 0,
  failures: [],
};

export function describe(name, fn) {
  state.stack.push(name);
  try {
    fn();
  } finally {
    state.stack.pop();
  }
}

export function it(name, fn) {
  const fullName = [...state.stack, name].join(' › ');
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      throw new Error('The offline harness does not support async tests; run them with vitest.');
    }
    state.passed += 1;
  } catch (err) {
    state.failed += 1;
    state.failures.push({ name: fullName, message: err && err.message ? err.message : String(err) });
  }
}

export const test = it;

function stringify(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value instanceof Date) return `Date(${value.toISOString()})`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

/** Vitest's toMatchObject: every property in `expected` matches, recursively; extra ones are ignored. */
function matchesObject(actual, expected) {
  if (typeof expected !== 'object' || expected === null || expected instanceof Date) {
    return deepEqual(actual, expected);
  }
  if (typeof actual !== 'object' || actual === null) return false;
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((v, i) => matchesObject(actual[i], v))
    );
  }
  if (actual instanceof Map) {
    return Object.keys(expected).every((k) => matchesObject(actual.get(k), expected[k]));
  }
  return Object.keys(expected).every((k) => matchesObject(actual[k], expected[k]));
}

function fail(message) {
  throw new Error(message);
}

function build(actual, negated) {
  const check = (condition, message) => {
    if (negated ? condition : !condition) fail(message);
  };
  const not = negated ? 'not ' : '';

  return {
    toBe(expected) {
      check(Object.is(actual, expected), `expected ${stringify(actual)} ${not}to be ${stringify(expected)}`);
    },
    toEqual(expected) {
      check(
        deepEqual(actual, expected),
        `expected ${stringify(actual)} ${not}to equal ${stringify(expected)}`,
      );
    },
    toMatchObject(expected) {
      check(
        matchesObject(actual, expected),
        `expected ${stringify(actual)} ${not}to match object ${stringify(expected)}`,
      );
    },
    toContain(expected) {
      const contains =
        typeof actual === 'string'
          ? actual.includes(expected)
          : Array.isArray(actual)
            ? actual.some((v) => deepEqual(v, expected))
            : false;
      check(contains, `expected ${stringify(actual)} ${not}to contain ${stringify(expected)}`);
    },
    toHaveLength(expected) {
      check(
        actual != null && actual.length === expected,
        `expected length ${actual == null ? 'undefined' : actual.length} ${not}to be ${expected}`,
      );
    },
    toMatch(regex) {
      const re = regex instanceof RegExp ? regex : new RegExp(regex);
      check(re.test(String(actual)), `expected ${stringify(actual)} ${not}to match ${re}`);
    },
    toBeTruthy() {
      check(Boolean(actual), `expected ${stringify(actual)} ${not}to be truthy`);
    },
    toBeFalsy() {
      check(!actual, `expected ${stringify(actual)} ${not}to be falsy`);
    },
    toBeUndefined() {
      check(actual === undefined, `expected ${stringify(actual)} ${not}to be undefined`);
    },
    toBeNull() {
      check(actual === null, `expected ${stringify(actual)} ${not}to be null`);
    },
    toBeGreaterThan(expected) {
      check(actual > expected, `expected ${stringify(actual)} ${not}to be greater than ${expected}`);
    },
    toBeLessThan(expected) {
      check(actual < expected, `expected ${stringify(actual)} ${not}to be less than ${expected}`);
    },
    toBeCloseTo(expected, digits = 2) {
      const tolerance = Math.pow(10, -digits) / 2;
      check(
        Math.abs(actual - expected) <= tolerance,
        `expected ${stringify(actual)} ${not}to be close to ${expected}`,
      );
    },
    toThrow(expected) {
      let threw = false;
      let message = '';
      try {
        actual();
      } catch (err) {
        threw = true;
        message = err && err.message ? err.message : String(err);
      }
      if (expected && threw) {
        const re = expected instanceof RegExp ? expected : new RegExp(expected);
        check(re.test(message), `expected thrown message ${stringify(message)} ${not}to match ${re}`);
        return;
      }
      check(threw, `expected function ${not}to throw`);
    },
  };
}

export function expect(actual) {
  const matchers = build(actual, false);
  matchers.not = build(actual, true);
  return matchers;
}

export function getResults() {
  return { passed: state.passed, failed: state.failed, failures: state.failures.slice() };
}

export function resetResults() {
  state.passed = 0;
  state.failed = 0;
  state.failures = [];
  state.stack = [];
}
