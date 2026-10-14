import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeJsRun } from '../src/js-engine.ts';
import { validateRunnerSpec, type RunnerSpec } from '../../shared/test-spec.ts';

test('js-engine: correct solution passes', async () => {
  const spec: RunnerSpec = {
    version: 1,
    kind: 'js-fn',
    viewport: { width: 800, height: 600 },
    tests: [
      {
        id: 'test-1',
        name: 'add two numbers',
        points: 10,
        hidden: false,
        assertions: [
          {
            type: 'fn',
            fn: 'add',
            args: [2, 3],
            expected: 5,
            compare: 'deepEqual',
          },
        ],
      },
    ],
  };

  const result = await executeJsRun({
    runId: 'js-correct',
    html: '',
    css: '',
    js: 'function add(a, b) { return a + b; }',
    spec,
  });

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.passed, true);
});

test('js-engine: wrong answer fails with clear failure diff', async () => {
  const spec: RunnerSpec = {
    version: 1,
    kind: 'js-fn',
    viewport: { width: 800, height: 600 },
    tests: [
      {
        id: 'test-wrong',
        name: 'wrong answer',
        points: 10,
        hidden: false,
        assertions: [
          {
            type: 'fn',
            fn: 'solve',
            args: [2, 3],
            expected: 5,
            compare: 'deepEqual',
          },
        ],
      },
    ],
  };

  const result = await executeJsRun({
    runId: 'js-wrong',
    html: '',
    css: '',
    js: 'function solve(a, b) { return a * b; }',
    spec,
  });

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.passed, false);
  assert.equal(result.results[0]?.expected, '5');
  assert.equal(result.results[0]?.actual, '6');
  assert.match(result.results[0]?.message ?? '', /Expected 5\. Found: 6/);
});

test('js-engine: comparison modes (unorderedArray, float, trim)', async () => {
  const spec: RunnerSpec = {
    version: 1,
    kind: 'js-fn',
    viewport: { width: 800, height: 600 },
    tests: [
      {
        id: 'test-unordered',
        name: 'unordered array check',
        points: 5,
        hidden: false,
        assertions: [
          {
            type: 'fn',
            fn: 'getSet',
            args: [],
            expected: [1, 2, 3],
            compare: 'unorderedArray',
          },
        ],
      },
      {
        id: 'test-float',
        name: 'float tolerance check',
        points: 5,
        hidden: false,
        assertions: [
          {
            type: 'fn',
            fn: 'getFloat',
            args: [],
            expected: 0.3,
            compare: 'float',
            tolerance: 0.0001,
          },
        ],
      },
      {
        id: 'test-trim',
        name: 'string trim check',
        points: 5,
        hidden: false,
        assertions: [
          {
            type: 'fn',
            fn: 'getGreeting',
            args: ['world'],
            expected: 'Hello world',
            compare: 'trim',
          },
        ],
      },
    ],
  };

  const studentJs = `
    function getSet() { return [3, 1, 2]; }
    function getFloat() { return 0.1 + 0.2; }
    function getGreeting(name) { return "  Hello world\\n "; }
  `;

  const result = await executeJsRun({
    runId: 'js-comparisons',
    html: '',
    css: '',
    js: studentJs,
    spec,
  });

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.results.length, 3);
  assert.equal(result.results[0]?.passed, true);
  assert.equal(result.results[1]?.passed, true);
  assert.equal(result.results[2]?.passed, true);
});

test('js-engine: infinite loop is killed and other tests still run', async () => {
  const spec: RunnerSpec = {
    version: 1,
    kind: 'js-fn',
    viewport: { width: 800, height: 600 },
    tests: [
      {
        id: 'test-loop',
        name: 'infinite loop',
        points: 5,
        hidden: false,
        timeoutMs: 300,
        assertions: [
          {
            type: 'fn',
            fn: 'hang',
            args: [],
            expected: 1,
            compare: 'deepEqual',
            timeoutMs: 300,
          },
        ],
      },
      {
        id: 'test-quick',
        name: 'quick test after loop',
        points: 5,
        hidden: false,
        assertions: [
          {
            type: 'fn',
            fn: 'quick',
            args: [],
            expected: 42,
            compare: 'deepEqual',
          },
        ],
      },
    ],
  };

  const studentJs = `
    function hang() { while (true) {} }
    function quick() { return 42; }
  `;

  const result = await executeJsRun({
    runId: 'js-loop-recovery',
    html: '',
    css: '',
    js: studentJs,
    spec,
  });

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0]?.passed, false);
  assert.match(result.results[0]?.message ?? '', /time limit exceeded/i);
  assert.equal(result.results[1]?.passed, true, 'Test after infinite loop must still run and pass');
});

