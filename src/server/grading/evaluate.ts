/**
 * Turn test verdicts into grades. Pure: no Prisma, no runner, no React.
 *
 *   one question: marks x passed / enabled  (see ./marks)
 *   one sitting:  sum of question scores, percentage, PASS/FAIL
 */
import {
  isPassing,
  percentageOf,
  questionScore,
  questionStatus,
  testCaseShare,
  totalOf,
  type DecimalLike,
  type QuestionOutcome,
} from './marks';
import type { TestVerdict } from './runner-result';

export interface GradableTest {
  id: string;
  name: string;
  hidden?: boolean;
}

export interface GradedTestCase {
  testId: string;
  testName: string;
  passed: boolean;
  /** This test's equal share of the marks (display only). */
  shareMicro: number;
  awardedMicro: number;
  message?: string;
  expected?: string;
  actual?: string;
  durationMs: number;
  hidden?: boolean;
}

export interface QuestionGrade {
  status: QuestionOutcome;
  passedCount: number;
  enabledCount: number;
  scoreMicro: number;
  maxMicro: number;
  results: GradedTestCase[];
}

/**
 * Grade one question. `tests` are the ENABLED test cases, in order; every one
 * must have a verdict (runner-result guarantees this for a SUCCESS outcome).
 */
export function gradeQuestion(
  marksMicro: number,
  tests: GradableTest[],
  verdicts: Map<string, TestVerdict>,
): QuestionGrade {
  const share = testCaseShare(marksMicro, tests.length);
  const results = tests.map((t): GradedTestCase => {
    const verdict = verdicts.get(t.id);
    if (!verdict) throw new Error(`No verdict for test "${t.name}".`);
    return {
      testId: t.id,
      testName: t.name,
      passed: verdict.passed,
      shareMicro: share,
      awardedMicro: verdict.passed ? share : 0,
      message: verdict.message,
      expected: verdict.expected,
      actual: verdict.actual,
      durationMs: verdict.durationMs,
      hidden: t.hidden,
    };
  });
  const passedCount = results.filter((r) => r.passed).length;
  return {
    status: questionStatus(passedCount, tests.length),
    passedCount,
    enabledCount: tests.length,
    scoreMicro: questionScore(marksMicro, passedCount, tests.length),
    maxMicro: marksMicro,
    results,
  };
}

export interface SittingGrade {
  /** False while any question is ungraded: there is no score yet, never a partial 0. */
  complete: boolean;
  scoreMicro: number;
  maxMicro: number;
  percentage: string;
  result: 'PASSED' | 'FAILED' | null;
}

/**
 * Total a sitting. `maxMicro` is the test's total marks; `questionScores`
 * holds each question's score, or null while it is not graded.
 */
export function gradeSitting(
  questionScores: (number | null)[],
  maxMicro: number,
  passingPercentage: DecimalLike,
): SittingGrade {
  const complete = questionScores.length > 0 && questionScores.every((s) => s !== null);
  const scoreMicro = totalOf(questionScores.map((s) => s ?? 0));
  return {
    complete,
    scoreMicro,
    maxMicro,
    percentage: percentageOf(scoreMicro, maxMicro),
    result: complete ? (isPassing(scoreMicro, maxMicro, passingPercentage) ? 'PASSED' : 'FAILED') : null,
  };
}
