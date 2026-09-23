import type { Attempt, Exam, TestRunKind } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '@/lib/http';
import { logger, sanitizeError } from '@/lib/logger';
import { runOnRunner, RunnerError, runnerErrorMessage } from '@/lib/runner-client';
import { summarizeResults, type ScoredTest } from '@/lib/scoring';
import { canModifyAttempt, withinSubmitDeadline } from '@/lib/timing';
import { buildSnapshot, specFromSnapshot, type QuestionSnapshot } from './questions';
import { getExamTimeState, endSession } from './sessions';
import { recordAudit } from './audit';
import { toStudentOutcome, type ExecutionOutcome } from '@/lib/outcome';

// Re-exported so route handlers keep importing the outcome helpers from the
// service they already use. The implementation lives in a Prisma-free module
// (src/lib/outcome.ts) so it can be unit tested without a database.
export { toStudentOutcome };
export type { ExecutionOutcome };

/** Get the student's attempt for a question, creating it (with a frozen snapshot) on first open. */
export async function getOrCreateAttempt(examId: string, questionId: string, userId: string): Promise<Attempt> {
  const existing = await prisma.attempt.findUnique({
    where: { userId_examId_questionId: { userId, examId, questionId } },
  });
  if (existing) return existing;

  const examQuestion = await prisma.examQuestion.findUnique({
    where: { examId_questionId: { examId, questionId } },
    include: { question: { include: { tests: { orderBy: { order: 'asc' } } } } },
  });
  if (!examQuestion) throw notFound('Question not found in this exam.');

  const question = examQuestion.question;
  const snapshot = buildSnapshot(question);
  const maxScore = examQuestion.pointsOverride ?? snapshot.tests.reduce((s, t) => s + t.points, 0);

  try {
    return await prisma.attempt.create({
      data: {
        userId,
        examId,
        questionId,
        html: question.starterHtml,
        css: question.starterCss,
        js: question.starterJs,
        maxScore,
        snapshot: snapshot as unknown as object,
        questionVersion: question.version,
      },
    });
  } catch {
    // Lost a create race with a parallel tab -- return the winner.
    const raced = await prisma.attempt.findUnique({
      where: { userId_examId_questionId: { userId, examId, questionId } },
    });
    if (raced) return raced;
    throw conflict('Could not open this question. Please refresh.');
  }
}

export function snapshotOf(attempt: Attempt): QuestionSnapshot {
  return attempt.snapshot as unknown as QuestionSnapshot;
}

/** Guard shared by autosave / run / submit. */
async function assertAttemptWritable(attempt: Attempt, exam: Exam): Promise<void> {
  const state = await getExamTimeState(exam.id, attempt.userId, exam);
  if (!canModifyAttempt(state.availability, attempt.status)) {
    if (attempt.status !== 'IN_PROGRESS') throw conflict('This attempt has already been submitted.');
    if (state.availability === 'EXPIRED') throw forbidden('Your time for this exam has expired.');
    if (state.availability === 'ENDED') throw forbidden('This exam has closed.');
    throw forbidden('This exam is not open for editing.');
  }
}

/**
 * Autosave. Uses a conditional update so a stale tab cannot resurrect a
 * submitted attempt, and writes only when something actually changed.
 */
export async function saveAttemptCode(
  attemptId: string,
  userId: string,
  code: { html: string; css: string; js: string },
): Promise<{ updatedAt: Date; saved: boolean }> {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId }, include: { exam: true } });
  if (!attempt || attempt.userId !== userId) throw notFound('Attempt not found.');
  await assertAttemptWritable(attempt, attempt.exam);

  if (attempt.html === code.html && attempt.css === code.css && attempt.js === code.js) {
    return { updatedAt: attempt.updatedAt, saved: false };
  }

  const result = await prisma.attempt.updateMany({
    where: { id: attemptId, userId, status: 'IN_PROGRESS' },
    data: { html: code.html, css: code.css, js: code.js },
  });
  if (result.count === 0) throw conflict('This attempt can no longer be edited.');
  const fresh = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, select: { updatedAt: true } });
  return { updatedAt: fresh.updatedAt, saved: true };
}

/**
 * Execute the snapshot's tests against the supplied code in the isolated runner
 * and persist a TestRun (+ TestResult rows).
 *
 * `final` = true writes the graded result onto the attempt. Practice runs never
 * change a stored score.
 */
