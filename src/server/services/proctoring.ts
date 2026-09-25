import { prisma } from '@/lib/prisma';
import {
  dedupeFamily,
  isViolation,
  shouldRecordEvent,
  violationMessage,
  type ProctorEventType,
} from '@/lib/proctor';
import { logger } from '@/lib/logger';
import { notFound } from '@/lib/errors';
import { currentSession } from './sessions';

export interface RecordEventResult {
  recorded: boolean;
  violationCount: number;
  message: string | null;
  reason?: string;
  /** The sitting was already closed; nothing was recorded. */
  sittingClosed?: boolean;
}

/**
 * Persist a proctoring event.
 *
 * The violation count returned to the client is ALWAYS recomputed from the
 * database (product requirement #22), and duplicate blur/visibilitychange pairs
 * collapse into one violation (product requirement #21).
 *
 * The dedupe read, the insert and the recount run under a per-sitting
 * transaction-scoped advisory lock, so events for the same student + exam
 * that arrive concurrently are decided one at a time and cannot both slip
 * past the dedupe window or race the violation limit.
 */
export async function recordProctorEvent(params: {
  userId: string;
  examId: string;
  attemptId?: string | null;
  type: ProctorEventType;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}): Promise<RecordEventResult> {
  // Stamp the event when it ARRIVES, not when it wins the lock: waiting
  // behind a concurrent event must not push it outside the dedupe window.
  const arrivedAt = new Date();

  if (params.attemptId) {
    const owned = await prisma.attempt.findFirst({
      where: { id: params.attemptId, userId: params.userId, examId: params.examId },
      select: { id: true },
    });
    if (!owned) throw notFound('Attempt not found.');
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`proctor:${params.userId}:${params.examId}`}))`;

      // Events belong to the current sitting; violation limits are per sitting.
      const session = await currentSession(params.examId, params.userId, tx);
      const sessionId = session?.id ?? null;
      if (session?.endedAt) {
        // Events after the sitting closed (a late blur while the "submitted"
        // screen shows) must not count against the student.
        const violationCount = await tx.proctorEvent.count({
          where: { sessionId: session.id, violation: true },
        });
        return { recorded: false, violationCount, message: null, sittingClosed: true };
      }

      const family = dedupeFamily(params.type);
      const last = await tx.proctorEvent.findFirst({
        where: { userId: params.userId, examId: params.examId, sessionId, type: { in: family as never[] } },
        orderBy: { occurredAt: 'desc' },
        select: { type: true, occurredAt: true },
      });
      // Two requests fired together can be processed in either order; keep the
      // stored timeline monotonic so the later-processed one dedupes.
      const now = last && last.occurredAt > arrivedAt ? last.occurredAt : arrivedAt;

      const decision = shouldRecordEvent(
        { type: params.type, occurredAt: now },
        last ? { type: last.type as ProctorEventType, occurredAt: last.occurredAt } : null,
      );

      if (decision.accept) {
        await tx.proctorEvent.create({
          data: {
            userId: params.userId,
            examId: params.examId,
            sessionId,
            attemptId: params.attemptId ?? null,
            type: params.type,
            occurredAt: now,
            durationMs: params.durationMs ?? null,
            violation: isViolation(params.type),
            metadata: params.metadata ? (params.metadata as object) : undefined,
          },
        });
        if (session && isViolation(params.type)) {
          await tx.examSession.update({
            where: { id: session.id },
            data: { violationCount: { increment: 1 } },
          });
        }
        if (session && (params.type === 'TAB_HIDDEN' || params.type === 'WINDOW_BLUR')) {
          await tx.examSession.updateMany({
            where: { id: session.id, endedAt: null },
            data: { status: 'AWAY' },
          });
        }
        if (session && params.type === 'WINDOW_FOCUS') {
          await tx.examSession.updateMany({
            where: { id: session.id, endedAt: null, status: 'AWAY' },
            data: { status: 'ACTIVE' },
          });
        }
      } else {
        logger.debug('proctor.deduped', { type: params.type, reason: decision.reason });
      }

      // Violations only count inside a sitting; an event with none is kept for
      // the timeline but counts towards no limit (and never towards anyone else's).
      const violationCount = session
        ? await tx.proctorEvent.count({ where: { sessionId: session.id, violation: true } })
        : 0;
      return {
        recorded: decision.accept,
        violationCount,
        message: isViolation(params.type) ? violationMessage(params.type) : null,
        ...(decision.reason ? { reason: decision.reason } : {}),
      };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

/** Violations recorded in the student's current sitting (limits apply per sitting). */
export async function countViolations(userId: string, examId: string): Promise<number> {
  const session = await currentSession(examId, userId);
  return session ? countSessionViolations(session.id) : 0;
}

export function countSessionViolations(sessionId: string): Promise<number> {
  return prisma.proctorEvent.count({ where: { sessionId, violation: true } });
}

/** A student's proctoring events in a test, newest first; optionally one sitting only. */
export async function eventTimeline(
  userId: string,
  examId: string,
  opts: { sessionId?: string; limit?: number } = {},
) {
  const limit = opts.limit ?? 200;
  return prisma.proctorEvent.findMany({
    where: { userId, examId, ...(opts.sessionId ? { sessionId: opts.sessionId } : {}) },
    orderBy: { occurredAt: 'desc' },
    take: Math.min(limit, 500),
    select: { id: true, type: true, occurredAt: true, durationMs: true, violation: true, metadata: true },
  });
}
