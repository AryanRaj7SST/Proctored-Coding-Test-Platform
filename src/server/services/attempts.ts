import type { Attempt, Exam, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { conflict, forbidden, notFound } from '@/lib/errors';
import { canAutosaveAttempt, canModifyAttempt, withinSubmitDeadline } from '@/lib/timing';
import type { ExecutionOutcome } from '@/lib/outcome';
import { gradeAttempt, pendingOutcome, storedOutcome } from '@/server/grading/grade-attempt';
import { marksToNumber } from '@/server/grading/marks';
import { pinnedSnapshot } from './questions';
import { currentSession, getExamTimeState, type ExamTimeState } from './sessions';
import { recordAudit } from './audit';
import { scanRedFlags, extractTestCasesFromSnapshot } from '@/lib/static-analysis';

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

  // If questions were edited while exam was in progress, sync attempts on reload
  for (const eq of examQuestions) {
    const attempt = byQuestion.get(eq.questionId);
    if (attempt && eq.snapshot) {
      const snap = eq.snapshot as Record<string, unknown>;
      const version = typeof snap.version === 'number' ? snap.version : (eq.questionVersion ?? 1);
      if (attempt.questionVersion !== version) {
        await prisma.attempt.update({
          where: { id: attempt.id },
          data: {
            snapshot: eq.snapshot as Prisma.InputJsonValue,
            questionVersion: version,
          },
        });
        attempt.snapshot = eq.snapshot;
        attempt.questionVersion = version;
      }
    }
  }

  return examQuestions.flatMap((eq) => {
    const attempt = byQuestion.get(eq.questionId);
    return attempt ? [{ order: eq.order, attempt }] : [];
  });
}

/**
 * A submitted question stays open for editing and resubmission until its
 * sitting ends (timer, End Test, violation limit, revoked access). Only the
 * student's own submit leaves an attempt SUBMITTED inside an open sitting.
 */
function openForResubmission(attempt: Attempt, state: ExamTimeState): boolean {
  return attempt.status === 'SUBMITTED' && state.session?.id === attempt.sessionId && !state.session.endedAt;
}

/**
 * Guard shared by autosave / run. `allowGrace` (autosave only) accepts the
 * final flush that races the deadline, mirroring the submit grace window.
 */