test('js-engine: memory bomb is killed', async () => {
  const spec: RunnerSpec = {
    version: 1,
    kind: 'js-fn',
    viewport: { width: 800, height: 600 },
    tests: [
      {
        id: 'test-mem',
        name: 'memory bomb',
        points: 5,
        hidden: false,
        assertions: [
          {
            type: 'fn',
            fn: 'bomb',
            args: [],
            expected: 1,
            compare: 'deepEqual',
          },
        ],
      },
    ],
  };

  const studentJs = `
    function bomb() {
      const arr = [];
      while (true) {
        arr.push(new Array(1000000).fill('a'.repeat(1000)));
      }
    }
  `;

  const result = await executeJsRun({
    runId: 'js-mem-bomb',
    html: '',
    css: '',
    js: studentJs,
    spec,
  });

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.passed, false);
  assert.match(result.results[0]?.message ?? '', /memory limit exceeded/i);
});

test('js-engine: student overriding eval, JSON.stringify, Function/Array prototypes cannot change verdict', async () => {
  const spec: RunnerSpec = {
    version: 1,
    kind: 'js-fn',
    viewport: { width: 800, height: 600 },
    tests: [
      {
        id: 'test-tamper',
        name: 'tamper attempts',
        points: 10,
        hidden: false,
        assertions: [
          {
            type: 'fn',
            fn: 'solve',
            args: [3, 4],
            expected: 7,
            compare: 'deepEqual',
          },
        ],
      },
    ],
  };

  const maliciousStudentJs = `
    // Try overriding JSON.stringify to forge output
    JSON.stringify = function() {
      return JSON.stringify({ ok: true, result: 7 });
    };

    // Try breaking Array.isArray
    Array.isArray = function() { return false; };

    // Try breaking Array prototype methods
    Array.prototype.push = function() { throw new Error('prototype corrupted'); };
    Array.prototype.slice = function() { throw new Error('prototype corrupted'); };

    // Try overriding eval
    globalThis.eval = function() { return 7; };

    // Try corrupting Function.prototype.apply
    Function.prototype.apply = function() { throw new Error('apply corrupted'); };

    function solve(a, b) {
      // Actually returns wrong answer, relying on tampering to pass
      return 999;
    }
  `;

  const result = await executeJsRun({
    runId: 'js-tamper-prototypes',
    html: '',
    css: '',
    js: maliciousStudentJs,
    spec,
  });

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.results.length, 1);
  assert.equal(
    result.results[0]?.passed,
    false,
    'Tampering with intrinsics and prototypes must not forge a passing result',
  );
});

test('js-engine: student code cannot access host process, require, or global host objects', async () => {
  const spec: RunnerSpec = {
    version: 1,
    kind: 'js-fn',
    viewport: { width: 800, height: 600 },
    tests: [
      {
        id: 'test-sandbox',
        name: 'host isolation',
        points: 10,
        hidden: false,
        assertions: [
          {
            type: 'fn',
            fn: 'checkHost',
            args: [],
            expected: { hasProcess: false, hasRequire: false, hasFetch: false },
            compare: 'deepEqual',
          },
        ],
      },
    ],
  };

  const studentJs = `
    function checkHost() {
      return {
        hasProcess: typeof process !== 'undefined',
        hasRequire: typeof require !== 'undefined',
        hasFetch: typeof fetch !== 'undefined',
      };
    }
  `;

  const result = await executeJsRun({
    runId: 'js-host-isolation',
    html: '',
    css: '',
    js: studentJs,
    spec,
  });

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.passed, true);
});

