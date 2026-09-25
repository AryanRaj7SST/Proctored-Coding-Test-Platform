import { describe, it, expect } from 'vitest';
import { gradeQuestion, gradeSitting } from '@/server/grading/evaluate';
import { fromMicro, toMicro } from '@/server/grading/marks';
import type { TestVerdict } from '@/server/grading/runner-result';

const tests = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `Test ${i + 1}` }));
const verdicts = (passed: boolean[]) =>
  new Map<string, TestVerdict>(passed.map((p, i) => [`t${i + 1}`, { passed: p, durationMs: 1 }]));

describe('gradeQuestion', () => {
  it.each([
    [[true, true, true, true, true], '10.0000', 'PASSED'],
    [[true, true, true, true, false], '8.0000', 'PARTIAL'],
    [[true, true, true, false, false], '6.0000', 'PARTIAL'],
    [[true, true, false, false, false], '4.0000', 'PARTIAL'],
    [[true, false, false, false, false], '2.0000', 'PARTIAL'],
    [[false, false, false, false, false], '0.0000', 'FAILED'],
  ])('10 marks, 5 tests: %j -> %s (%s)', (passed, score, status) => {
    const grade = gradeQuestion(toMicro(10), tests(5), verdicts(passed));
    expect(fromMicro(grade.scoreMicro)).toBe(score);
    expect(grade.status).toBe(status);
    expect(grade.passedCount).toBe(passed.filter(Boolean).length);
    expect(grade.enabledCount).toBe(5);
  });

  it('each test case shows an equal 2-mark share of a 10-mark question', () => {
    const grade = gradeQuestion(toMicro(10), tests(5), verdicts([true, true, false, true, true]));
    expect(grade.results.map((r) => fromMicro(r.shareMicro))).toEqual(Array(5).fill('2.0000'));
    expect(grade.results.map((r) => fromMicro(r.awardedMicro))).toEqual([
      '2.0000',
      '2.0000',
      '0.0000',
      '2.0000',
      '2.0000',
    ]);
  });

  it('7 marks over 3 tests: decimal scores, a full pass is exactly 7', () => {
    expect(fromMicro(gradeQuestion(toMicro(7), tests(3), verdicts([true, false, false])).scoreMicro)).toBe(
      '2.3333',
    );
    expect(fromMicro(gradeQuestion(toMicro(7), tests(3), verdicts([true, true, false])).scoreMicro)).toBe(
      '4.6667',
    );
    expect(fromMicro(gradeQuestion(toMicro(7), tests(3), verdicts([true, true, true])).scoreMicro)).toBe(
      '7.0000',
    );
  });

  it('only the enabled tests passed in count: a disabled test is simply not in the list', () => {
    // 5 tests authored, 1 disabled: the question is graded over the 4 enabled ones.
    const grade = gradeQuestion(toMicro(10), tests(4), verdicts([true, true, true, false]));
    expect(fromMicro(grade.scoreMicro)).toBe('7.5000');
    expect(grade.enabledCount).toBe(4);
  });

  it('carries failure details through for the student', () => {
    const v = new Map<string, TestVerdict>([
      [
        't1',
        {
          passed: false,
          message: 'Expected "#out" to read "hi". Found: nothing.',
          expected: 'hi',
          actual: 'nothing',
          durationMs: 2,
        },
      ],
    ]);
    expect(gradeQuestion(toMicro(5), tests(1), v).results[0]).toMatchObject({
      expected: 'hi',
      actual: 'nothing',
    });
  });

  it('refuses to grade a test with no verdict', () => {
    expect(() => gradeQuestion(toMicro(10), tests(2), verdicts([true]))).toThrow();
  });
});

describe('gradeSitting', () => {
  it('sums question scores and decides pass/fail against the pass mark', () => {
    const sitting = gradeSitting([toMicro(10), toMicro(6), toMicro(8)], toMicro(30), '40');
    expect(fromMicro(sitting.scoreMicro)).toBe('24.0000');
    expect(sitting.percentage).toBe('80.0000');
    expect(sitting.result).toBe('PASSED');
  });

  it('100 marks with a 40% pass mark: 40 passes, 39 fails', () => {
    expect(gradeSitting([toMicro(40)], toMicro(100), '40').result).toBe('PASSED');
    expect(gradeSitting([toMicro(39)], toMicro(100), '40').result).toBe('FAILED');
  });

  it('is incomplete -- no result, never a partial 0 -- while any question is ungraded', () => {
    const sitting = gradeSitting([toMicro(10), null], toMicro(20), '40');
    expect(sitting.complete).toBe(false);
    expect(sitting.result).toBeNull();
  });

  it('a sitting with no questions is not complete', () => {
    expect(gradeSitting([], 0, '40').complete).toBe(false);
  });
});
