import type { Attempt, Prisma, TestRunKind } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { logger, sanitizeError } from '@/lib/logger';
import { runOnRunner } from '@/lib/runner-client';
import type { ExecutionOutcome } from '@/lib/outcome';
import { enabledTests, snapshotOf, specFromSnapshot } from '@/server/services/questions';
import { gradeQuestion, type QuestionGrade } from './evaluate';
import { fromMicro, microToNumber, percentageOf, toMicro } from './marks';
import { outcomeFromError, outcomeFromResult, type RunnerOutcome } from './runner-result';

/**
 * Execute an attempt's snapshot tests in the isolated runner and record the run.
 *
 *   snapshot -> enabled test cases -> runner -> normalised outcome
 *            -> per-test verdicts -> question score (marks x passed / enabled)
 *
 * `final` = true is a graded run: its results replace the attempt's counted
 * results (earlier ones are kept, marked superseded) and set the attempt's
 * score in the same transaction. Practice runs never change a stored score.
 *
 * Any runner outcome other than SUCCESS throws a 503 AppError and is never
 * turned into a score: a first grading stays "grading pending"
 * (RUNNER_ERROR); a failed regrade leaves the existing grade untouched.
 */
export async function executeTests(params: {
  attempt: Attempt;
  code: { html: string; css: string; js: string };
  kind: TestRunKind;
  final: boolean;
  userId: string;
  reason?: string;
  triggeredById?: string;
}): Promise<ExecutionOutcome> {
  const { attempt, final } = params;
  const snapshot = snapshotOf(attempt);
  const tests = enabledTests(snapshot);
  const spec = specFromSnapshot(snapshot); // server-selected: student input never names a spec
  const marksMicro = toMicro(attempt.maxScore);

  const testRun = await prisma.testRun.create({
    data: {
      attemptId: attempt.id,
      questionId: attempt.questionId,
      userId: params.userId,
      kind: params.kind,
      status: 'RUNNING',
      totalCount: tests.length,
      maxScore: fromMicro(marksMicro),
      code: params.code,
      reason: params.reason ?? null,
      triggeredById: params.triggeredById ?? null,
    },
  });

  const started = Date.now();
  let outcome: RunnerOutcome;
  try {
    const raw = await runOnRunner({ runId: testRun.id, ...params.code, spec });
    outcome = outcomeFromResult(
      raw,
      tests.map((t) => t.id),
    );
  } catch (err) {
    outcome = outcomeFromError(err);
  }
  const durationMs = Date.now() - started;
  const logs = outcome.consoleLogs.slice(0, 50).join('\n').slice(0, 8000) || null;

  if (outcome.kind !== 'SUCCESS') {
    await prisma.testRun.update({
      where: { id: testRun.id },
      data: {
        status: outcome.kind === 'TIMEOUT' ? 'TIMEOUT' : 'FAILED',
        completedAt: new Date(),
        durationMs,
        logs,
        error: sanitizeError(`${outcome.kind}: ${outcome.detail}`),
      },
    });
    if (final) {
      await prisma.attempt.update({
        where: { id: attempt.id },
        data: {
          gradingError: `${outcome.kind}: ${sanitizeError(outcome.detail, 300)}`,
          // Only an attempt without a grade becomes "grading pending"; a failed
          // regrade must not throw away a valid earlier grade.
          ...(attempt.gradedAt ? {} : { resultStatus: 'RUNNER_ERROR' as const }),
        },
      });
    }
    logger.error('run.failed', {
      runId: testRun.id,
      attemptId: attempt.id,
      kind: outcome.kind,
      detail: outcome.detail,
    });
    throw new AppError(503, outcome.message, outcome.code);
  }

  const grade = gradeQuestion(marksMicro, tests, outcome.verdicts);
  await persistGrade({ attempt, testRunId: testRun.id, grade, final, durationMs, logs });

  return {
    runId: testRun.id,
    status: 'COMPLETED',
    questionStatus: grade.status,
    results: grade.results.map((r) => ({
      testName: r.testName,
      passed: r.passed,
      points: microToNumber(r.shareMicro),
      pointsAwarded: microToNumber(r.awardedMicro),
      message: r.message,
      expected: r.expected,
      actual: r.actual,
      durationMs: r.durationMs,
    })),
    score: microToNumber(grade.scoreMicro),
    maxScore: microToNumber(grade.maxMicro),
    percentage: Number(percentageOf(grade.scoreMicro, grade.maxMicro)),
    passedCount: grade.passedCount,
    failedCount: grade.enabledCount - grade.passedCount,
    totalCount: grade.enabledCount,
    durationMs,
  };
}

async function persistGrade(params: {
  attempt: Attempt;
  testRunId: string;
  grade: QuestionGrade;
  final: boolean;
  durationMs: number;
  logs: string | null;
}): Promise<void> {
  const { attempt, grade, final } = params;
  await prisma.$transaction(async (tx) => {
    if (final) {
      // Serialise concurrent gradings of one attempt so their result sets
      // can never interleave (the grading lease prevents most overlaps).
      await tx.$queryRaw`SELECT id FROM attempts WHERE id = ${attempt.id} FOR UPDATE`;
    }
    await tx.testRun.update({
      where: { id: params.testRunId },
      data: {
        status: 'COMPLETED',
        passedCount: grade.passedCount,
        failedCount: grade.enabledCount - grade.passedCount,
        totalCount: grade.enabledCount,
        score: fromMicro(grade.scoreMicro),
        maxScore: fromMicro(grade.maxMicro),
        durationMs: params.durationMs,
        completedAt: new Date(),
        logs: params.logs,
      },
    });

    if (final) {
      // Earlier counted results stay attached to their own run as history.
      await tx.testResult.updateMany({
        where: { attemptId: attempt.id, final: true },
        data: { final: false },
      });
    }

    await tx.testResult.createMany({
      data: await resultRows(tx, attempt, params.testRunId, grade, final),
    });

    if (final) {
      // Score and gradedAt land with the results: an attempt is either fully
      // graded or still "grading pending".
      await tx.attempt.updateMany({
        where: { id: attempt.id, status: { not: 'IN_PROGRESS' } },
        data: {
          score: fromMicro(grade.scoreMicro),
          maxScore: fromMicro(grade.maxMicro),
          resultStatus: grade.status,
          passedCount: grade.passedCount,
          enabledCount: grade.enabledCount,
          gradingError: null,
          gradedAt: new Date(),
        },
      });
    }
  });
}

/**
 * Result rows for a graded run. testId links to the live test row when it
 * still exists (by id, else by name); snapshots outlive edits to the question.
 */
async function resultRows(
  tx: Prisma.TransactionClient,
  attempt: Attempt,
  testRunId: string,
  grade: QuestionGrade,
  final: boolean,
): Promise<Prisma.TestResultCreateManyInput[]> {
  const current = await tx.questionTest.findMany({
    where: { questionId: attempt.questionId },
    select: { id: true, name: true },
  });
  const liveIds = new Set(current.map((t) => t.id));
  const idByName = new Map(current.map((t) => [t.name, t.id]));

  return grade.results.map((r) => ({
    attemptId: attempt.id,
    testRunId,
    testId: liveIds.has(r.testId) ? r.testId : (idByName.get(r.testName) ?? null),
    testName: r.testName,
    passed: r.passed,
    points: fromMicro(r.shareMicro),
    pointsAwarded: fromMicro(r.awardedMicro),
    message: r.message ?? null,
    expected: r.expected ?? null,
    actual: r.actual ?? null,
    durationMs: r.durationMs,
    final,
  }));
}
