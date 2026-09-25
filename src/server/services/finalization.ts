import { after } from 'next/server';
import type { Exam } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger, sanitizeError } from '@/lib/logger';
import { sittingNeedsFinalization } from '@/lib/timing';
import { gradeAttempt } from '@/server/grading/grade-attempt';
import { refreshSittingTotals } from '@/server/grading/sitting-totals';
import { claimAttempt } from './attempts';
import { currentSession, getExamTimeState } from './sessions';
import { countSessionViolations } from './proctoring';
import { recordAudit } from './audit';

/**
 * Closing a sitting and grading what it contains.
 *
 * One rule governs every path below: an attempt is CLAIMED before it is
 * graded (see claimAttempt), so exactly one caller wins even when a timer, a
 * heartbeat, a second tab and a violation event all race. If grading cannot
 * happen the attempt stays claimed with gradedAt = null: "grading pending".
 */

export type SittingEndReason =
  | 'STUDENT_ENDED'
  | 'EXPIRED'
  | 'EXAM_CLOSED'
  | 'VIOLATION_LIMIT'
  // An administrator revoked this student's access to the test mid-sitting.
  | 'ACCESS_REVOKED';

export interface FinalizeResult {
  /** Attempts this call moved out of IN_PROGRESS. */
  submittedCount: number;
  gradedCount: number;
  /** Claimed attempts not (yet) graded: runner failure, or grading still running. */
  pendingCount: number;
  /** True for the single call that actually closed the sitting. */
  closedSitting: boolean;
  /** Grading continues after the response (request context only). */
  gradingDeferred: boolean;
}

/**
 * Run work after the HTTP response when called inside a request, so closing a
 * sitting never holds a heartbeat open for the length of every graded run.
 * Outside a request (tests, scripts, sweeps from server components that
 * cannot defer) the work runs inline and has finished when this resolves.
 */
async function afterResponse(work: () => Promise<void>): Promise<'deferred' | 'done'> {
  const guarded = () =>
    work().catch((err) => logger.error('grading.background_failed', { error: sanitizeError(err) }));
  try {
    after(guarded);
    return 'deferred';
  } catch {
    await guarded();
    return 'done';
  }
}

/**
 * Close a sitting and grade every open attempt in it. Safe to call any number
 * of times, concurrently, from any trigger (timer expiry, heartbeat, End Test,
 * violation limit, admin sweep): the session close and each attempt claim are
 * conditional updates, so nothing is closed or graded twice.
 */
export async function finalizeSitting(
  examId: string,
  userId: string,
  reason: SittingEndReason,
): Promise<FinalizeResult> {
  const session = await currentSession(examId, userId);
  if (!session) {
    // Never opened: nothing to close or grade.
    await markAssignment(examId, userId, reason);
    return {
      submittedCount: 0,
      gradedCount: 0,
      pendingCount: 0,
      closedSitting: false,
      gradingDeferred: false,
    };
  }
  return finalizeSession(session, reason);
}

type SittingRef = { id: string; examId: string; userId: string };

async function markAssignment(examId: string, userId: string, reason: SittingEndReason): Promise<void> {
  const timedOut = reason === 'EXPIRED' || reason === 'EXAM_CLOSED';
  await prisma.examAssignment.updateMany({
    where: { examId, userId, status: { in: ['ASSIGNED', 'STARTED'] } },
    data: { status: timedOut ? 'EXPIRED' : 'SUBMITTED' },
  });
}