export async function executeTests(params: {
  attempt: Attempt;
  code: { html: string; css: string; js: string };
  kind: TestRunKind;
  final: boolean;
  userId: string;
}): Promise<ExecutionOutcome> {
  const snapshot = snapshotOf(params.attempt);
  const spec = specFromSnapshot(snapshot); // server-selected: student input never names a spec
  const pointsById = new Map(snapshot.tests.map((t) => [t.id, t.points]));
  const hiddenById = new Map(snapshot.tests.map((t) => [t.id, t.hidden]));
  const nameById = new Map(snapshot.tests.map((t) => [t.id, t.name]));

  const testRun = await prisma.testRun.create({
    data: {
      attemptId: params.attempt.id,
      questionId: params.attempt.questionId,
      userId: params.userId,
      kind: params.kind,
      status: 'RUNNING',
      totalCount: spec.tests.length,
      maxScore: snapshot.tests.reduce((s, t) => s + t.points, 0),
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

    await prisma.$transaction(async (tx) => {
      await tx.testRun.update({
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

      if (params.final) {
        // Replace any earlier final results so a re-grade stays consistent.
        await tx.testResult.deleteMany({ where: { attemptId: params.attempt.id, final: true } });
      }
      await tx.testResult.createMany({
        data: scored.map((s) => ({
          attemptId: params.attempt.id,
          testRunId: testRun.id,
          testId: s.testId ?? null,
          testName: s.testName,
          passed: s.passed,
          hidden: s.hidden ?? true,
          points: s.points,
          pointsAwarded: s.passed ? s.points : 0,
          message: s.message ? s.message.slice(0, 1000) : null,
          durationMs: s.durationMs ?? 0,
          final: params.final,
        })),
      });
    });

    return {
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
    logger.error('run.failed', { runId: testRun.id, attemptId: params.attempt.id, error: sanitizeError(err) });
    throw badRequest(message);
  }
}

/**
 * Submit an attempt: idempotent, deadline-checked, ownership-checked.
 * Grading happens inside the same request and the score is stored, so later
 * edits to the question cannot change it.
 */
export async function submitAttempt(params: {
  attemptId: string;
  userId: string;
  code?: { html: string; css: string; js: string };
  auto?: boolean;
}): Promise<ExecutionOutcome & { alreadySubmitted: boolean }> {
  const attempt = await prisma.attempt.findUnique({ where: { id: params.attemptId }, include: { exam: true } });
  if (!attempt || attempt.userId !== params.userId) throw notFound('Attempt not found.');

  if (attempt.status !== 'IN_PROGRESS') {
    // Idempotent: return the stored grading rather than re-scoring.
    const stored = await prisma.testResult.findMany({
      where: { attemptId: attempt.id, final: true },
      orderBy: { createdAt: 'asc' },
    });
    const summary = summarizeResults(stored.map((r) => ({ ...r, message: r.message ?? undefined })));
    return {
      runId: '',
      status: 'COMPLETED',
      results: stored.map((r) => ({
        testName: r.testName,
        passed: r.passed,
        points: r.points,
        pointsAwarded: r.pointsAwarded,
        message: r.message ?? undefined,
        durationMs: r.durationMs,
        hidden: r.hidden,
      })),
      score: attempt.score,
      maxScore: attempt.maxScore,
      percentage: attempt.maxScore ? Math.round((attempt.score / attempt.maxScore) * 1000) / 10 : 0,
      passedCount: summary.passedCount,
      failedCount: summary.failedCount,
      totalCount: summary.totalCount,
      durationMs: 0,
      alreadySubmitted: true,
    };
  }

  const state = await getExamTimeState(attempt.examId, params.userId, attempt.exam);
  if (!params.auto) {
    if (state.availability === 'ENDED') throw forbidden('This exam has closed. Submissions are no longer accepted.');
    if (state.expiresAt && !withinSubmitDeadline(state.expiresAt)) {
      throw forbidden('Your time for this exam has expired.');
    }
  }

  const code = params.code ?? { html: attempt.html, css: attempt.css, js: attempt.js };

  // Freeze the code first so the graded artefact is exactly what is stored.
  await prisma.attempt.updateMany({
    where: { id: attempt.id, status: 'IN_PROGRESS' },
    data: { html: code.html, css: code.css, js: code.js },
  });

  const outcome = await executeTests({
    attempt: { ...attempt, ...code },
    code,
    kind: 'SUBMISSION',
    final: true,
    userId: params.userId,
  });

  const updated = await prisma.attempt.updateMany({
    where: { id: attempt.id, status: 'IN_PROGRESS' },
    data: {
      score: outcome.score,
      maxScore: outcome.maxScore || attempt.maxScore,
      status: params.auto ? 'AUTO_SUBMITTED' : 'SUBMITTED',
      submittedAt: new Date(),
      gradedAt: new Date(),
    },
  });
  if (updated.count === 0) throw conflict('This attempt was already submitted.');

  await recordAudit({
    userId: params.userId,
    action: params.auto ? 'attempt.auto_submitted' : 'attempt.submitted',
    entity: 'Attempt',
    entityId: attempt.id,
    metadata: { score: outcome.score, maxScore: outcome.maxScore },
  });

  await maybeFinishExam(attempt.examId, params.userId);
  return { ...outcome, alreadySubmitted: false };
}

/** When every assigned question is submitted, close the sitting. */
export async function maybeFinishExam(examId: string, userId: string): Promise<void> {
  const [total, submitted] = await Promise.all([
    prisma.examQuestion.count({ where: { examId } }),
    prisma.attempt.count({ where: { examId, userId, status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } } }),
  ]);
  if (total > 0 && submitted >= total) {
    await prisma.$transaction([
      prisma.examAssignment.updateMany({ where: { examId, userId }, data: { status: 'SUBMITTED' } }),
      prisma.proctorEvent.create({ data: { userId, examId, type: 'EXAM_SUBMITTED', violation: false } }),
    ]);
    await endSession(examId, userId, 'SUBMITTED');
  }
}

/**
 * Finalise everything for a sitting whose server-side clock has run out.
 * Called from the exam page, the heartbeat endpoint and the admin monitor, so
 * expiry is enforced even if the student closed the browser.
 */
export async function finalizeExpiredAttempts(examId: string, userId: string): Promise<number> {
  const open = await prisma.attempt.findMany({ where: { examId, userId, status: 'IN_PROGRESS' } });
  let finalised = 0;
  for (const attempt of open) {
    try {
      await submitAttempt({ attemptId: attempt.id, userId, auto: true });
      finalised += 1;
    } catch (err) {
      // A runner outage must not block expiry: record the attempt as EXPIRED
      // with whatever results already exist rather than leaving it open.
      logger.warn('autosubmit.grading_failed', { attemptId: attempt.id, error: sanitizeError(err) });
      await prisma.attempt.updateMany({
        where: { id: attempt.id, status: 'IN_PROGRESS' },
        data: { status: 'EXPIRED', submittedAt: new Date() },
      });
      finalised += 1;
    }
  }
  await prisma.examAssignment.updateMany({
    where: { examId, userId, status: { in: ['ASSIGNED', 'STARTED'] } },
    data: { status: 'EXPIRED' },
  });
  await endSession(examId, userId, 'EXPIRED');
  return finalised;
}

/**
 * End the exam explicitly by the student.
 * Submits all open attempts (grading them with current code),
 * marks the exam assignment as SUBMITTED, and closes the session.
 */
export async function endExam(examId: string, userId: string): Promise<{ submittedCount: number }> {
  const openAttempts = await prisma.attempt.findMany({
    where: { examId, userId, status: 'IN_PROGRESS' },
  });

  let submittedCount = 0;
  for (const attempt of openAttempts) {
    try {
      await submitAttempt({ attemptId: attempt.id, userId, auto: false });
      submittedCount += 1;
    } catch (err) {
      logger.warn('endExam.submit_failed', { attemptId: attempt.id, error: sanitizeError(err) });
      await prisma.attempt.updateMany({
        where: { id: attempt.id, status: 'IN_PROGRESS' },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });
      submittedCount += 1;
    }
  }

  await prisma.$transaction([
    prisma.examAssignment.updateMany({ where: { examId, userId }, data: { status: 'SUBMITTED' } }),
    prisma.proctorEvent.create({ data: { userId, examId, type: 'EXAM_SUBMITTED', violation: false } }),
  ]);
  await endSession(examId, userId, 'SUBMITTED');

  await recordAudit({
    userId,
    action: 'exam.ended',
    entity: 'Exam',
    entityId: examId,
    metadata: { submittedCount },
  });

  return { submittedCount };
}

