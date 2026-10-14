import { describe, it, expect } from 'vitest';
import { scanRedFlags } from '@/lib/static-analysis';

describe('scanRedFlags static analysis', () => {
  it('returns an empty array for clean, normal DSA code', () => {
    const cleanJs = `
      function twoSum(nums, target) {
        const map = new Map();
        for (let i = 0; i < nums.length; i++) {
          const comp = target - nums[i];
          if (map.has(comp)) return [map.get(comp), i];
          map.set(nums[i], i);
        }
        return [];
      }
    `;
    const flags = scanRedFlags(cleanJs);
    expect(flags).toEqual([]);
  });

  it('detects eval usage', () => {
    const code = 'const res = eval("1 + 1");';
    const flags = scanRedFlags(code);
    expect(flags.some((f) => f.rule === 'EVAL')).toBe(true);
  });

  it('detects Function( constructor', () => {
    const code1 = 'const f = new Function("a", "return a");';
    const code2 = 'const f = Function("return 42")();';
    expect(scanRedFlags(code1).some((f) => f.rule === 'FUNCTION_CONSTRUCTOR')).toBe(true);
    expect(scanRedFlags(code2).some((f) => f.rule === 'FUNCTION_CONSTRUCTOR')).toBe(true);
  });

  it('detects constructor access', () => {
    const code = 'const f = [].constructor.constructor("return process")();';
    const flags = scanRedFlags(code);
    expect(flags.some((f) => f.rule === 'CONSTRUCTOR_ACCESS')).toBe(true);
  });

  it('detects prototype assignment and tampering', () => {
    const code1 = 'Array.prototype.push = function() {};';
    const code2 = 'Object.setPrototypeOf(obj, null);';
    expect(scanRedFlags(code1).some((f) => f.rule === 'PROTOTYPE_MUTATION')).toBe(true);
    expect(scanRedFlags(code2).some((f) => f.rule === 'PROTOTYPE_MUTATION')).toBe(true);
  });

  it('detects globalThis', () => {
    const code = 'globalThis.eval = () => ({ passed: true });';
    const flags = scanRedFlags(code);
    expect(flags.some((f) => f.rule === 'GLOBAL_THIS')).toBe(true);
  });

  it('detects __proto__ access', () => {
    const code = 'const p = obj.__proto__;';
    const flags = scanRedFlags(code);
    expect(flags.some((f) => f.rule === 'PROTO_ACCESS')).toBe(true);
  });

  it('detects Proxy usage', () => {
    const code = 'const p = new Proxy({}, { get() { return 42; } });';
    const flags = scanRedFlags(code);
    expect(flags.some((f) => f.rule === 'PROXY')).toBe(true);
  });

  it('detects hardcoded test arguments matching test cases', () => {
    const testCases = [
      { args: [[-1, -2, -3, -4, -5], -8], expected: [2, 4] },
      { args: ['super_secret_test_string_12345'], expected: 42 },
    ];

    const hardcodedJs = `
      function solve(arg) {
        if (arg === "super_secret_test_string_12345") return 42;
        return 0;
      }
    `;

    const flags = scanRedFlags(hardcodedJs, { testCases });
    expect(flags.some((f) => f.rule === 'HARDCODED_TEST_LITERAL')).toBe(true);
  });
});
