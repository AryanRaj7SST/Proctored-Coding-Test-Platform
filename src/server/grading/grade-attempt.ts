import { Prisma, type Attempt, type QuestionResultStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AppError, conflict, notFound } from '@/lib/errors';
import { logger, sanitizeError } from '@/lib/logger';
import type { ExecutionOutcome, QuestionStatus } from '@/lib/outcome';
import { recordAudit } from '@/server/services/audit';
import { buildSnapshot } from '@/server/services/questions';
import { executeTests } from './run-tests';
import { fromMicro, marksToNumber, toMicro, type DecimalLike } from './marks';
import { refreshSittingTotals } from './sitting-totals';

/** How long one grader may hold an attempt. Longer than any run (40 tests x runner limit). */
const LEASE_MS = 10 * 60_000;

export interface GradeResult {
  graded: boolean;
  /** Another grader holds this attempt right now; nothing was done. */
  busy?: boolean;
  outcome?: ExecutionOutcome;
  /** This run became the attempt's counted result (always, unless `keepBest` kept a better one). */
  counted?: boolean;
  /** Student-safe reason grading did not happen. */
  error?: string;
}

/** Take the attempt's grading lease; false when another grader holds it. */
async function acquireLease(attemptId: string): Promise<boolean> {
  const now = new Date();
  const { count } = await prisma.attempt.updateMany({
    where: {
      id: attemptId,
      status: { not: 'IN_PROGRESS' },
      OR: [{ gradingLeaseUntil: null }, { gradingLeaseUntil: { lt: now } }],
    },
    data: { gradingLeaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  return count === 1;
}

async function releaseLease(attemptId: string): Promise<void> {
  await prisma.attempt.updateMany({ where: { id: attemptId }, data: { gradingLeaseUntil: null } });
}

/**
 * Grade a claimed (non-IN_PROGRESS) attempt from its stored code. Never throws
 * for runner failures: they leave the attempt "grading pending". Concurrent
 * calls for one attempt are refused (busy) rather than run twice.
 */
export async function gradeAttempt(
  attemptId: string,
  opts: { reason?: string; triggeredById?: string; keepBest?: boolean } = {},
): Promise<GradeResult> {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return { graded: false, error: 'Attempt not found.' };
  if (attempt.status === 'IN_PROGRESS') return { graded: false, error: 'Attempt has not been submitted.' };
  if (!(await acquireLease(attemptId))) {
    return { graded: false, busy: true, error: 'This attempt is already being graded.' };
  }

  try {
    const claimed = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    const outcome = await executeTests({
      attempt: claimed,
      code: { html: claimed.html, css: claimed.css, js: claimed.js },
      kind: 'SUBMISSION',
      final: true,
      userId: claimed.userId,
      reason: opts.reason ?? 'submission',
      triggeredById: opts.triggeredById,
      keepBest: opts.keepBest,
    });
    const { counted, ...rest } = outcome;
    return { graded: true, outcome: rest, counted };
  } catch (err) {
    logger.warn('grading.deferred', { attemptId, error: sanitizeError(err) });
    await recordAudit({
      userId: attempt.userId,
      action: 'attempt.grading_failed',
      entity: 'Attempt',
      entityId: attempt.id,
      metadata: { code: err instanceof AppError ? err.code : 'INTERNAL_ERROR' },
    });
    return {
      graded: false,
      error: err instanceof AppError ? err.message : 'Test execution failed. Please try again.',
    };
  } finally {
    await releaseLease(attemptId);
    await refreshSittingTotals(attempt.sessionId);
  }
}

/** A stored grading as an outcome, e.g. for a repeated submit. */
export function storedOutcome(
  attempt: Pick<Attempt, 'score' | 'maxScore' | 'resultStatus'>,
  stored: {
    testName: string;
    passed: boolean;
    points: DecimalLike;
    pointsAwarded: DecimalLike;
    message: string | null;
    expected: string | null;
    actual: string | null;
    durationMs: number;
  }[],
): ExecutionOutcome {
  const score = marksToNumber(attempt.score);
  const maxScore = marksToNumber(attempt.maxScore);
  const passedCount = stored.filter((r) => r.passed).length;
  return {
    runId: '',
    status: 'COMPLETED',
    questionStatus: gradedStatus(attempt.resultStatus),
    results: stored.map((r) => ({
      testName: r.testName,
      passed: r.passed,
      points: marksToNumber(r.points),
      pointsAwarded: marksToNumber(r.pointsAwarded),
      message: r.message ?? undefined,
      expected: r.expected ?? undefined,
      actual: r.actual ?? undefined,
      durationMs: r.durationMs,
    })),
    score,
    maxScore,
    percentage: maxScore ? Math.round((score / maxScore) * 10_000) / 100 : 0,
    passedCount,
    failedCount: stored.length - passedCount,
    totalCount: stored.length,
    durationMs: 0,
  };
}

function gradedStatus(status: QuestionResultStatus): QuestionStatus | null {
  return status === 'PASSED' || status === 'PARTIAL' || status === 'FAILED' ? status : null;
}

/** The outcome shape for an attempt whose grading is pending: no score, never a 0. */
export function pendingOutcome(attempt: Pick<Attempt, 'maxScore'>): ExecutionOutcome {
  return {
    runId: '',
    status: 'FAILED',
    questionStatus: null,
    results: [],
    score: 0,
    maxScore: marksToNumber(attempt.maxScore),
    percentage: 0,
    passedCount: 0,
    failedCount: 0,
    totalCount: 0,
    durationMs: 0,
  };
}

/**
 * Recovery after a runner outage: grade attempts whose grading was deferred.
 * Only never-graded attempts are touched, so a completed grade is never
 * overwritten from here.
 */
export async function regradePendingAttempts(filter: {
  attemptId?: string;
  examId?: string;
  limit?: number;
}) {
  const pending = await prisma.attempt.findMany({
    where: {
      status: { not: 'IN_PROGRESS' },
      gradedAt: null,
      ...(filter.attemptId ? { id: filter.attemptId } : {}),
      ...(filter.examId ? { examId: filter.examId } : {}),
    },
    select: { id: true },
    orderBy: { submittedAt: 'asc' },
    take: Math.min(filter.limit ?? 50, 200),
  });
  let graded = 0;
  let failed = 0;
  let lastError: string | undefined;
  for (const a of pending) {
    const result = await gradeAttempt(a.id, { reason: 'retry pending grading' });
    if (result.graded) graded += 1;
    else {
      failed += 1;
      lastError = result.error;
    }
  }
  return { attempted: pending.length, graded, failed, error: lastError };
}

export interface RegradeResult {
  attemptId: string;
  /** True when nothing was run because a regrade could not change the grade. */
  skipped: boolean;
  graded: boolean;
  busy?: boolean;
  before: { score: number | null; status: QuestionResultStatus };
  after: { score: number | null; status: QuestionResultStatus };
  error?: string;
}

/**
 * Administrator regrade of one submitted attempt, against the attempt's own
 * frozen snapshot. An attempt that already earned full marks is skipped (a
 * regrade cannot improve it) unless `force` is set. Always audited.
 */
export async function regradeAttempt(
  attemptId: string,
  opts: { adminId: string; reason: string; force?: boolean },
): Promise<RegradeResult> {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw notFound('Attempt not found.');
  if (attempt.status === 'IN_PROGRESS') throw conflict('This attempt has not been submitted yet.');

  const before = {
    score: attempt.gradedAt ? marksToNumber(attempt.score) : null,
    status: attempt.resultStatus,
  };
  if (attempt.gradedAt && attempt.resultStatus === 'PASSED' && !opts.force) {
    return { attemptId, skipped: true, graded: false, before, after: before };
  }

  const result = await gradeAttempt(attemptId, {
    reason: `regrade: ${opts.reason}`,
    triggeredById: opts.adminId,
  });
  const fresh = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
  const after = { score: fresh.gradedAt ? marksToNumber(fresh.score) : null, status: fresh.resultStatus };

  await recordAudit({
    userId: opts.adminId,
    action: 'attempt.regraded',
    entity: 'Attempt',
    entityId: attemptId,
    metadata: { reason: opts.reason, force: Boolean(opts.force), graded: result.graded, before, after },
  });
  return {
    attemptId,
    skipped: false,
    graded: result.graded,
    busy: result.busy,
    before,
    after,
    error: result.error,
  };
}

/**
 * Regrade the submitted attempts of one test (administrator action).
 *   pending    never graded (runner outage)
 *   incomplete pending, or graded below full marks (PARTIAL / FAILED)
 *   all        every submitted attempt (full-mark ones only with `force`)
 * Each attempt goes through regradeAttempt: its own snapshot, audited, and
 * refused while another grading holds it. Capped per call: pass the returned
 * `nextCursor` as `after` to continue with the next batch.
 */
export async function regradeExam(
  examId: string,
  opts: {
    adminId: string;
    reason: string;
    mode: 'pending' | 'incomplete' | 'all';
    force?: boolean;
    limit?: number;
    after?: string;
  },
) {
  const where =
    opts.mode === 'pending'
      ? { gradedAt: null }
      : opts.mode === 'incomplete'
        ? {
            OR: [
              { gradedAt: null },
              { resultStatus: { in: ['PARTIAL', 'FAILED'] as QuestionResultStatus[] } },
            ],
          }
        : // Full-mark answers cannot improve; only a forced run re-checks them.
          opts.force
          ? {}
          : { resultStatus: { not: 'PASSED' as QuestionResultStatus } };
  const limit = Math.min(opts.limit ?? 100, 200);
  const candidates = await prisma.attempt.findMany({
    where: {
      examId,
      status: { not: 'IN_PROGRESS' },
      ...where,
      ...(opts.after ? { id: { gt: opts.after } } : {}),
    },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: limit,
  });

  const summary = {
    attempted: candidates.length,
    graded: 0,
    skipped: 0,
    failed: 0,
    busy: 0,
    nextCursor: candidates.length === limit ? candidates[candidates.length - 1]!.id : null,
  };
  for (const { id } of candidates) {
    const result = await regradeAttempt(id, {
      adminId: opts.adminId,
      reason: opts.reason,
      force: opts.force,
    });
    if (result.skipped) summary.skipped += 1;
    else if (result.graded) summary.graded += 1;
    else if (result.busy) summary.busy += 1;
    else summary.failed += 1;
  }
  return summary;
}

export interface QuestionAttemptDiff {
  attemptId: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  oldScore: number;
  newScore: number;
  scoreDelta: number;
  oldStatus: QuestionResultStatus;
  newStatus: QuestionResultStatus;
  changed: boolean;
  graded: boolean;
  error?: string;
}

export interface RegradeQuestionSummary {
  questionId: string;
  totalAttempts: number;
  regradedCount: number;
  changedCount: number;
  unchangedCount: number;
  failedCount: number;
  changes: QuestionAttemptDiff[];
}

/**
 * Regrade every submitted attempt for a question against its CURRENT (newly published) test suite.
 * Records score history in `AttemptScoreHistory` before updating and writes an audit log entry.
 */
export async function regradeAttemptsForQuestion(
  questionId: string,
  opts: {
    includeGraded?: boolean;
    adminId?: string;
    reason?: string;
  } = {},
): Promise<RegradeQuestionSummary> {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { tests: { orderBy: { order: 'asc' } } },
  });
  if (!question) throw notFound('Question not found.');

  const newSnapshot = buildSnapshot(question);

  // Update exam questions that link to this question so their pinned snapshot matches the newly published version
  await prisma.examQuestion.updateMany({
    where: { questionId },
    data: {
      snapshot: newSnapshot as unknown as Prisma.InputJsonValue,
      questionVersion: question.version,
      pinnedAt: new Date(),
    },
  });

  const attempts = await prisma.attempt.findMany({
    where: {
      questionId,
      status: { not: 'IN_PROGRESS' },
      ...(opts.includeGraded ? {} : { gradedAt: null }),
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
    orderBy: { submittedAt: 'asc' },
  });

  let regradedCount = 0;
  let changedCount = 0;
  let unchangedCount = 0;
  let failedCount = 0;
  const changes: QuestionAttemptDiff[] = [];

  for (const attempt of attempts) {
    const oldScore = attempt.gradedAt ? marksToNumber(attempt.score) : 0;
    const oldStatus = attempt.resultStatus;

    // Update attempt snapshot & version to the current published question suite before grading
    await prisma.attempt.update({
      where: { id: attempt.id },
      data: {
        snapshot: newSnapshot as unknown as Prisma.InputJsonValue,
        questionVersion: question.version,
      },
    });

    // Collect all candidate code submissions from historical test runs and current attempt
    const codeCandidates: { html: string; css: string; js: string }[] = [];
    const seen = new Set<string>();

    const pushCode = (codeObj: unknown) => {
      if (!codeObj || typeof codeObj !== 'object') return;
      const c = codeObj as { html?: unknown; css?: unknown; js?: unknown };
      const html = typeof c.html === 'string' ? c.html : '';
      const css = typeof c.css === 'string' ? c.css : '';
      const js = typeof c.js === 'string' ? c.js : '';
      const key = `${html}___${css}___${js}`;
      if (!seen.has(key)) {
        seen.add(key);
        codeCandidates.push({ html, css, js });
      }
    };

    if (attempt.html || attempt.css || attempt.js) {
      pushCode({ html: attempt.html, css: attempt.css, js: attempt.js });
    }

    const testRuns = await prisma.testRun.findMany({
      where: { attemptId: attempt.id, code: { not: Prisma.DbNull } },
      orderBy: { startedAt: 'asc' },
    });
    for (const tr of testRuns) {
      pushCode(tr.code);
    }

    let gradeRes: GradeResult;
    if (codeCandidates.length > 1) {
      // Re-evaluate every historical submission and select the highest score
      let bestScoreMicro = -1;
      let bestCode = codeCandidates[0]!;
      let bestOutcome: (ExecutionOutcome & { counted: boolean }) | null = null;
      let anyGraded = false;
      let lastError: string | undefined;

      const updatedAttempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });

      for (const cand of codeCandidates) {
        try {
          const outcome = await executeTests({
            attempt: updatedAttempt,
            code: cand,
            kind: 'SUBMISSION',
            final: false,
            userId: attempt.userId,
            reason: opts.reason ?? 'republish regrade (candidate)',
            triggeredById: opts.adminId,
          });
          anyGraded = true;
          const scoreMicro = toMicro(outcome.score);
          if (scoreMicro > bestScoreMicro) {
            bestScoreMicro = scoreMicro;
            bestCode = cand;
            bestOutcome = outcome;
          }
        } catch (err) {
          lastError = err instanceof AppError ? err.message : 'Test execution failed.';
        }
      }

      if (bestOutcome) {
        // Mark the highest-scoring run as final and update attempt
        await prisma.$transaction(async (tx) => {
          await tx.testResult.updateMany({
            where: { attemptId: attempt.id, final: true },
            data: { final: false },
          });
          await tx.testResult.updateMany({
            where: { testRunId: bestOutcome!.runId },
            data: { final: true },
          });
          await tx.attempt.update({
            where: { id: attempt.id },
            data: {
              html: bestCode.html,
              css: bestCode.css,
              js: bestCode.js,
              score: fromMicro(toMicro(bestOutcome!.score)),
              maxScore: fromMicro(toMicro(bestOutcome!.maxScore)),
              resultStatus: bestOutcome!.questionStatus as QuestionResultStatus,
              passedCount: bestOutcome!.passedCount,
              enabledCount: bestOutcome!.totalCount,
              gradingError: null,
              gradedAt: new Date(),
            },
          });
        });
        await refreshSittingTotals(attempt.sessionId);
        gradeRes = { graded: true, counted: true, outcome: bestOutcome };
      } else {
        gradeRes = { graded: anyGraded, error: lastError ?? 'Grading failed' };
      }
    } else {
      gradeRes = await gradeAttempt(attempt.id, {
        reason: opts.reason ?? 'republish & regrade',
        triggeredById: opts.adminId,
      });
    }

    if (!gradeRes.graded) {
      failedCount += 1;
      changes.push({
        attemptId: attempt.id,
        userId: attempt.userId,
        userEmail: attempt.user.email,
        userName: attempt.user.name,
        oldScore,
        newScore: oldScore,
        scoreDelta: 0,
        oldStatus,
        newStatus: oldStatus,
        changed: false,
        graded: false,
        error: gradeRes.error ?? 'Grading failed',
      });
      continue;
    }

    regradedCount += 1;
    const fresh = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    const newScore = fresh.gradedAt ? marksToNumber(fresh.score) : 0;
    const newStatus = fresh.resultStatus;
    const scoreDelta = Math.round((newScore - oldScore) * 10000) / 10000;
    const changed = Math.abs(scoreDelta) > 0.0001 || oldStatus !== newStatus;

    if (changed) {
      changedCount += 1;
    } else {
      unchangedCount += 1;
    }

    // Record score history entry before finalizing (best-effort: never fails the regrade)
    try {
      await prisma.attemptScoreHistory.create({
        data: {
          attemptId: attempt.id,
          questionId,
          oldScore: fromMicro(toMicro(oldScore)),
          newScore: fromMicro(toMicro(newScore)),
          oldResultStatus: oldStatus,
          newResultStatus: newStatus,
          changedByAdminId: opts.adminId ?? null,
          reason: opts.reason ?? 'Save & Republish regrade',
        },
      });
    } catch (err) {
      logger.warn('attempt_score_history.create_failed', {
        attemptId: attempt.id,
        questionId,
        error: sanitizeError(err),
      });
    }

    changes.push({
      attemptId: attempt.id,
      userId: attempt.userId,
      userEmail: attempt.user.email,
      userName: attempt.user.name,
      oldScore,
      newScore,
      scoreDelta,
      oldStatus,
      newStatus,
      changed,
      graded: true,
    });
  }

  await recordAudit({
    userId: opts.adminId ?? null,
    action: 'question.republished_and_regraded',
    entity: 'Question',
    entityId: questionId,
    metadata: {
      reason: opts.reason ?? 'Save & Republish regrade',
      totalAttempts: attempts.length,
      regradedCount,
      changedCount,
      unchangedCount,
      failedCount,
    },
  });

  return {
    questionId,
    totalAttempts: attempts.length,
    regradedCount,
    changedCount,
    unchangedCount,
    failedCount,
    changes,
  };
}
