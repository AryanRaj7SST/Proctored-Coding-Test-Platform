import type { Attempt, Exam, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { conflict, forbidden, notFound } from '@/lib/errors';
import { canAutosaveAttempt, canModifyAttempt, withinSubmitDeadline } from '@/lib/timing';
import type { ExecutionOutcome } from '@/lib/outcome';
import { gradeAttempt, pendingOutcome, storedOutcome } from '@/server/grading/grade-attempt';
import { pinnedSnapshot } from './questions';
import { currentSession, getExamTimeState, maybeFinishExam } from './sessions';
import { recordAudit } from './audit';

type ExamQuestionWithTests = Prisma.ExamQuestionGetPayload<{
  include: { question: { include: { tests: true } } };
}>;

const withTests = { question: { include: { tests: { orderBy: { order: 'asc' as const } } } } };

/** Row for a new attempt: starter code, this test's marks, and the test's pinned snapshot. */
async function newAttemptData(examQuestion: ExamQuestionWithTests, session: { id: string; userId: string }) {
  const snapshot = await pinnedSnapshot(examQuestion);
  return {
    userId: session.userId,
    examId: examQuestion.examId,
    sessionId: session.id,
    questionId: examQuestion.questionId,
    html: snapshot.starterHtml,
    css: snapshot.starterCss,
    js: snapshot.starterJs,
    maxScore: examQuestion.marks,
    snapshot: snapshot as unknown as Prisma.InputJsonValue,
    questionVersion: snapshot.version,
  };
}

/** The student's open sitting in a test; attempts only exist inside one. */
async function openSession(examId: string, userId: string) {
  const session = await currentSession(examId, userId);
  if (!session || session.endedAt) throw conflict('Start the test before opening its questions.');
  return session;
}

/** Get the student's attempt for a question in their open sitting, creating it on first open. */
export async function getOrCreateAttempt(
  examId: string,
  questionId: string,
  userId: string,
): Promise<Attempt> {
  const session = await openSession(examId, userId);
  const key = { sessionId_questionId: { sessionId: session.id, questionId } };
  const existing = await prisma.attempt.findUnique({ where: key });
  if (existing) return existing;

  const examQuestion = await prisma.examQuestion.findUnique({
    where: { examId_questionId: { examId, questionId } },
    include: withTests,
  });
  if (!examQuestion) throw notFound('Question not found in this test.');

  try {
    return await prisma.attempt.create({ data: await newAttemptData(examQuestion, session) });
  } catch {
    // Lost a create race with a parallel tab -- return the winner.
    const raced = await prisma.attempt.findUnique({ where: key });
    if (raced) return raced;
    throw conflict('Could not open this question. Please refresh.');
  }
}

/**
 * Open (or reuse) the attempt for every question of a sitting, in test order.
 * A fixed number of queries regardless of question count; a parallel tab
 * creating the same attempts is absorbed by skipDuplicates.
 */
export async function ensureAttempts(session: {
  id: string;
  examId: string;
  userId: string;
}): Promise<{ order: number; attempt: Attempt }[]> {
  const [examQuestions, existing] = await Promise.all([
    prisma.examQuestion.findMany({
      where: { examId: session.examId },
      orderBy: { order: 'asc' },
      include: withTests,
    }),
    prisma.attempt.findMany({ where: { sessionId: session.id } }),
  ]);
  const opened = new Set(existing.map((a) => a.questionId));
  const missing = examQuestions.filter((eq) => !opened.has(eq.questionId));
  let attempts = existing;
  if (missing.length > 0) {
    await prisma.attempt.createMany({
      data: await Promise.all(missing.map((eq) => newAttemptData(eq, session))),
      skipDuplicates: true,
    });
    attempts = await prisma.attempt.findMany({ where: { sessionId: session.id } });
  }
  const byQuestion = new Map(attempts.map((a) => [a.questionId, a]));
  return examQuestions.flatMap((eq) => {
    const attempt = byQuestion.get(eq.questionId);
    return attempt ? [{ order: eq.order, attempt }] : [];
  });
}

/**
 * Guard shared by autosave / run. `allowGrace` (autosave only) accepts the
 * final flush that races the deadline, mirroring the submit grace window.
 */
async function assertAttemptWritable(attempt: Attempt, exam: Exam, allowGrace = false): Promise<void> {
  const state = await getExamTimeState(exam.id, attempt.userId, exam);
  const writable = allowGrace
    ? canAutosaveAttempt(state.availability, attempt.status, state.expiresAt)
    : canModifyAttempt(state.availability, attempt.status);
  if (!writable) {
    if (attempt.status !== 'IN_PROGRESS') throw conflict('This attempt has already been submitted.');
    if (state.availability === 'EXPIRED') throw forbidden('Your time for this test has expired.');
    if (state.availability === 'ENDED') throw forbidden('This test has closed.');
    throw forbidden('This test is not open for editing.');
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
  opts: { allowGrace?: boolean } = {},
): Promise<{ updatedAt: Date; saved: boolean }> {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId }, include: { exam: true } });
  if (!attempt || attempt.userId !== userId) throw notFound('Attempt not found.');
  await assertAttemptWritable(attempt, attempt.exam, opts.allowGrace);

  if (attempt.html === code.html && attempt.css === code.css && attempt.js === code.js) {
    return { updatedAt: attempt.updatedAt, saved: false };
  }

  const result = await prisma.attempt.updateMany({
    where: { id: attemptId, userId, status: 'IN_PROGRESS' },
    data: { html: code.html, css: code.css, js: code.js },
  });
  if (result.count === 0) throw conflict('This attempt can no longer be edited.');
  const fresh = await prisma.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: { updatedAt: true },
  });
  return { updatedAt: fresh.updatedAt, saved: true };
}

