import { prisma } from '@/lib/prisma';
import { notFound, forbidden, badRequest } from '@/lib/http';
import { runOnRunner, RunnerError, runnerErrorMessage } from '@/lib/runner-client';
import { sanitizeError, logger } from '@/lib/logger';
import { snapshotOf } from '@/server/services/attempts';
import { specFromSnapshot } from '@/server/services/questions';
import { summarizeResults, type ScoredTest } from '@/lib/scoring';
import { toStudentOutcome, type ExecutionOutcome, type StudentOutcome } from '@/lib/outcome';
import { getExamTimeState } from '@/server/services/sessions';
import type { SessionUser } from '@/lib/authz';

export const COMPLETED_ATTEMPT_STATUSES = ['SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED'] as const;

/**
 * Executes tests in post-submission Practice Mode.
 *
 * Rules:
 *  1. Access control: only the attempt's owner can practice, and only once their attempt
 *     is in a completed status (SUBMITTED, AUTO_SUBMITTED, EXPIRED).
 *  2. Exam sitting check: students cannot enter practice mode if their exam sitting is
 *     currently IN_PROGRESS.
 *  3. Invariance: editing and running tests in practice mode NEVER writes to the original Attempt
 *     row (no code changes, no score updates, no status updates).
 *  4. Test execution: creates an unlinked TestRun (attemptId: null, kind: 'VALIDATION')
 *     without writing any TestResult rows against the attempt.
 */
export async function executePracticeTests(params: {
  attemptId: string;
  user: SessionUser;
  code: { html: string; css: string; js: string };
}): Promise<StudentOutcome> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: params.attemptId },
    include: { exam: true },
  });

  if (!attempt || attempt.userId !== params.user.id) {
    throw notFound('Attempt not found.');
  }

  if (!COMPLETED_ATTEMPT_STATUSES.includes(attempt.status as (typeof COMPLETED_ATTEMPT_STATUSES)[number])) {
    throw forbidden('Practice mode is only available for completed attempts.');
  }

  const timeState = await getExamTimeState(attempt.examId, params.user.id, attempt.exam);
  if (timeState.availability === 'IN_PROGRESS') {
    throw forbidden('Cannot access practice mode while the exam is in progress.');
  }

  const snapshot = snapshotOf(attempt);
  const spec = specFromSnapshot(snapshot);
  const pointsById = new Map(snapshot.tests.map((t) => [t.id, t.points]));
  const hiddenById = new Map(snapshot.tests.map((t) => [t.id, t.hidden]));
  const nameById = new Map(snapshot.tests.map((t) => [t.id, t.name]));

  // Create an unlinked TestRun record for tracking without associating with the Attempt
  const testRun = await prisma.testRun.create({
    data: {
      attemptId: null,
      questionId: attempt.questionId,
      userId: params.user.id,
      kind: 'VALIDATION',
      status: 'RUNNING',
      totalCount: spec.tests.length,
      maxScore: snapshot.tests.reduce((s, t) => s + t.points, 0),
      code: {
        html: params.code.html,
        css: params.code.css,
        js: params.code.js,
      },
    },
  });

  const started = Date.now();
  try {
    const result = await runOnRunner({
      runId: testRun.id,
      html: params.code.html,
      css: params.code.css,
      js: params.code.js,
      spec,
    });

    const scored: ScoredTest[] = spec.tests.map((t) => {
      const r = result.results.find((x) => x.id === t.id);
      return {
        testId: t.id,
        testName: nameById.get(t.id) ?? t.name,
        passed: Boolean(r?.passed),
        points: pointsById.get(t.id) ?? t.points,
        hidden: hiddenById.get(t.id) ?? true,
        message: r?.message,
        durationMs: r?.durationMs ?? 0,
      };
    });

    const summary = summarizeResults(scored);
    const durationMs = Date.now() - started;

    await prisma.testRun.update({
      where: { id: testRun.id },
      data: {
        status: result.status,
        passedCount: summary.passedCount,
        failedCount: summary.failedCount,
        totalCount: summary.totalCount,
        score: summary.score,
        maxScore: summary.maxScore,
        durationMs,
        completedAt: new Date(),
        logs: result.consoleLogs.slice(0, 50).join('\n').slice(0, 8000) || null,
        error: result.error ? result.error.slice(0, 1000) : null,
      },
    });

    const outcome: ExecutionOutcome = {
      runId: testRun.id,
      status: result.status,
      results: scored.map((s) => ({
        testName: s.testName,
        passed: s.passed,
        points: s.points,
        pointsAwarded: s.passed ? s.points : 0,
        message: s.message,
        durationMs: s.durationMs ?? 0,
        hidden: s.hidden ?? true,
      })),
      score: summary.score,
      maxScore: summary.maxScore,
      percentage: summary.percentage,
      passedCount: summary.passedCount,
      failedCount: summary.failedCount,
      totalCount: summary.totalCount,
      durationMs,
    };

    return toStudentOutcome(outcome);
  } catch (err) {
    const isRunnerError = err instanceof RunnerError;
    const message = isRunnerError ? runnerErrorMessage(err.code) : 'Test execution failed. Please try again.';
    await prisma.testRun.update({
      where: { id: testRun.id },
      data: {
        status: isRunnerError && err.code === 'TIMEOUT' ? 'TIMEOUT' : 'FAILED',
        completedAt: new Date(),
        durationMs: Date.now() - started,
        error: sanitizeError(err),
      },
    });
    logger.error('practice.run.failed', {
      runId: testRun.id,
      attemptId: params.attemptId,
      error: sanitizeError(err),
    });
    throw badRequest(message);
  }
}
