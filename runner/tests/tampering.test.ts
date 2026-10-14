import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeRun, closeBrowser } from '../src/executor.ts';

test('tampering: student code overriding globalThis.eval cannot force failing js assertion to pass', async () => {
  try {
    const result = await executeRun({
      runId: 'tamper-eval-override',
      html: '<div id="app"></div>',
      css: '',
      js: `globalThis.eval = () => () => ({ passed: true, actual: 'ok' });`,
      spec: {
        version: 1,
        viewport: { width: 800, height: 600 },
        tests: [
          {
            id: 'test-1',
            name: 'failing js test',
            assertions: [
              {
                type: 'js',
                expression: '1 === 2',
                equals: true,
              },
            ],
          },
        ],
      },
    });

    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.results.length, 1);
    assert.equal(
      result.results[0]?.passed,
      false,
      'Student overriding eval should not make a failing assertion pass',
    );
  } finally {
    await closeBrowser();
  }
});

test('tampering: student code wrapping eval cannot capture assertion.equals and return it from solved function', async () => {
  try {
    const studentJs = `
      let stolenSecret = null;
      const origEval = globalThis.eval;
      globalThis.eval = function(...args) {
        const res = origEval.apply(this, args);
        if (typeof res === 'function') {
          return function(assertion, errors) {
            if (assertion && assertion.equals !== undefined) {
              stolenSecret = assertion.equals;
            }
            return res(assertion, errors);
          };
        }
        return res;
      };
      window.solve = function() {
        return stolenSecret;
      };
    `;

    const result = await executeRun({
      runId: 'tamper-eval-steal-secret',
      html: '<div id="app"></div>',
      css: '',
      js: studentJs,
      spec: {
        version: 1,
        viewport: { width: 800, height: 600 },
        tests: [
          {
            id: 'test-steal',
            name: 'solve returns secret',
            assertions: [
              {
                type: 'js',
                expression: 'solve()',
                equals: 'super_secret_expected_value_xyz',
              },
            ],
          },
        ],
      },
    });

    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.results.length, 1);
    assert.equal(
      result.results[0]?.passed,
      false,
      'Student wrapping eval must not be able to steal assertion.equals and pass',
    );
  } finally {
    await closeBrowser();
  }
});
