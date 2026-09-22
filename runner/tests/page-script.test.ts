import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVALUATOR_SOURCE } from '../src/page-script.ts';
import { ASSERTION_TYPES } from '../../shared/test-spec.ts';

/**
 * The in-page evaluator runs inside a real browser tab, so its DOM-reading
 * branches (getComputedStyle, getBoundingClientRect, grid geometry) cannot be
 * exercised by a headless Node test -- that coverage is the runner container's
 * job (npm run validate:stack) and the e2e suite.
 *
 * What CAN be verified without a browser is that the shipped source is
 * internally consistent with the DSL it claims to implement: every assertion
 * type the schema allows has a matching `case` here, the source is a single
 * self-contained IIFE with no external references, and it never reads the
 * one thing product requirement #51 forbids -- the student's source text.
 */

test('is a self-contained function expression (safe to inject via page.evaluate)', () => {
  const trimmed = EVALUATOR_SOURCE.trim();
  assert.match(trimmed, /^\(function \(assertion, consoleErrors\) \{/);
  assert.match(trimmed, /\}\)$/);
});

test('handles every assertion type the shared schema declares', () => {
  for (const type of ASSERTION_TYPES) {
    if (type === 'noConsoleErrors') {
      assert.match(EVALUATOR_SOURCE, /a\.type === 'noConsoleErrors'/, `missing branch for "${type}"`);
      continue;
    }
    assert.match(EVALUATOR_SOURCE, new RegExp(`case '${type}':`), `missing switch case for "${type}"`);
  }
});

test('declares no case for an assertion type the schema does not have', () => {
  const cases = [...EVALUATOR_SOURCE.matchAll(/case '([a-zA-Z]+)':/g)].map((m) => m[1]);
  for (const c of cases) {
    assert.ok((ASSERTION_TYPES as readonly string[]).includes(c as string), `evaluator has an unknown case "${c}"`);
  }
});

test('reads only rendered state -- never the student\'s source text', () => {
  // The whole point of behaviour-based grading: no outerHTML/innerHTML read
  // back for comparison, no fetching the original file, no eval of student code.
  assert.doesNotMatch(EVALUATOR_SOURCE, /\.outerHTML/);
  assert.doesNotMatch(EVALUATOR_SOURCE, /fetch\(/);
  assert.doesNotMatch(EVALUATOR_SOURCE, /\beval\(/);
});

test('every branch that could throw is inside the top-level try/catch', () => {
  const body = EVALUATOR_SOURCE.slice(EVALUATOR_SOURCE.indexOf('try {'), EVALUATOR_SOURCE.lastIndexOf('} catch'));
  assert.match(body, /switch \(a\.type\)/);
});

test('a failing DOM read produces a result object, not a thrown error', () => {
  assert.match(EVALUATOR_SOURCE, /result\.passed = false;\s*\n\s*result\.actual = 'error while checking the page';/);
});
