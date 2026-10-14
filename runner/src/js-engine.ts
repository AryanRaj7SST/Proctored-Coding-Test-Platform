import ivm from 'isolated-vm';
import { config } from './config';
import type { RunInput } from './executor';
import {
  describeAssertion,
  expectedValue,
  type FnAssertion,
  type FnCompareMode,
  type RunnerRunResult,
  type RunnerTest,
  type RunnerTestResult,
} from '../../shared/test-spec';

function formatVal(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return `"${v}"`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Deep structural equality comparison outside the isolate */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

/** Unordered array multiset equality */
export function unorderedArrayEqual(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const matched = new Array<boolean>(b.length).fill(false);
  for (let i = 0; i < a.length; i++) {
    let found = false;
    for (let j = 0; j < b.length; j++) {
      if (!matched[j] && deepEqual(a[i], b[j])) {
        matched[j] = true;
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/** Float comparison with tolerance */
export function floatEqual(a: unknown, b: unknown, tolerance: number = 1e-6): boolean {
  const numA = Number(a);
  const numB = Number(b);
  if (Number.isNaN(numA) && Number.isNaN(numB)) return true;
  if (Number.isNaN(numA) || Number.isNaN(numB)) return false;
  return Math.abs(numA - numB) <= tolerance;
}

/** String trim comparison */
export function trimEqual(a: unknown, b: unknown): boolean {
  const strA = typeof a === 'string' ? a.trim() : String(a ?? '').trim();
  const strB = typeof b === 'string' ? b.trim() : String(b ?? '').trim();
  return strA === strB;
}

export function compareValues(
  actual: unknown,
  expected: unknown,
  mode: FnCompareMode = 'deepEqual',
  tolerance?: number,
): boolean {
  switch (mode) {
    case 'unorderedArray':
      return unorderedArrayEqual(actual, expected);
    case 'float':
      return floatEqual(actual, expected, tolerance ?? 1e-6);
    case 'trim':
      return trimEqual(actual, expected);
    case 'deepEqual':
    default:
      return deepEqual(actual, expected);
  }
}

/**
 * Pristine harness script evaluated in the fresh isolate before student code.
 * Freezes references to critical built-ins so student tampering with prototypes
 * or globals cannot alter harness behaviour.
 */
const HARNESS_SCRIPT = `
(function() {
  const _JSON_stringify = JSON.stringify;
  const _JSON_parse = JSON.parse;
  const _Reflect_apply = Reflect.apply;
  const _String = String;
  const _hostLog = globalThis.__hostLog;
  delete globalThis.__hostLog;

  function safeStringify(val) {
    if (typeof val === 'string') return val;
    try {
      return _JSON_stringify(val);
    } catch {
      return _String(val);
    }
  }

  globalThis.console = {
    log: function(...args) {
      if (!_hostLog) return;
      try {
        let msg = '';
        for (let i = 0; i < args.length; i++) {
          if (i > 0) msg += ' ';
          msg += safeStringify(args[i]);
        }
        _Reflect_apply(_hostLog, undefined, [msg]);
      } catch {}
    },
    warn: function(...args) {
      if (!_hostLog) return;
      try {
        let msg = '';
        for (let i = 0; i < args.length; i++) {
          if (i > 0) msg += ' ';
          msg += safeStringify(args[i]);
        }
        _Reflect_apply(_hostLog, undefined, ['[warn] ' + msg]);
      } catch {}
    },
    error: function(...args) {
      if (!_hostLog) return;
      try {
        let msg = '';
        for (let i = 0; i < args.length; i++) {
          if (i > 0) msg += ' ';
          msg += safeStringify(args[i]);
        }
        _Reflect_apply(_hostLog, undefined, ['[error] ' + msg]);
      } catch {}
    },
    info: function(...args) {
      if (!_hostLog) return;
      try {
        let msg = '';
        for (let i = 0; i < args.length; i++) {
          if (i > 0) msg += ' ';
          msg += safeStringify(args[i]);
        }
        _Reflect_apply(_hostLog, undefined, [msg]);
      } catch {}
    }
  };

  globalThis.__runFn = function(fnName, argsJson) {
    const fn = globalThis[fnName];
    if (typeof fn !== 'function') {
      return _JSON_stringify({
        ok: false,
        error: 'NOT_A_FUNCTION',
        message: 'Function "' + fnName + '" is not defined or is not a function.'
      });
    }

    let args;
    try {
      args = _JSON_parse(argsJson);
    } catch {
      return _JSON_stringify({
        ok: false,
        error: 'INVALID_ARGS',
        message: 'Failed to parse function arguments.'
      });
    }

    try {
      const res = _Reflect_apply(fn, undefined, args);
      let resJson;
      try {
        resJson = _JSON_stringify(res === undefined ? null : res);
      } catch (serErr) {
        return _JSON_stringify({
          ok: false,
          error: 'SERIALIZATION_ERROR',
          message: 'Failed to serialize return value: ' + ((serErr && serErr.message) ? _String(serErr.message) : _String(serErr))
        });
      }
      return _JSON_stringify({
        ok: true,
        result: resJson
      });
    } catch (err) {
      return _JSON_stringify({
        ok: false,
        error: 'RUNTIME_ERROR',
        message: (err && err.message) ? _String(err.message) : _String(err)
      });
    }
  };
})();
`;

interface RunSingleTestResult {
  passed: boolean;
  message?: string;
  expected?: string;
  actual?: string;
}

async function runSingleTestCase(
  test: RunnerTest,
  studentJs: string,
  consoleLogs: string[],
): Promise<RunSingleTestResult> {
  const memoryLimitMb = config.jsEngine.memoryLimitMb;
  const timeoutMs = test.timeoutMs ?? config.jsEngine.defaultTimeoutMs;
  const maxOutputBytes = config.jsEngine.maxOutputBytes;

  let isolate: ivm.Isolate | null = null;
  let logCallback: ivm.Callback | null = null;

  try {
    isolate = new ivm.Isolate({ memoryLimit: memoryLimitMb });
    const context = isolate.createContextSync();
    const jail = context.global;

    logCallback = new ivm.Callback((msg: unknown) => {
      if (consoleLogs.length < config.jsEngine.maxLogs) {
        consoleLogs.push(String(msg ?? '').slice(0, config.jsEngine.maxLogLineLength));
      }
    });

    jail.setSync('__hostLog', logCallback);

    // 1. Run pristine harness code
    const harnessScript = isolate.compileScriptSync(HARNESS_SCRIPT);
    harnessScript.runSync(context, { timeout: 1000 });

    // 2. Run student code
    const studentScript = isolate.compileScriptSync(studentJs);
    studentScript.runSync(context, { timeout: timeoutMs });

    // 3. Execute assertions
    const fnRunner = jail.getSync('__runFn', { reference: true }) as ivm.Reference<ivm.Callback>;

    for (const assertion of test.assertions) {
      if (assertion.type !== 'fn') {
        return {
          passed: false,
          message: `Unsupported assertion type "${assertion.type}" in pure JavaScript engine.`,
        };
      }

      const fnAssertion = assertion as FnAssertion;
      const fnName = fnAssertion.fn;
      const argsJson = JSON.stringify(fnAssertion.args);
      const assertionTimeout = fnAssertion.timeoutMs ?? timeoutMs;

      // Invoke harness inside the isolate
      const rawRes = fnRunner.applySync(undefined, [fnName, argsJson], {
        timeout: assertionTimeout,
      }) as string;

      if (typeof rawRes !== 'string') {
        return {
          passed: false,
          message: 'Internal error: Harness did not return a string result.',
        };
      }

      let parsed: { ok: boolean; result?: string; error?: string; message?: string };
      try {
        parsed = JSON.parse(rawRes);
      } catch {
        return {
          passed: false,
          message: 'Internal error: Failed to parse harness response.',
        };
      }

      if (!parsed.ok) {
        return {
          passed: false,
          message: parsed.message ?? 'Execution failed.',
        };
      }

      const resultJson = parsed.result ?? 'null';
      if (Buffer.byteLength(resultJson, 'utf8') > maxOutputBytes) {
        return {
          passed: false,
          message: `Return value size (${Buffer.byteLength(resultJson, 'utf8')} bytes) exceeds maximum limit of ${maxOutputBytes} bytes.`,
        };
      }

      let actualVal: unknown;
      try {
        actualVal = JSON.parse(resultJson);
      } catch {
        return {
          passed: false,
          message: 'Failed to parse function output as JSON.',
        };
      }

      const compareMode = fnAssertion.compare ?? 'deepEqual';
      const isMatch = compareValues(actualVal, fnAssertion.expected, compareMode, fnAssertion.tolerance);

      if (!isMatch) {
        const expectedFormatted = formatVal(fnAssertion.expected);
        const actualFormatted = formatVal(actualVal);
        return {
          passed: false,
          expected: expectedFormatted,
          actual: actualFormatted,
          message:
            fnAssertion.message ??
            `Expected ${expectedFormatted}. Found: ${actualFormatted}`,
        };
      }
    }

    return { passed: true };
  } catch (err: unknown) {
    const errMessage = (err as { message?: string })?.message ?? String(err);
    if (/Script execution timed out/i.test(errMessage)) {
      return {
        passed: false,
        message: `Time limit exceeded: execution timed out after ${timeoutMs}ms.`,
      };
    }
    if (/memory limit/i.test(errMessage) || /Array buffer allocation/i.test(errMessage)) {
      return {
        passed: false,
        message: `Memory limit exceeded: heap limit of ${memoryLimitMb}MB exceeded.`,
      };
    }
    return {
      passed: false,
      message: `Runtime error: ${errMessage}`,
    };
  } finally {
    if (logCallback) {
      try {
        logCallback.dispose();
      } catch {}
    }
    if (isolate) {
      try {
        isolate.dispose();
      } catch {}
    }
  }
}

export async function executeJsRun(
  input: RunInput,
  runBudgetMs?: number,
): Promise<RunnerRunResult> {
  const startedAt = Date.now();
  const consoleLogs: string[] = [];
  const testResults: RunnerTestResult[] = [];
  const deadline = startedAt + (runBudgetMs ?? (config.runTimeoutMs + input.spec.tests.length * config.testTimeoutMs));

  let status: 'COMPLETED' | 'FAILED' | 'TIMEOUT' = 'COMPLETED';

  for (let i = 0; i < input.spec.tests.length; i++) {
    const test = input.spec.tests[i];
    if (!test) continue;

    if (Date.now() > deadline) {
      status = 'TIMEOUT';
      // Mark remaining tests as failed due to run timeout
      for (let j = i; j < input.spec.tests.length; j++) {
        const rem = input.spec.tests[j];
        if (!rem) continue;
        testResults.push({
          id: rem.id,
          testName: rem.name,
          passed: false,
          durationMs: 0,
          message: 'Run budget exceeded.',
        });
      }
      break;
    }

    const testStart = Date.now();
    const runResult = await runSingleTestCase(test, input.js, consoleLogs);
    const durationMs = Date.now() - testStart;

    testResults.push({
      id: test.id,
      testName: test.name,
      passed: runResult.passed,
      durationMs,
      ...(runResult.message ? { message: runResult.message } : {}),
      ...(runResult.expected !== undefined ? { expected: runResult.expected } : {}),
      ...(runResult.actual !== undefined ? { actual: runResult.actual } : {}),
    });
  }

  const durationMs = Date.now() - startedAt;

  return {
    runId: input.runId,
    status,
    results: testResults,
    durationMs,
    consoleLogs,
  };
}
