/**
 * Static analysis and red-flag detection for JavaScript DSA submissions.
 *
 * Rules detect anti-patterns, sandbox tampering attempts, and potential test-case hardcoding.
 * Results are stored for administrative review and do NOT block submission.
 */

export type RedFlagRule =
  | 'EVAL'
  | 'FUNCTION_CONSTRUCTOR'
  | 'CONSTRUCTOR_ACCESS'
  | 'PROTOTYPE_MUTATION'
  | 'GLOBAL_THIS'
  | 'PROTO_ACCESS'
  | 'PROXY'
  | 'HARDCODED_TEST_LITERAL';

export interface RedFlag {
  rule: RedFlagRule;
  description: string;
  snippet?: string;
}

export interface ScanOptions {
  testCases?: Array<{ args?: unknown[]; expected?: unknown }>;
  minLiteralStringLength?: number;
}

export function extractTestCasesFromSnapshot(
  snapshot: unknown,
): Array<{ args?: unknown[]; expected?: unknown }> {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const s = snapshot as {
    tests?: Array<{
      testCode?: string;
      assertions?: Array<{ args?: unknown[]; expected?: unknown }>;
    }>;
  };
  if (!Array.isArray(s.tests)) return [];
  const cases: Array<{ args?: unknown[]; expected?: unknown }> = [];
  for (const t of s.tests) {
    if (Array.isArray(t.assertions)) {
      for (const a of t.assertions) {
        if (a && typeof a === 'object') {
          cases.push({ args: a.args, expected: a.expected });
        }
      }
    } else if (typeof t.testCode === 'string') {
      try {
        const parsed = JSON.parse(t.testCode);
        if (Array.isArray(parsed?.assertions)) {
          for (const a of parsed.assertions) {
            if (a && typeof a === 'object') {
              cases.push({ args: a.args, expected: a.expected });
            }
          }
        }
      } catch {}
    }
  }
  return cases;
}

function truncate(str: string, maxLen = 60): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

export function scanRedFlags(js: string, options: ScanOptions = {}): RedFlag[] {
  if (!js || typeof js !== 'string') return [];

  const flags: RedFlag[] = [];
  const minStrLen = options.minLiteralStringLength ?? 8;

  // 1. eval
  if (/\beval\b/.test(js)) {
    const match = js.match(/(?:[^\n]*\beval\b[^\n]*)/);
    flags.push({
      rule: 'EVAL',
      description: 'Use of eval keyword detected',
      snippet: match ? truncate(match[0].trim()) : undefined,
    });
  }

  // 2. Function constructor
  if (/\bnew\s+Function\b|\bFunction\s*\(/.test(js)) {
    const match = js.match(/(?:[^\n]*(?:new\s+Function|Function\s*\()[^\n]*)/);
    flags.push({
      rule: 'FUNCTION_CONSTRUCTOR',
      description: 'Use of Function(...) constructor detected',
      snippet: match ? truncate(match[0].trim()) : undefined,
    });
  }

  // 3. constructor property access
  if (/\bconstructor\b/.test(js)) {
    const match = js.match(/(?:[^\n]*\bconstructor\b[^\n]*)/);
    flags.push({
      rule: 'CONSTRUCTOR_ACCESS',
      description: 'Access to .constructor property detected',
      snippet: match ? truncate(match[0].trim()) : undefined,
    });
  }

  // 4. Prototype tampering / assignment
  if (/\.prototype\b|\bObject\.setPrototypeOf\b/.test(js)) {
    const match = js.match(/(?:[^\n]*(?:\.prototype\b|Object\.setPrototypeOf)[^\n]*)/);
    flags.push({
      rule: 'PROTOTYPE_MUTATION',
      description: 'Prototype access or mutation detected',
      snippet: match ? truncate(match[0].trim()) : undefined,
    });
  }

  // 5. globalThis
  if (/\bglobalThis\b/.test(js)) {
    const match = js.match(/(?:[^\n]*\bglobalThis\b[^\n]*)/);
    flags.push({
      rule: 'GLOBAL_THIS',
      description: 'Access to globalThis detected',
      snippet: match ? truncate(match[0].trim()) : undefined,
    });
  }

  // 6. __proto__
  if (/__proto__/.test(js)) {
    const match = js.match(/(?:[^\n]*__proto__[^\n]*)/);
    flags.push({
      rule: 'PROTO_ACCESS',
      description: 'Access to __proto__ detected',
      snippet: match ? truncate(match[0].trim()) : undefined,
    });
  }

  // 7. Proxy
  if (/\bProxy\b/.test(js)) {
    const match = js.match(/(?:[^\n]*\bProxy\b[^\n]*)/);
    flags.push({
      rule: 'PROXY',
      description: 'Use of Proxy object detected',
      snippet: match ? truncate(match[0].trim()) : undefined,
    });
  }

  // 8. Hardcoded long literals matching test args or expected values
  if (options.testCases && options.testCases.length > 0) {
    const compactJs = js.replace(/\s+/g, '');

    for (const tc of options.testCases) {
      const candidates: unknown[] = [];
      if (Array.isArray(tc.args)) {
        candidates.push(...tc.args);
      }
      if (tc.expected !== undefined) {
        candidates.push(tc.expected);
      }

      for (const cand of candidates) {
        if (typeof cand === 'string' && cand.length >= minStrLen) {
          if (js.includes(cand)) {
            flags.push({
              rule: 'HARDCODED_TEST_LITERAL',
              description: `Hardcoded string literal matching test case (${cand.length} chars)`,
              snippet: truncate(`"${cand}"`),
            });
            break;
          }
        } else if (Array.isArray(cand) && cand.length >= 3) {
          const compactCand = JSON.stringify(cand);
          if (compactJs.includes(compactCand)) {
            flags.push({
              rule: 'HARDCODED_TEST_LITERAL',
              description: `Hardcoded array literal matching test case (${cand.length} elements)`,
              snippet: truncate(compactCand),
            });
            break;
          }
        }
      }
    }
  }

  return flags;
}