/* ------------------------------------------------------------------------
 * Submission
 *
 * One rule governs every path below: an attempt is CLAIMED before it is
 * graded. Claiming is a single conditional update IN_PROGRESS -> SUBMITTED /
 * AUTO_SUBMITTED that freezes the code, so exactly one caller wins even when a
 * timer, a heartbeat, a second tab and a violation event all race. Grading
 * then writes the score and gradedAt atomically (see executeTests).
 *
 * If grading cannot happen (runner down, crashed, timed out) the attempt stays
 * claimed with gradedAt = null: "grading pending". It is never scored 0 by
 * default, the student's code is preserved, and an admin can regrade it.
 * ---------------------------------------------------------------------- */

/** Atomically move an attempt out of IN_PROGRESS. Returns true for the one caller that wins. */
export async function claimAttempt(
  attemptId: string,
  status: 'SUBMITTED' | 'AUTO_SUBMITTED',
  code?: { html: string; css: string; js: string },
): Promise<boolean> {
  const claimed = await prisma.attempt.updateMany({
    where: { id: attemptId, status: 'IN_PROGRESS' },
    data: {
      status,
      submittedAt: new Date(),
      gradedAt: null,
      ...(code ? { html: code.html, css: code.css, js: code.js } : {}),
    },
  });
  return claimed.count === 1;
}

export type SubmitResult = ExecutionOutcome & {
  alreadySubmitted: boolean;
  /** True when the submission is recorded but grading is deferred. */
  gradingPending: boolean;
  gradingError?: string;
};

/**
 * Submit one question: idempotent, deadline-checked, ownership-checked.
 * A second call returns the stored grading rather than re-scoring.
 */
export async function submitAttempt(params: {
  attemptId: string;
  userId: string;
  code?: { html: string; css: string; js: string };
}): Promise<SubmitResult> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: params.attemptId },
    include: { exam: true },
  });
  if (!attempt || attempt.userId !== params.userId) throw notFound('Attempt not found.');

  if (attempt.status === 'IN_PROGRESS') {
    const state = await getExamTimeState(attempt.examId, params.userId, attempt.exam);
    if (state.availability === 'SUBMITTED' || state.availability === 'UNPUBLISHED') {
      throw conflict('This test is no longer accepting submissions.');
    }
    if (state.availability === 'ENDED') {
      throw forbidden('This test has closed. Submissions are no longer accepted.');
    }
    if (state.expiresAt && !withinSubmitDeadline(state.expiresAt)) {
      throw forbidden('Your time for this test has expired.');
    }

    const code = params.code ?? { html: attempt.html, css: attempt.css, js: attempt.js };
    if (await claimAttempt(attempt.id, 'SUBMITTED', code)) {
      const graded = await gradeAttempt(attempt.id);
      await recordAudit({
        userId: params.userId,
        action: 'attempt.submitted',
        entity: 'Attempt',
        entityId: attempt.id,
        metadata: graded.outcome
          ? { score: graded.outcome.score, maxScore: graded.outcome.maxScore }
          : { gradingPending: true },
      });
      await maybeFinishExam(attempt.examId, params.userId);
      if (graded.outcome) return { ...graded.outcome, alreadySubmitted: false, gradingPending: false };
      return {
        ...pendingOutcome(attempt),
        alreadySubmitted: false,
        gradingPending: true,
        gradingError: graded.error,
      };
    }
    // Lost the claim to a concurrent submit / finalisation: fall through and
    // report whatever that caller stored.
  }

  const fresh = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
  if (!fresh.gradedAt) {
    return { ...pendingOutcome(fresh), alreadySubmitted: true, gradingPending: true };
  }
  const stored = await prisma.testResult.findMany({
    where: { attemptId: attempt.id, final: true },
    orderBy: { createdAt: 'asc' },
  });
  return { ...storedOutcome(fresh, stored), alreadySubmitted: true, gradingPending: false };
}
