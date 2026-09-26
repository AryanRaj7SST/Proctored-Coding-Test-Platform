import type { Exam } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isClipboardExempt, type ProctorEventType } from '@/lib/proctor';
import type { SessionUser } from '@/lib/authz';
import { ensureAttempts } from './attempts';
import { studentQuestionOf } from './questions';
import { marksToNumber } from '@/server/grading/marks';
import {
  currentSession,
  getExamTimeState,
  hasOpenTestAccess,
  heartbeat,
  sittingOverdue,
  startExamSession,
} from './sessions';
import { countSessionViolations, countViolations, recordProctorEvent } from './proctoring';
import { enforceViolationLimit, finalizeExpiredAttempts, sittingEndReason } from './finalization';
import { recordAudit } from './audit';

/**
 * The student's sitting, as the exam workspace sees it: open (or resume) it,
 * keep it alive, and report proctoring events. Every decision -- deadline,
 * availability, violation count, finalisation -- is made here from the
 * database, never from anything the browser sends.
 */

/** Finalise a sitting whose deadline has silently passed (closed laptop, exam closed since). */
async function finalizeIfOverdue(exam: Exam, userId: string): Promise<void> {
  const state = await getExamTimeState(exam.id, userId, exam);
  if (
    state.session &&
    (await sittingOverdue(
      exam,
      {
        startedAt: state.session.startedAt,
        expiresAt: state.session.expiresAt,
        endedAt: state.session.endedAt,
      },
      userId,
    ))
  ) {
    await finalizeExpiredAttempts(exam.id, userId);
  }
}

/**
 * Start (or resume) a sitting and return everything the workspace needs.
 * Question content comes from each attempt's frozen snapshot, so what the
 * student reads is exactly what grades them.
 */
export async function openWorkspace(
  exam: Exam,
  user: SessionUser,
  meta: { userAgent: string | null; ip: string | null },
) {
  // An overdue sitting is finalised first, so the student gets the "expired"
  // message rather than a resumed sitting; one that already hit the violation
  // limit must not be resumable.
  await finalizeIfOverdue(exam, user.id);
  await enforceViolationLimit(exam, user.id);

  const before = await currentSession(exam.id, user.id);
  const session = await startExamSession(exam, user.id, meta.userAgent);
  const resumed = before?.id === session.id;
  const opened = await ensureAttempts(session);

  const [state, assignment, violationCount] = await Promise.all([
    getExamTimeState(exam.id, user.id, exam),
    prisma.examAssignment.findUnique({
      where: { examId_userId: { examId: exam.id, userId: user.id } },
      select: { allowClipboard: true },
    }),
    countViolations(user.id, exam.id),
  ]);

  await recordAudit({
    userId: user.id,
    // A reload or reconnect resumes the same sitting; only a new sitting is a start.
    action: resumed ? 'exam.resumed' : 'exam.started',
    entity: 'Exam',
    entityId: exam.id,
    metadata: { attemptNumber: session.attemptNumber },
    ip: meta.ip,
  });

  const allowClipboard = hasOpenTestAccess(user) || (assignment?.allowClipboard ?? false);

  return {
    user: { id: user.id, email: user.email, role: user.role },
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      durationMinutes: exam.durationMinutes,
      maxViolations: exam.maxViolations,
    },
    session: {
      startedAt: session.startedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      msRemaining: state.msRemaining,
      serverTime: state.serverTime.toISOString(),
      availability: state.availability,
    },
    violationCount,
    // Accommodations come from the student's assignment, set by an admin.
    // Users with open test access (admins and designated staff) are always
    // allowed to copy and paste.
    accommodations: { allowClipboard },
    questions: opened.map(({ order, attempt }) => {
      const graded = attempt.status !== 'IN_PROGRESS' && attempt.gradedAt !== null;
      return {
        order,
        points: marksToNumber(attempt.maxScore),
        // From the frozen snapshot: what the student reads is what grades them.
        question: studentQuestionOf(attempt),
        attempt: {
          id: attempt.id,
          html: attempt.html,
          css: attempt.css,
          js: attempt.js,
          status: attempt.status,
          score: graded ? marksToNumber(attempt.score) : null,
          resultStatus: graded ? attempt.resultStatus : null,
          gradingPending: attempt.status !== 'IN_PROGRESS' && !attempt.gradedAt,
          maxScore: marksToNumber(attempt.maxScore),
          updatedAt: attempt.updatedAt.toISOString(),
        },
      };
    }),
  };
}

/**
 * Liveness ping from the workspace (every HEARTBEAT_INTERVAL_SECONDS), also
 * sent when its countdown reaches zero. A sitting that has run out is
 * finalised here, so the deadline holds even if the page's clock was tampered
 * with or the tab was closed and reopened.
 */
export async function processHeartbeat(exam: Exam, userId: string) {
  const beat = await heartbeat(exam.id, userId);
  if (beat.status !== 'NONE') {
    const session = await currentSession(exam.id, userId);
    if (await sittingOverdue(exam, session, userId)) {
      await finalizeExpiredAttempts(exam.id, userId);
    } else {
      // Violations can also arrive without a proctor-event call (e.g. the
      // stale-session sweep records HEARTBEAT_LOST), so check here too.
      await enforceViolationLimit(exam, userId);
    }
  }

  const session = await currentSession(exam.id, userId);
  const [gradingPending, violationCount] = await Promise.all([
    session
      ? prisma.attempt.count({
          where: { sessionId: session.id, status: { not: 'IN_PROGRESS' }, gradedAt: null },
        })
      : 0,
    session ? countSessionViolations(session.id) : 0,
  ]);
  const finalized = Boolean(session?.endedAt);

  return {
    status: session?.status ?? beat.status,
    msRemaining: beat.msRemaining,
    expired: beat.status !== 'NONE' && beat.msRemaining <= 0,
    finalized,
    endReason: finalized ? await sittingEndReason(exam.id, userId) : null,
    gradingPending,
    serverTime: new Date().toISOString(),
    violationCount,
  };
}

/**
 * Record a browser proctoring event. The violation count is recomputed from
 * the database, so refreshing the page cannot reset it; reaching
 * Exam.maxViolations closes the sitting and grades its open attempts.
 */
export async function reportProctorEvent(
  exam: Exam,
  user: SessionUser,
  event: {
    type: ProctorEventType;
    attemptId: string | null;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  },
) {
  // Clipboard accommodation: an explicit, admin-set flag on THIS student's
  // assignment. Users with open test access (admins and designated staff) are
  // always exempt from clipboard blocking.
  const allowClipboard =
    hasOpenTestAccess(user) ||
    ((
      await prisma.examAssignment.findUnique({
        where: { examId_userId: { examId: exam.id, userId: user.id } },
        select: { allowClipboard: true },
      })
    )?.allowClipboard ??
      false);

  if (isClipboardExempt(event.type, { allowClipboard })) {
    return {
      recorded: false,
      violationCount: await countViolations(user.id, exam.id),
      message: null,
      terminated: false,
    };
  }

  const result = await recordProctorEvent({
    userId: user.id,
    examId: exam.id,
    attemptId: event.attemptId,
    type: event.type,
    durationMs: event.durationMs,
    metadata: event.metadata,
  });

  const terminated = result.sittingClosed ? false : await enforceViolationLimit(exam, user.id);

  return {
    recorded: result.recorded,
    violationCount: result.violationCount,
    message: result.message,
    // True when this event (or an earlier one) closed the sitting.
    terminated: terminated || Boolean(result.sittingClosed),
  };
}
