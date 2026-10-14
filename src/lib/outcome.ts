/**
 * Pure projections for a test-execution result.
 *
 * Kept dependency-free (no Prisma, no runner client) so the rule deciding
 * what a student's browser learns about a run can be unit tested in isolation.
 */

export interface ExecutionResultRow {
  testName: string;
  passed: boolean;
  /** This test's equal share of the question marks, and what it earned. */
  points: number;
  pointsAwarded: number;
  message?: string;
  expected?: string;
  actual?: string;
  durationMs: number;
  hidden?: boolean;
  isHidden?: boolean;
}

/** PASSED only when every enabled test case passed. */
export type QuestionStatus = 'PASSED' | 'PARTIAL' | 'FAILED';

export interface ExecutionOutcome {
  runId: string;
  status: 'COMPLETED' | 'FAILED' | 'TIMEOUT';
  /** Null when there is no graded run to describe (grading pending). */
  questionStatus: QuestionStatus | null;
  results: ExecutionResultRow[];
  score: number;
  maxScore: number;
  percentage: number;
  passedCount: number;
  failedCount: number;
  totalCount: number;
  durationMs: number;
  /** Runner-internal error summary. Admin-only; never projected to students. */
  error?: string;
}

export interface StudentTestFeedback {
  testName: string;
  passed: boolean;
  points: number;
  pointsAwarded: number;
  durationMs: number;
  message: string | undefined;
  expected: string | undefined;
  actual: string | undefined;
}

export interface StudentOutcome {
  runId: string;
  status: ExecutionOutcome['status'];
  questionStatus: QuestionStatus | null;
  score: number;
  maxScore: number;
  percentage: number;
  passedCount: number;
  failedCount: number;
  totalCount: number;
  durationMs: number;
  results: StudentTestFeedback[];
}

/** Longest failure message / expected-or-actual value a student is shown. */
export const MAX_STUDENT_MESSAGE = 1000;
export const MAX_STUDENT_VALUE = 300;

/**
 * Student feedback for one test. Built field by field from the test's
 * definition and its execution result, so nothing else a row might carry --
 * runner errors, logs, stack traces, environment details -- can reach the
 * browser. For hidden tests, message, expected and actual are never returned.
 * A failing test always explains itself; a passing one needs no message.
 */
export function toStudentFeedback(row: ExecutionResultRow): StudentTestFeedback {
  const isHidden = Boolean(row.hidden || row.isHidden);
  return {
    testName: row.testName,
    passed: row.passed,
    points: row.points,
    pointsAwarded: row.pointsAwarded,
    durationMs: row.durationMs,
    message:
      isHidden || row.passed
        ? undefined
        : (row.message ?? 'This test did not pass.').slice(0, MAX_STUDENT_MESSAGE),
    expected: isHidden || row.passed ? undefined : row.expected?.slice(0, MAX_STUDENT_VALUE),
    actual: isHidden || row.passed ? undefined : row.actual?.slice(0, MAX_STUDENT_VALUE),
  };
}

/** Student-safe projection of a whole run: the summary plus per-test feedback. */
export function toStudentOutcome(outcome: ExecutionOutcome): StudentOutcome {
  let hiddenIndex = 1;
  return {
    runId: outcome.runId,
    status: outcome.status,
    questionStatus: outcome.questionStatus,
    score: outcome.score,
    maxScore: outcome.maxScore,
    percentage: outcome.percentage,
    passedCount: outcome.passedCount,
    failedCount: outcome.failedCount,
    totalCount: outcome.totalCount,
    durationMs: outcome.durationMs,
    results: outcome.results.map((row) => {
      const feedback = toStudentFeedback(row);
      const isHidden = Boolean(row.hidden || row.isHidden);
      if (isHidden && !feedback.testName.startsWith('Hidden test')) {
        feedback.testName = `Hidden test ${hiddenIndex++}`;
      }
      return feedback;
    }),
  };
}