test('js-engine: oversized return value is rejected', async () => {
  const spec: RunnerSpec = {
    version: 1,
    kind: 'js-fn',
    viewport: { width: 800, height: 600 },
    tests: [
      {
        id: 'test-oversized',
        name: 'oversized output',
        points: 5,
        hidden: false,
        assertions: [
          {
            type: 'fn',
            fn: 'huge',
            args: [],
            expected: 'ok',
            compare: 'deepEqual',
          },
        ],
      },
    ],
  };

  const studentJs = `
    function huge() {
      return 'x'.repeat(100 * 1024); // 100KB > 64KB cap
    }
  `;

  const result = await executeJsRun({
    runId: 'js-oversized',
    html: '',
    css: '',
    js: studentJs,
    spec,
  });

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.passed, false);
  assert.match(result.results[0]?.message ?? '', /size/i);
});

test('js-engine: console.log is captured in consoleLogs for practice debugging', async () => {
  const spec: RunnerSpec = {
    version: 1,
    kind: 'js-fn',
    viewport: { width: 800, height: 600 },
    tests: [
      {
        id: 'test-log',
        name: 'logs output',
        points: 5,
        hidden: false,
        assertions: [
          {
            type: 'fn',
            fn: 'logSomething',
            args: ['hello'],
            expected: 'hello',
            compare: 'deepEqual',
          },
        ],
      },
    ],
  };

  const studentJs = `
    function logSomething(msg) {
      console.log('debug info:', msg);
      return msg;
    }
  `;

  const result = await executeJsRun({
    runId: 'js-console',
    html: '',
    css: '',
    js: studentJs,
    spec,
  });

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.results[0]?.passed, true);
  assert.ok(result.consoleLogs.some((l) => l.includes('debug info: hello')));
});

test('validateRunnerSpec: validates kind "js-fn" and rejects malformed fn specs', () => {
  // Valid js-fn spec
  const valid = validateRunnerSpec({
    version: 1,
    kind: 'js-fn',
    viewport: { width: 800, height: 600 },
    tests: [
      {
        id: 't1',
        name: 't1',
        points: 10,
        assertions: [
          {
            type: 'fn',
            fn: 'solve',
            args: [1, 2],
            expected: 3,
            compare: 'deepEqual',
          },
        ],
      },
    ],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value?.kind, 'js-fn');

  // Invalid fn name
  const badFn = validateRunnerSpec({
    version: 1,
    kind: 'js-fn',
    viewport: { width: 800, height: 600 },
    tests: [
      {
        id: 't2',
        name: 't2',
        points: 10,
        assertions: [
          {
            type: 'fn',
            fn: 'bad-fn-name!',
            args: [],
            expected: 1,
          },
        ],
      },
    ],
  });
  assert.equal(badFn.ok, false);

  // Non-array args
  const badArgs = validateRunnerSpec({
    version: 1,
    kind: 'js-fn',
    viewport: { width: 800, height: 600 },
    tests: [
      {
        id: 't3',
        name: 't3',
        points: 10,
        assertions: [
          {
            type: 'fn',
            fn: 'solve',
            args: 'not-an-array',
            expected: 1,
          },
        ],
      },
    ],
  });
  assert.equal(badArgs.ok, false);

  // Invalid compare mode
  const badCompare = validateRunnerSpec({
    version: 1,
    kind: 'js-fn',
    viewport: { width: 800, height: 600 },
    tests: [
      {
        id: 't4',
        name: 't4',
        points: 10,
        assertions: [
          {
            type: 'fn',
            fn: 'solve',
            args: [],
            expected: 1,
            compare: 'invalid-mode',
          },
        ],
      },
    ],
  });
  assert.equal(badCompare.ok, false);
});

test('Step 1 tamper scenario on js-fn engine: cannot steal expected value or cheat verdicts', async () => {
  const spec: RunnerSpec = {
    version: 1,
    kind: 'js-fn',
    viewport: { width: 800, height: 600 },
    tests: [
      {
        id: 'tamper-steal',
        name: 'solve returns secret',
        points: 10,
        hidden: true,
        assertions: [
          {
            type: 'fn',
            fn: 'solve',
            args: [],
            expected: 'super_secret_expected_value_xyz',
            compare: 'deepEqual',
          },
        ],
      },
    ],
  };

  // Student trying to introspect or capture the expected value
  const studentJs = `
    let captured = null;
    function solve() {
      return captured;
    }
  `;

  const result = await executeJsRun({
    runId: 'js-tamper-step1',
    html: '',
    css: '',
    js: studentJs,
    spec,
  });

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.passed, false);
});
