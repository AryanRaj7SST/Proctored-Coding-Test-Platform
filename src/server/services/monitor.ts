import { prisma } from '@/lib/prisma';
import { cameraStateFromEvents, deriveSessionStatus } from '@/lib/proctor';
import { env } from '@/lib/env';
import { sittingRemainingMs } from '@/lib/timing';
import { sweepStaleSessions } from './sessions';
import { finalizeOverdueSittings } from './finalization';
import { logger, sanitizeError } from '@/lib/logger';

export interface MonitorRow {
  sessionId: string;
  userId: string;
  studentName: string;
  studentEmail: string;
  examId: string;
  examTitle: string;
  status: string;
  startedAt: string;
  lastHeartbeat: string;
  expiresAt: string;
  /** Null once the sitting has ended: show `endedAt` and the final status instead. */
  msRemaining: number | null;
  endedAt: string | null;
  violationCount: number;
  /** From the sitting's newest camera event (a client report, display only). */
  camera: 'ON' | 'OFF' | null;
  lastEventType: string | null;
  lastEventAt: string | null;
  submittedCount: number;
  questionCount: number;
}

let lastSweepStaleAt = 0;
const SWEEP_STALE_INTERVAL_MS = 15_000;

export async function monitorSnapshot(examId?: string): Promise<MonitorRow[]> {
  // Throttled per server process so multiple open tabs do not spam session sweeps.
  const nowMs = Date.now();
  if (nowMs - lastSweepStaleAt >= SWEEP_STALE_INTERVAL_MS) {
    lastSweepStaleAt = nowMs;
    await sweepStaleSessions().catch((err) =>
      logger.warn('sessions.sweep_failed', { error: sanitizeError(err) }),
    );
  }
  // Grade sittings abandoned by their student (throttled per process). Not
  // awaited: grading must never stall the live monitor stream.
  void finalizeOverdueSittings().catch((err) =>
    logger.warn('finalize.sweep_failed', { error: sanitizeError(err) }),
  );

  const sessions = await prisma.examSession.findMany({
    where: { ...(examId ? { examId } : {}) },
    orderBy: { startedAt: 'desc' },
    take: 300,
    include: {
      user: { select: { id: true, name: true, email: true } },
      exam: { select: { id: true, title: true, _count: { select: { questions: true } } } },
    },
  });
  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const [events, attempts] = await Promise.all([
    prisma.proctorEvent.findMany({
      where: { sessionId: { in: sessionIds } },
      orderBy: { occurredAt: 'desc' },
      take: 2000,
      select: { sessionId: true, type: true, occurredAt: true },
    }),
    prisma.attempt.groupBy({
      by: ['sessionId'],
      where: { sessionId: { in: sessionIds }, status: { not: 'IN_PROGRESS' } },
      _count: { _all: true },
    }),
  ]);
  // Newest event per sitting (events are sorted newest first).
  const lastEventBySession = new Map<string, (typeof events)[number]>();
  const eventsBySession = new Map<string, (typeof events)[number][]>();
  for (const e of events) {
    if (!e.sessionId) continue;
    if (!lastEventBySession.has(e.sessionId)) lastEventBySession.set(e.sessionId, e);
    eventsBySession.set(e.sessionId, [...(eventsBySession.get(e.sessionId) ?? []), e]);
  }
  const submittedBySession = new Map(attempts.map((a) => [a.sessionId, a._count._all]));

  const now = new Date();
  return sessions.map((s) => {
    const lastEvent = lastEventBySession.get(s.id) ?? null;
    const submittedCount = submittedBySession.get(s.id) ?? 0;
    const status = deriveSessionStatus(
      {
        lastHeartbeat: s.lastHeartbeat,
        expiresAt: s.expiresAt,
        endedAt: s.endedAt,
        lastEventType: (lastEvent?.type ?? null) as never,
      },
      now,
      env.sessionStaleSeconds,
    );
    return {
      sessionId: s.id,
      userId: s.userId,
      studentName: s.user.name ?? s.user.email,
      studentEmail: s.user.email,
      examId: s.examId,
      examTitle: s.exam.title,
      status,
      startedAt: s.startedAt.toISOString(),
      lastHeartbeat: s.lastHeartbeat.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      msRemaining: sittingRemainingMs(s, now),
      endedAt: s.endedAt?.toISOString() ?? null,
      violationCount: s.violationCount,
      camera: s.endedAt ? null : cameraStateFromEvents(eventsBySession.get(s.id) ?? []),
      lastEventType: lastEvent?.type ?? null,
      lastEventAt: lastEvent?.occurredAt.toISOString() ?? null,
      submittedCount,
      questionCount: s.exam._count.questions,
    };
  });
}
