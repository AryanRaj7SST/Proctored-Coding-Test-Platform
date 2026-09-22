/** Pure scoring helpers. Dependency-free so they are trivially unit-testable. */

export interface ScoredTest {
  testId?: string | null;
  testName: string;
  passed: boolean;
  points: number;
  hidden?: boolean;
  message?: string | undefined;
  durationMs?: number;
}

export interface ScoreSummary {
  score: number;
  maxScore: number;
  percentage: number;
  passedCount: number;
  failedCount: number;
  totalCount: number;
}

const safePoints = (p: unknown): number => {
  const n = Number(p);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

export function summarizeResults(results: ScoredTest[]): ScoreSummary {
  let score = 0;
  let maxScore = 0;
  let passedCount = 0;
  for (const r of results) {
    const pts = safePoints(r.points);
    maxScore += pts;
    if (r.passed) {
      score += pts;
      passedCount += 1;
    }
  }
  const totalCount = results.length;
  return {
    score,
    maxScore,
    percentage: maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0,
    passedCount,
    failedCount: totalCount - passedCount,
    totalCount,
  };
}

export function pointsAwarded(test: ScoredTest): number {
  return test.passed ? safePoints(test.points) : 0;
}

/**
 * Aggregate several attempt scores (one exam = many questions).
 * Uses the STORED attempt scores, never a recomputation from current tests,
 * so historical results stay reproducible (product requirement #44/#45).
 */
export function aggregateAttempts(attempts: { score: number; maxScore: number }[]): ScoreSummary {
  const score = attempts.reduce((s, a) => s + Math.max(0, Math.round(a.score || 0)), 0);
  const maxScore = attempts.reduce((s, a) => s + Math.max(0, Math.round(a.maxScore || 0)), 0);
  return {
    score,
    maxScore,
    percentage: maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0,
    passedCount: 0,
    failedCount: 0,
    totalCount: attempts.length,
  };
}

/** Student-visible view of a result: hidden tests never leak their internals. */
export function toStudentResult(r: ScoredTest): {
  testName: string;
  passed: boolean;
  points: number;
  pointsAwarded: number;
  message: string | undefined;
  durationMs: number;
} {
  return {
    testName: r.testName,
    passed: r.passed,
    points: safePoints(r.points),
    pointsAwarded: pointsAwarded(r),
    message: r.message,
    durationMs: Math.max(0, Math.round(r.durationMs ?? 0)),
  };
}
