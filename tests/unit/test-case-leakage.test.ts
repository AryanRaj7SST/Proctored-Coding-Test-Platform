import { describe, it, expect } from 'vitest';
import { toStudentQuestion } from '@/server/services/questions';
import { toStudentOutcome, type ExecutionOutcome } from '@/lib/outcome';

describe('Test-case leakage regression tests', () => {
  it('toStudentQuestion does not leak expression or expected value in JSON when test is hidden', () => {
    const expression = 'solve([3,1,2]).join(",")';
    const expectedVal = '1,2,3';
    const testCode = JSON.stringify({
      assertions: [
        {
          type: 'js',
          expression,
          equals: expectedVal,
        },
      ],
    });

    const question = {
      id: 'q_dsa_1',
      title: 'Sort Array',
      slug: 'sort-array',
      description: 'Sort the array',
      instructions: null,
      mediaUrl: null,
      difficulty: 'EASY',
      starterHtml: '',
      starterCss: '',
      starterJs: 'function solve(arr) { return arr; }',
      tests: [
        {
          id: 't_hidden_1',
          name: 'Hidden test 1',
          description: 'Secret evaluation',
          expectedBehavior: 'Returns sorted array',
          enabled: true,
          order: 0,
          testType: 'DECLARATIVE',
          testCode,
          hidden: true,
          isHidden: true,
        },
      ],
    };

    const studentQuestion = toStudentQuestion(question as any, 10);
    const json = JSON.stringify(studentQuestion);

    expect(json).not.toContain(expression);
    expect(json).not.toContain(expectedVal);
  });

  it('toStudentOutcome omits expected, actual, and message for hidden tests', () => {
    const outcome: ExecutionOutcome = {
      runId: 'run_leak_test',
      status: 'COMPLETED',
      questionStatus: 'FAILED',
      score: 0,
      maxScore: 10,
      percentage: 0,
      passedCount: 0,
      failedCount: 1,
      totalCount: 1,
      durationMs: 42,
      results: [
        {
          testName: 'Secret hidden test',
          passed: false,
          points: 10,
          pointsAwarded: 0,
          durationMs: 42,
          message: 'Expected "1,2,3". Found: "3,1,2".',
          expected: '1,2,3',
          actual: '3,1,2',
          hidden: true,
          isHidden: true,
        } as any,
      ],
    };

    const projected = toStudentOutcome(outcome);
    const result = projected.results[0];

    expect(result?.message).toBeUndefined();
    expect(result?.expected).toBeUndefined();
    expect(result?.actual).toBeUndefined();
  });
});
