import type { Attempt, QuestionResultStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AppError, conflict, notFound } from '@/lib/errors';
import { logger, sanitizeError } from '@/lib/logger';
import type { ExecutionOutcome, QuestionStatus } from '@/lib/outcome';
import { recordAudit } from '@/server/services/audit';
import { executeTests } from './run-tests';
import { marksToNumber, type DecimalLike } from './marks';
import { refreshSittingTotals } from './sitting-totals';

/** How long one grader may hold an attempt. Longer than any run (40 tests x runner limit). */
const LEASE_MS = 10 * 60_000;

export interface GradeResult {
  graded: boolean;
  /** Another grader holds this attempt right now; nothing was done. */
  busy?: boolean;
  outcome?: ExecutionOutcome;
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
  opts: { reason?: string; triggeredById?: string } = {},
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
    });
    return { graded: true, outcome };
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
