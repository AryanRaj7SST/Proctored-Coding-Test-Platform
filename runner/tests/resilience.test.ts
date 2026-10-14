import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { executeRun, getBrowser, closeBrowser } from '../src/executor.ts';

const hasBrowser = (() => {
  try {
    return Boolean(chromium.executablePath());
  } catch {
    return false;
  }
})();

test('resilience: infinite loop in first test does not cause second test to fail', async (t) => {
  if (!hasBrowser) {
    t.skip('Playwright chromium executable is not installed');
    return;
  }

  try {
    const studentJs = `
      function solve(n) {
        if (n === 1) {
          while (true) {}
        }
        return n * 2;
      }
    `;

    const start = Date.now();
    const result = await executeRun({
      runId: 'resilience-loop-recovery',
      html: '<div id="app"></div>',
      css: '',
      js: studentJs,
      spec: {
        version: 1,
        viewport: { width: 800, height: 600 },
        tests: [
          {
            id: 'test-1-infinite',
            name: 'infinite loop test',
            timeoutMs: 1000,
            assertions: [
              {
                type: 'js',
                expression: 'solve(1)',
                equals: 2,
              },
            ],
          },
          {
            id: 'test-2-normal',
            name: 'normal valid test',
            timeoutMs: 2000,
            assertions: [
              {
                type: 'js',
                expression: 'solve(2)',
                equals: 4,
              },
            ],
          },
        ],
      },
    });

    const elapsed = Date.now() - start;
    assert.ok(elapsed < 15000, `Execution took too long: ${elapsed}ms`);
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0]?.passed, false, 'First test with infinite loop should fail');
    assert.equal(result.results[1]?.passed, true, 'Second test must pass despite first test infinite loop');
  } finally {
    await closeBrowser();
  }
});

test('resilience: shared Chromium disconnect recovers automatically for next run', async (t) => {
  if (!hasBrowser) {
    t.skip('Playwright chromium executable is not installed');
    return;
  }

  try {
    const run1 = await executeRun({
      runId: 'resilience-disconnect-1',
      html: '<div id="app">Hello</div>',
      css: '',
      js: 'function test() { return 1; }',
      spec: {
        version: 1,
        viewport: { width: 800, height: 600 },
        tests: [
          {
            id: 't1',
            name: 'test 1',
            assertions: [{ type: 'js', expression: 'test()', equals: 1 }],
          },
        ],
      },
    });
    assert.equal(run1.status, 'COMPLETED');

    // Force disconnect the shared browser instance behind executor without resetting internal state
    const browser = await getBrowser();
    await browser.close();

    // Next run must still succeed
    const run2 = await executeRun({
      runId: 'resilience-disconnect-2',
      html: '<div id="app">Hello</div>',
      css: '',
      js: 'function test() { return 2; }',
      spec: {
        version: 1,
        viewport: { width: 800, height: 600 },
        tests: [
          {
            id: 't2',
            name: 'test 2',
            assertions: [{ type: 'js', expression: 'test()', equals: 2 }],
          },
        ],
      },
    });
    assert.equal(
      run2.status,
      'COMPLETED',
      `Next run should succeed after browser disconnect, got status: ${run2.status}`,
    );
    assert.equal(run2.results[0]?.passed, true);
  } finally {
    await closeBrowser();
  }
});
