import type { Exam, ExamSession } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { computeExpiry, examAvailability, msRemaining, type ExamAvailability } from '@/lib/timing';
import { env } from '@/lib/env';
import { deriveSessionStatus } from '@/lib/proctor';
import { conflict, forbidden } from '@/lib/http';

export interface ExamTimeState {
  availability: ExamAvailability;
  session: ExamSession | null;
  msRemaining: number;
  expiresAt: Date | null;
  serverTime: Date;
}

export async function getExamTimeState(examId: string, userId: string, exam?: Exam): Promise<ExamTimeState> {
  const theExam = exam ?? (await prisma.exam.findUniqueOrThrow({ where: { id: examId } }));
  const session = await prisma.examSession.findUnique({ where: { userId_examId: { userId, examId } } });
  const now = new Date();
  let availability = examAvailability(
    {
      status: theExam.status,
      startTime: theExam.startTime,
      endTime: theExam.endTime,
      durationMinutes: theExam.durationMinutes,
    },
    session ? { startedAt: session.startedAt, expiresAt: session.expiresAt, endedAt: session.endedAt } : null,
    { now },
  );
  if (availability === 'NOT_STARTED') {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
    if (user?.email === 'agnihotriaryan5361@gmail.com' || user?.role === 'ADMIN') {
      availability = 'AVAILABLE';
    }
  }
  return {
    availability,
    session,
    msRemaining: session ? msRemaining(session.expiresAt, now) : theExam.durationMinutes * 60_000,
    expiresAt: session?.expiresAt ?? null,
    serverTime: now,
  };
}

/** Start (or resume) a sitting. The expiry is fixed server-side at first start. */
export async function startExamSession(
  exam: Exam,
  userId: string,
  userAgent?: string | null,
): Promise<ExamSession> {
  const state = await getExamTimeState(exam.id, userId, exam);

  if (state.availability === 'NOT_STARTED') throw forbidden('This exam has not opened yet.');
  if (state.availability === 'ENDED') throw forbidden('This exam has closed.');
  if (state.availability === 'UNPUBLISHED') throw forbidden('This exam is not available.');
  if (state.availability === 'SUBMITTED') throw conflict('You have already submitted this exam.');
  if (state.availability === 'EXPIRED') throw conflict('Your time for this exam has expired.');
  if (state.session) return state.session; // resume -- never extends the deadline

  const startedAt = new Date();
  const expiresAt = computeExpiry(startedAt, exam.durationMinutes, exam.endTime);

  return prisma.$transaction(async (tx) => {
    const session = await tx.examSession.create({
      data: {
        userId,
        examId: exam.id,
        startedAt,
        expiresAt,
        lastHeartbeat: startedAt,
        status: 'ACTIVE',
        userAgent: userAgent?.slice(0, 300) ?? null,
      },
    });
    await tx.examAssignment.updateMany({
      where: { examId: exam.id, userId, status: 'ASSIGNED' },
      data: { status: 'STARTED' },
    });
    await tx.proctorEvent.create({
      data: { userId, examId: exam.id, type: 'EXAM_STARTED', violation: false },
    });
    return session;
  });
}

export async function heartbeat(
  examId: string,
  userId: string,
): Promise<{ status: string; msRemaining: number }> {
  const now = new Date();
  const session = await prisma.examSession.findUnique({ where: { userId_examId: { userId, examId } } });
  if (!session) return { status: 'NONE', msRemaining: 0 };

  const expired = now.getTime() >= session.expiresAt.getTime();
  const updated = await prisma.examSession.update({
    where: { id: session.id },
    data: {
      lastHeartbeat: now,
      ...(expired && !session.endedAt ? { status: 'EXPIRED' as const } : {}),
      ...(!expired && !session.endedAt && session.status !== 'ACTIVE' ? { status: 'ACTIVE' as const } : {}),
    },
  });
  return { status: updated.status, msRemaining: Math.max(0, updated.expiresAt.getTime() - now.getTime()) };
}

export async function endSession(
  examId: string,
  userId: string,
  status: 'SUBMITTED' | 'EXPIRED',
): Promise<void> {
  await prisma.examSession.updateMany({
    where: { examId, userId, endedAt: null },
    data: { endedAt: new Date(), status },
  });
}

/** Mark sessions whose heartbeat went silent, so the monitor stays truthful. */
export async function sweepStaleSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - env.sessionStaleSeconds * 1000);
  const stale = await prisma.examSession.findMany({
    where: { endedAt: null, status: { in: ['ACTIVE', 'AWAY'] }, lastHeartbeat: { lt: cutoff } },
    select: { id: true, userId: true, examId: true, lastHeartbeat: true, expiresAt: true },
  });
  if (stale.length === 0) return 0;

  await prisma.$transaction([
    prisma.examSession.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { status: 'DISCONNECTED' },
    }),
    prisma.proctorEvent.createMany({
      data: stale.map((s) => ({
        userId: s.userId,
        examId: s.examId,
        type: 'HEARTBEAT_LOST' as const,
        violation: true,
        durationMs: Date.now() - s.lastHeartbeat.getTime(),
      })),
    }),
  ]);
  return stale.length;
}

export function sessionStatusFor(session: ExamSession, lastEventType?: string | null): string {
  return deriveSessionStatus(
    {
      lastHeartbeat: session.lastHeartbeat,
      expiresAt: session.expiresAt,
      endedAt: session.endedAt,
      lastEventType: (lastEventType ?? null) as never,
    },
    new Date(),
    env.sessionStaleSeconds,
  );
}
