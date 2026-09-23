import { prisma } from '@/lib/prisma';
import {
  dedupeFamily,
  isViolation,
  shouldRecordEvent,
  violationMessage,
  type ProctorEventType,
} from '@/lib/proctor';
import { logger } from '@/lib/logger';

export interface RecordEventResult {
  recorded: boolean;
  violationCount: number;
  message: string | null;
  reason?: string;
}

/**
 * Persist a proctoring event.
 *
 * The violation count returned to the client is ALWAYS recomputed from the
 * database (product requirement #22), and duplicate blur/visibilitychange pairs
 * collapse into one violation (product requirement #21).
 */
export async function recordProctorEvent(params: {
  userId: string;
  examId: string;
  attemptId?: string | null;
  type: ProctorEventType;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}): Promise<RecordEventResult> {
  const now = new Date();
  const family = dedupeFamily(params.type);

  const last = await prisma.proctorEvent.findFirst({
    where: { userId: params.userId, examId: params.examId, type: { in: family as never[] } },
    orderBy: { occurredAt: 'desc' },
    select: { type: true, occurredAt: true },
  });

  const decision = shouldRecordEvent(
    { type: params.type, occurredAt: now },
    last ? { type: last.type as ProctorEventType, occurredAt: last.occurredAt } : null,
  );

  if (decision.accept) {
    await prisma.$transaction(async (tx) => {
      await tx.proctorEvent.create({
        data: {
          userId: params.userId,
          examId: params.examId,
          attemptId: params.attemptId ?? null,
          type: params.type,
          occurredAt: now,
          durationMs: params.durationMs ?? null,
          violation: isViolation(params.type),
          metadata: params.metadata ? (params.metadata as object) : undefined,
        },
      });
      if (isViolation(params.type)) {
        await tx.examSession.updateMany({
          where: { userId: params.userId, examId: params.examId },
          data: { violationCount: { increment: 1 } },
        });
      }
      if (params.type === 'TAB_HIDDEN' || params.type === 'WINDOW_BLUR') {
        await tx.examSession.updateMany({
          where: { userId: params.userId, examId: params.examId, endedAt: null },
          data: { status: 'AWAY' },
        });
      }
      if (params.type === 'WINDOW_FOCUS') {
        await tx.examSession.updateMany({
          where: { userId: params.userId, examId: params.examId, endedAt: null, status: 'AWAY' },
          data: { status: 'ACTIVE' },
        });
      }
    });
  } else {
    logger.debug('proctor.deduped', { type: params.type, reason: decision.reason });
  }

  const violationCount = await countViolations(params.userId, params.examId);
  return {
    recorded: decision.accept,
    violationCount,
    message: isViolation(params.type) ? violationMessage(params.type) : null,
    ...(decision.reason ? { reason: decision.reason } : {}),
  };
}

export async function countViolations(userId: string, examId: string): Promise<number> {
  return prisma.proctorEvent.count({ where: { userId, examId, violation: true } });
}

export async function eventTimeline(userId: string, examId: string, limit = 200) {
  return prisma.proctorEvent.findMany({
    where: { userId, examId },
    orderBy: { occurredAt: 'desc' },
    take: Math.min(limit, 500),
    select: { id: true, type: true, occurredAt: true, durationMs: true, violation: true, metadata: true },
  });
}