async function assertAttemptWritable(attempt: Attempt, exam: Exam, allowGrace = false): Promise<void> {
  const state = await getExamTimeState(exam.id, attempt.userId, exam);
  // A resubmittable attempt follows the same time rules as one never submitted.
  const status = openForResubmission(attempt, state) ? 'IN_PROGRESS' : attempt.status;
  const writable = allowGrace
    ? canAutosaveAttempt(state.availability, status, state.expiresAt)
    : canModifyAttempt(state.availability, status);
  if (!writable) {
    if (status !== 'IN_PROGRESS') throw conflict('This attempt has already been submitted.');
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
    // Never into a closed sitting, whatever a stale tab sends.
    where: {
      id: attemptId,
      userId,
      status: { in: ['IN_PROGRESS', 'SUBMITTED'] },
      session: { endedAt: null },
    },
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
  flags?: unknown,
): Promise<boolean> {
  const claimed = await prisma.attempt.updateMany({
    where: { id: attemptId, status: 'IN_PROGRESS' },
    data: {
      status,
      submittedAt: new Date(),
      gradedAt: null,
      ...(code ? { html: code.html, css: code.css, js: code.js } : {}),
      ...(flags !== undefined ? { flags: flags as Prisma.InputJsonValue } : {}),
    },
  });
  return claimed.count === 1;
}

export type SubmitResult = ExecutionOutcome & {
  alreadySubmitted: boolean;
  /** True when the submission is recorded but grading is deferred. */
  gradingPending: boolean;
  gradingError?: string;
  /** The question's counted score: the best of its graded submissions (null while none is graded). */
  bestScore: number | null;
};

/** Refuse a submit the sitting can no longer accept (same rules for first and later submits). */
function assertAcceptingSubmissions(state: ExamTimeState): void {
  if (state.availability === 'SUBMITTED' || state.availability === 'UNPUBLISHED') {
    throw conflict('This test is no longer accepting submissions.');
  }
  if (state.availability === 'ENDED') {
    throw forbidden('This test has closed. Submissions are no longer accepted.');
  }
  if (state.expiresAt && !withinSubmitDeadline(state.expiresAt)) {
    throw forbidden('Your time for this test has expired.');
  }
}

/**
 * Submit one question: deadline-checked, ownership-checked. While the sitting
 * is open a question can be submitted again and again: every submission is
 * graded, and the best score counts. After the sitting ends, a submit returns
 * the stored grading rather than re-scoring.
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

  const state =
    attempt.status === 'IN_PROGRESS' || attempt.status === 'SUBMITTED'
      ? await getExamTimeState(attempt.examId, params.userId, attempt.exam)
      : null;

  if (state && openForResubmission(attempt, state)) {
    assertAcceptingSubmissions(state);
    const code = params.code ?? { html: attempt.html, css: attempt.css, js: attempt.js };
    const testCases = extractTestCasesFromSnapshot(attempt.snapshot);
    const flags = scanRedFlags(code.js, { testCases });
    await prisma.attempt.updateMany({
      where: { id: attempt.id, status: 'SUBMITTED', session: { endedAt: null } },
      data: { ...code, submittedAt: new Date(), flags: flags as unknown as Prisma.InputJsonValue },
    });
    const graded = await gradeAttempt(attempt.id, { reason: 'resubmission', keepBest: true });
    if (graded.busy) {
      throw conflict(
        'Your previous submission of this question is still being graded. Try again in a moment.',
      );
    }
    const fresh = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    const bestScore = fresh.gradedAt ? marksToNumber(fresh.score) : null;
    await recordAudit({
      userId: params.userId,
      action: 'attempt.resubmitted',
      entity: 'Attempt',
      entityId: attempt.id,
      metadata: graded.outcome
        ? {
            score: graded.outcome.score,
            maxScore: graded.outcome.maxScore,
            bestScore,
            counted: Boolean(graded.counted),
            flagsCount: flags.length,
          }
        : { gradingPending: true, flagsCount: flags.length },
    });
    if (graded.outcome) {
      return { ...graded.outcome, alreadySubmitted: false, gradingPending: false, bestScore };
    }
    return {
      ...pendingOutcome(attempt),
      alreadySubmitted: false,
      gradingPending: true,
      gradingError: graded.error,
      bestScore,
    };
  }

  if (state && attempt.status === 'IN_PROGRESS') {
    assertAcceptingSubmissions(state);

    const code = params.code ?? { html: attempt.html, css: attempt.css, js: attempt.js };
    const testCases = extractTestCasesFromSnapshot(attempt.snapshot);
    const flags = scanRedFlags(code.js, { testCases });
    if (await claimAttempt(attempt.id, 'SUBMITTED', code, flags)) {
      const graded = await gradeAttempt(attempt.id);
      await recordAudit({
        userId: params.userId,
        action: 'attempt.submitted',
        entity: 'Attempt',
        entityId: attempt.id,
        metadata: graded.outcome
          ? { score: graded.outcome.score, maxScore: graded.outcome.maxScore, flagsCount: flags.length }
          : { gradingPending: true, flagsCount: flags.length },
      });
      // The sitting stays open: it ends only when time runs out or the student ends the test.
      const bestScore = graded.outcome ? graded.outcome.score : null;
      if (graded.outcome) {
        return { ...graded.outcome, alreadySubmitted: false, gradingPending: false, bestScore };
      }
      return {
        ...pendingOutcome(attempt),
        alreadySubmitted: false,
        gradingPending: true,
        gradingError: graded.error,
        bestScore,
      };
    }
    // Lost the claim to a concurrent submit / finalisation: fall through and
    // report whatever that caller stored.
  }

  const fresh = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
  if (!fresh.gradedAt) {
    return { ...pendingOutcome(fresh), alreadySubmitted: true, gradingPending: true, bestScore: null };
  }
  const stored = await prisma.testResult.findMany({
    where: { attemptId: attempt.id, final: true },
    orderBy: { createdAt: 'asc' },
  });
  return {
    ...storedOutcome(fresh, stored),
    alreadySubmitted: true,
    gradingPending: false,
    bestScore: marksToNumber(fresh.score),
  };
}