async function finalizeSession(session: SittingRef, reason: SittingEndReason): Promise<FinalizeResult> {
  const { examId, userId } = session;
  const now = new Date();
  const timedOut = reason === 'EXPIRED' || reason === 'EXAM_CLOSED';

  // Close the session first so the student is locked out immediately (no new
  // runs, saves or submits) while grading is in progress.
  const closed = await prisma.examSession.updateMany({
    where: { id: session.id, endedAt: null },
    data: { endedAt: now, status: timedOut ? 'EXPIRED' : 'SUBMITTED' },
  });

  const open = await prisma.attempt.findMany({
    where: { sessionId: session.id, status: 'IN_PROGRESS' },
    select: { id: true },
  });
  const status = reason === 'STUDENT_ENDED' ? 'SUBMITTED' : 'AUTO_SUBMITTED';
  const claimed: string[] = [];
  for (const a of open) {
    if (await claimAttempt(a.id, status)) claimed.push(a.id);
  }

  await markAssignment(examId, userId, reason);
  if (closed.count === 1) {
    await prisma.proctorEvent.create({
      data: {
        userId,
        examId,
        sessionId: session.id,
        type: 'EXAM_SUBMITTED',
        violation: false,
        metadata: { reason },
      },
    });
  }

  let gradedCount = 0;
  const gradeClaimed = async () => {
    for (const id of claimed) {
      const result = await gradeAttempt(id, {
        reason: reason === 'STUDENT_ENDED' ? 'submission' : 'auto-submit',
      });
      if (result.graded) gradedCount += 1;
    }
    await refreshSittingTotals(session.id);
    if (closed.count === 1) {
      await recordAudit({
        userId,
        action:
          reason === 'STUDENT_ENDED'
            ? 'exam.ended'
            : reason === 'VIOLATION_LIMIT'
              ? 'exam.terminated_violations'
              : 'exam.auto_submitted',
        entity: 'Exam',
        entityId: examId,
        metadata: { reason, submittedCount: claimed.length, gradedCount },
      });
    }
  };
  const mode = await afterResponse(gradeClaimed);

  return {
    submittedCount: claimed.length,
    gradedCount,
    pendingCount: claimed.length - gradedCount,
    closedSitting: closed.count === 1,
    gradingDeferred: mode === 'deferred',
  };
}

/** Why a sitting was closed, for student-facing messages. */
export async function sittingEndReason(examId: string, userId: string): Promise<SittingEndReason | null> {
  const event = await prisma.proctorEvent.findFirst({
    where: { examId, userId, type: 'EXAM_SUBMITTED' },
    orderBy: { occurredAt: 'desc' },
    select: { metadata: true },
  });
  const reason = (event?.metadata as { reason?: unknown } | null)?.reason;
  return typeof reason === 'string' ? (reason as SittingEndReason) : null;
}

/** Finalise a sitting whose server-side clock has run out (heartbeat, start, sweep). */
export async function finalizeExpiredAttempts(examId: string, userId: string): Promise<FinalizeResult> {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { status: true } });
  return finalizeSitting(examId, userId, exam?.status === 'ENDED' ? 'EXAM_CLOSED' : 'EXPIRED');
}

/**
 * "End Test" pressed by the student: submits and grades every open attempt
 * with its current (autosaved) code and closes the sitting. If the clock had
 * already run out, the sitting is recorded as expired instead.
 */
export async function endExam(examId: string, userId: string): Promise<FinalizeResult> {
  const state = await getExamTimeState(examId, userId);
  const reason: SittingEndReason =
    state.availability === 'EXPIRED'
      ? 'EXPIRED'
      : state.availability === 'ENDED'
        ? 'EXAM_CLOSED'
        : 'STUDENT_ENDED';
  const result = await finalizeSitting(examId, userId, reason);
  // Preserve the historical behaviour of End Test for an exam that was never
  // opened: the assignment is still marked as handed in.
  if (reason === 'STUDENT_ENDED') {
    await prisma.examAssignment.updateMany({ where: { examId, userId }, data: { status: 'SUBMITTED' } });
  }
  return result;
}

/**
 * Enforce Exam.maxViolations on the server. The count is recomputed from the
 * database, never taken from the browser. Reaching the limit (count >= max)
 * closes the sitting and auto-submits + grades every open attempt; the
 * student cannot resume. Returns true when the sitting is (now) closed for
 * this reason.
 */
export async function enforceViolationLimit(
  exam: Pick<Exam, 'id' | 'maxViolations'>,
  userId: string,
): Promise<boolean> {
  if (!exam.maxViolations || exam.maxViolations <= 0) return false;
  const session = await currentSession(exam.id, userId);
  if (!session || session.endedAt) return false;
  if ((await countSessionViolations(session.id)) < exam.maxViolations) return false;
  await finalizeSession(session, 'VIOLATION_LIMIT');
  return true;
}

