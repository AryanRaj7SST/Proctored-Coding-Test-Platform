/**
 * Pure projections for a test-execution result.
 *
 * Kept dependency-free (no Prisma, no runner client) so the single most
 * security-relevant transformation in the product -- deciding what a student's
 * browser learns about the hidden suite -- can be unit tested in isolation.
 */

export interface ExecutionResultRow {
  testName: string;
  passed: boolean;
  points: number;
  pointsAwarded: number;
  message?: string;
  durationMs: number;
  hidden: boolean;
}

export interface ExecutionOutcome {
  runId: string;
  status: 'COMPLETED' | 'FAILED' | 'TIMEOUT';
  results: ExecutionResultRow[];
  score: number;
  maxScore: number;
  percentage: number;
  passedCount: number;
  failedCount: number;
  totalCount: number;
  durationMs: number;
  error?: string;
}

export interface StudentOutcome {
  runId: string;
  status: ExecutionOutcome['status'];
  score: number;
  maxScore: number;
  percentage: number;
  passedCount: number;
  failedCount: number;
  totalCount: number;
  durationMs: number;
  results: {
    testName: string;
    passed: boolean;
    points: number;
    pointsAwarded: number;
    durationMs: number;
    hidden: boolean;
    message: string | undefined;
  }[];
}

/**
 * Student-safe projection.
 *
 * A passing test carries no message at all. A failing test always carries
 * something readable, falling back to a generic line when the assertion had no
 * author-supplied message. Nothing from the spec itself (selectors, expected
 * values, assertion types, runner internals) is ever included -- those live in
 * `ExecutionOutcome.results[].message` only when an author wrote them, and the
 * author-facing docs explain that this string is shown to students.
 */
export function toStudentOutcome(outcome: ExecutionOutcome): StudentOutcome {
  return {
    runId: outcome.runId,
    status: outcome.status,
    score: outcome.score,
    maxScore: outcome.maxScore,
    percentage: outcome.percentage,
    passedCount: outcome.passedCount,
    failedCount: outcome.failedCount,
    totalCount: outcome.totalCount,
    durationMs: outcome.durationMs,
    results: outcome.results.map((r) => ({
      testName: r.testName,
      passed: r.passed,
      points: r.points,
      pointsAwarded: r.pointsAwarded,
      durationMs: r.durationMs,
      hidden: r.hidden,
      message: r.passed ? undefined : (r.message ?? 'This test did not pass.'),
    })),
  };
}
