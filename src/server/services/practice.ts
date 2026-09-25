import type { Attempt, AttemptStatus, Exam } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AppError, forbidden, notFound } from '@/lib/errors';
import { logger, sanitizeError } from '@/lib/logger';
import { runOnRunner } from '@/lib/runner-client';
import { toStudentOutcome, type StudentOutcome } from '@/lib/outcome';
import type { SessionUser } from '@/lib/authz';
import { gradeQuestion } from '@/server/grading/evaluate';
import { executionOutcomeOf } from '@/server/grading/run-tests';
import { fromMicro, toMicro } from '@/server/grading/marks';
import { outcomeFromError, outcomeFromResult, type RunnerOutcome } from '@/server/grading/runner-result';
import { enabledTests, snapshotOf, specFromSnapshot } from './questions';
import { getExamTimeState } from './sessions';

export const COMPLETED_ATTEMPT_STATUSES: readonly AttemptStatus[] = [
  'SUBMITTED',
  'AUTO_SUBMITTED',
  'EXPIRED',
];
export const PRACTICE_IN_PROGRESS_MESSAGE = 'Cannot access practice mode while the exam is in progress.';

/**
 * Post-submission Practice Mode.
 *
 * Rules:
 *  1. Access control: only the attempt's owner can practice, and only once their attempt
 *     is in a completed status (SUBMITTED, AUTO_SUBMITTED, EXPIRED), and only while an
 *     administrator has not revoked their access to the test.
 *  2. Exam sitting check: students cannot enter practice mode if their current sitting of
 *     the test is IN_PROGRESS.
 *  3. Invariance: editing and running tests in practice mode NEVER writes to the original Attempt
 *     row (no code changes, no score updates, no status updates) and never adds results to it.
 *  4. Test execution: the attempt's frozen snapshot is run, and recorded as a PRACTICE run
 *     that is not linked to the attempt (attemptId: null), so it is never counted, shown in
 *     the attempt's review, or kept past the test-log retention period.
 */
export async function loadPracticeAttempt(attemptId: string, user: Pick<SessionUser, 'id'>) {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId }, include: { exam: true } });
  if (!attempt || attempt.userId !== user.id) throw notFound('Attempt not found.');

  const assignment = await prisma.examAssignment.findUnique({
    where: { examId_userId: { examId: attempt.examId, userId: user.id } },
    select: { revokedAt: true },
  });
  if (assignment?.revokedAt) throw notFound('Attempt not found.');

  if (!COMPLETED_ATTEMPT_STATUSES.includes(attempt.status)) {
    throw forbidden('Practice mode is only available for completed attempts.');
  }

  const timeState = await getExamTimeState(attempt.examId, user.id, attempt.exam);
  if (timeState.availability === 'IN_PROGRESS') {
    throw forbidden(PRACTICE_IN_PROGRESS_MESSAGE);
  }
  return attempt as Attempt & { exam: Exam };
}

export async function executePracticeTests(params: {
  attemptId: string;
  user: SessionUser;
  code: { html: string; css: string; js: string };
}): Promise<StudentOutcome> {
  const attempt = await loadPracticeAttempt(params.attemptId, params.user);

  const snapshot = snapshotOf(attempt);
  const tests = enabledTests(snapshot);
  const spec = specFromSnapshot(snapshot);
  const marksMicro = toMicro(attempt.maxScore);

  const testRun = await prisma.testRun.create({
    data: {
      attemptId: null,
      questionId: attempt.questionId,
      userId: params.user.id,
      kind: 'PRACTICE',
      status: 'RUNNING',
      totalCount: tests.length,
      maxScore: fromMicro(marksMicro),
      code: params.code,
      reason: 'post-submission practice',
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
    logger.error('practice.run.failed', {
      runId: testRun.id,
      attemptId: attempt.id,
      kind: outcome.kind,
      detail: outcome.detail,
    });
    throw new AppError(503, outcome.message, outcome.code);
  }

  const grade = gradeQuestion(marksMicro, tests, outcome.verdicts);
  await prisma.testRun.update({
    where: { id: testRun.id },
    data: {
      status: 'COMPLETED',
      passedCount: grade.passedCount,
      failedCount: grade.enabledCount - grade.passedCount,
      totalCount: grade.enabledCount,
      score: fromMicro(grade.scoreMicro),
      maxScore: fromMicro(grade.maxMicro),
      durationMs,
      completedAt: new Date(),
      logs,
    },
  });

  return toStudentOutcome(executionOutcomeOf(testRun.id, grade, durationMs));
}

export interface PracticeLink {
  attemptId: string;
  questionTitle: string;
}

/**
 * What Practice Mode can open for a student, per test: the latest completed
 * attempt of each question (a retaken test lists each question once), titled
 * as the student saw it (the attempt's frozen snapshot).
 */
export async function listPracticeAttempts(userId: string): Promise<Map<string, PracticeLink[]>> {
  const attempts = await prisma.attempt.findMany({
    where: { userId, status: { in: [...COMPLETED_ATTEMPT_STATUSES] } },
    select: { id: true, examId: true, questionId: true, snapshot: true },
    orderBy: [{ submittedAt: 'desc' }, { startedAt: 'desc' }],
  });
  const byExam = new Map<string, PracticeLink[]>();
  const seen = new Set<string>();
  for (const a of attempts) {
    const key = `${a.examId}:${a.questionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const links = byExam.get(a.examId) ?? [];
    links.push({ attemptId: a.id, questionTitle: (a.snapshot as { title?: string } | null)?.title ?? '' });
    byExam.set(a.examId, links);
  }
  return byExam;
}