let lastGlobalSweep = 0;
const GLOBAL_SWEEP_INTERVAL_MS = 30_000;

/**
 * Finalise sittings nobody is watching any more: the student closed the tab,
 * lost their session, or the exam closed around them. Also repairs attempts
 * left IN_PROGRESS inside an already-closed sitting (e.g. a crash mid-finalise).
 *
 * Scoped to one user it always runs (student dashboard); unscoped it is
 * throttled per process because it is called from admin page loads.
 */
export async function finalizeOverdueSittings(
  opts: { userId?: string; examId?: string; limit?: number; force?: boolean } = {},
): Promise<number> {
  // Global sweeps are throttled per process; the scheduled maintenance job forces one.
  if (!opts.userId && !opts.examId && !opts.force) {
    if (Date.now() - lastGlobalSweep < GLOBAL_SWEEP_INTERVAL_MS) return 0;
    lastGlobalSweep = Date.now();
  }
  const limit = opts.limit ?? 25;
  const now = new Date();

  const openSessions = await prisma.examSession.findMany({
    where: {
      endedAt: null,
      ...(opts.userId ? { userId: opts.userId } : {}),
      ...(opts.examId ? { examId: opts.examId } : {}),
    },
    include: { exam: { select: { status: true, startTime: true, endTime: true, durationMinutes: true } } },
    orderBy: { expiresAt: 'asc' },
    take: 500,
  });
  const overdue = openSessions.filter((s) => sittingNeedsFinalization(s.exam, s, now)).slice(0, limit);

  let finalised = 0;
  for (const s of overdue) {
    await finalizeSession(s, s.exam.status === 'ENDED' ? 'EXAM_CLOSED' : 'EXPIRED');
    finalised += 1;
  }

  // Attempts still IN_PROGRESS inside a sitting that is already closed.
  const orphans = await prisma.attempt.findMany({
    where: {
      status: 'IN_PROGRESS',
      session: { endedAt: { not: null } },
      ...(opts.userId ? { userId: opts.userId } : {}),
      ...(opts.examId ? { examId: opts.examId } : {}),
    },
    select: { session: { select: { id: true, examId: true, userId: true, status: true } } },
    distinct: ['sessionId'],
    take: Math.max(0, limit - finalised),
  });
  for (const { session } of orphans) {
    await finalizeSession(session, session.status === 'EXPIRED' ? 'EXPIRED' : 'STUDENT_ENDED');
    finalised += 1;
  }

  await retryStalledGrading({ userId: opts.userId, limit: 5 });
  return finalised;
}

/** Grading that never started (e.g. the process stopped mid-way) gets picked up after this long. */
const STALLED_AFTER_MS = 2 * 60_000;
/** A runner failure is retried automatically after this long; an admin can always regrade sooner. */
const RUNNER_RETRY_AFTER_MS = 5 * 60_000;

/**
 * Pick up submitted attempts whose grading stalled: never attempted (the work
 * after a response was lost) or failed on the runner a while ago. Attempts
 * held by a live grading lease are left alone.
 */
async function retryStalledGrading(opts: { userId?: string; limit: number }): Promise<void> {
  const now = Date.now();
  const stalled = await prisma.attempt.findMany({
    where: {
      status: { not: 'IN_PROGRESS' },
      gradedAt: null,
      OR: [{ gradingLeaseUntil: null }, { gradingLeaseUntil: { lt: new Date(now) } }],
      AND: [
        {
          OR: [
            { resultStatus: 'NOT_RUN', submittedAt: { lt: new Date(now - STALLED_AFTER_MS) } },
            { resultStatus: 'RUNNER_ERROR', updatedAt: { lt: new Date(now - RUNNER_RETRY_AFTER_MS) } },
          ],
        },
      ],
      ...(opts.userId ? { userId: opts.userId } : {}),
    },
    select: { id: true },
    orderBy: { submittedAt: 'asc' },
    take: opts.limit,
  });
  for (const a of stalled) await gradeAttempt(a.id, { reason: 'automatic retry' });
}
