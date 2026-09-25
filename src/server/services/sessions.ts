import { Prisma, type Exam, type ExamSession } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  computeExpiry,
  examAvailability,
  msRemaining,
  sittingNeedsFinalization,
  unboundedWindow,
  type ExamAvailability,
  type ExamWindow,
  type SessionState,
} from '@/lib/timing';
import { env } from '@/lib/env';
import { deriveSessionStatus } from '@/lib/proctor';
import { refreshSittingTotals } from '@/server/grading/sitting-totals';
import { conflict, forbidden } from '@/lib/errors';
import { recordAudit } from './audit';

export interface ExamTimeState {
  availability: ExamAvailability;
  session: ExamSession | null;
  msRemaining: number;
  expiresAt: Date | null;
  serverTime: Date;
}

type SessionReader = Pick<Prisma.TransactionClient, 'examSession'>;

/**
 * The student's current sitting for a test: the highest-numbered one, open or
 * closed. Every "what is this student doing in this test" question starts here.
 */
export function currentSession(examId: string, userId: string, db: SessionReader = prisma) {
  return db.examSession.findFirst({ where: { examId, userId }, orderBy: { attemptNumber: 'desc' } });
}

/** Accounts outside the ADMIN role that have open test access (see hasOpenTestAccess). */
const OPEN_ACCESS_EMAILS: ReadonlySet<string> = new Set(['agnihotriaryan5361@gmail.com']);

/**
 * Open test access: the account is bound by neither a test's window nor its
 * attempt limit. It may start before the test opens and after it closes, and
 * may start a fresh sitting after each one ends. Every sitting is still timed,
 * proctored and graded; nothing is deleted. Administrators have it (dry
 * runs), plus the accounts listed above. Decided from the database (role and
 * verified Google email), never from anything the browser sends.
 */
export function hasOpenTestAccess(user: { email?: string | null; role?: string | null } | null): boolean {
  if (!user) return false;
  return user.role === 'ADMIN' || OPEN_ACCESS_EMAILS.has((user.email ?? '').toLowerCase());
}

export async function userHasOpenTestAccess(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
  return hasOpenTestAccess(user);
}

/**
 * sittingNeedsFinalization for this sitting's owner: a sitting with open test
 * access ends by its own clock only, never because the test window closed.
 */
export async function sittingOverdue(
  exam: ExamWindow,
  session: SessionState | null,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!sittingNeedsFinalization(exam, session, now)) return false;
  if (sittingNeedsFinalization(unboundedWindow(exam), session, now)) return true;
  return !(await userHasOpenTestAccess(userId));
}

export async function getExamTimeState(examId: string, userId: string, exam?: Exam): Promise<ExamTimeState> {
  const theExam = exam ?? (await prisma.exam.findUniqueOrThrow({ where: { id: examId } }));
  const session = await currentSession(examId, userId);
  const now = new Date();
  const window = {
    status: theExam.status,
    startTime: theExam.startTime,
    endTime: theExam.endTime,
    durationMinutes: theExam.durationMinutes,
  };
  const sitting = session
    ? { startedAt: session.startedAt, expiresAt: session.expiresAt, endedAt: session.endedAt }
    : null;
  const attemptsRemaining = Math.max(0, theExam.maxAttempts - (session?.attemptNumber ?? 0));
  let availability = examAvailability(window, sitting, { now, attemptsRemaining });
  // Only these states depend on the window or the attempt limit, so only
  // they can differ for an account with open test access.
  if (
    (availability === 'NOT_STARTED' || availability === 'ENDED' || availability === 'SUBMITTED') &&
    (await userHasOpenTestAccess(userId))
  ) {
    availability = examAvailability(unboundedWindow(window), sitting, {
      now,
      attemptsRemaining: Number.POSITIVE_INFINITY,
    });
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

  if (state.availability === 'NOT_STARTED') throw forbidden('This test has not opened yet.');
  if (state.availability === 'ENDED') throw forbidden('This test has closed.');
  if (state.availability === 'UNPUBLISHED') throw forbidden('This test is not available.');
  if (state.availability === 'SUBMITTED') {
    const closing = await prisma.proctorEvent.findFirst({
      where: { userId, examId: exam.id, type: 'EXAM_SUBMITTED' },
      orderBy: { occurredAt: 'desc' },
      select: { metadata: true },
    });
    const reason = (closing?.metadata as { reason?: string } | null)?.reason;
    if (reason === 'VIOLATION_LIMIT') {
      throw conflict('This test was ended automatically because the proctoring violation limit was reached.');
    }
    if (reason === 'EXPIRED' || reason === 'EXAM_CLOSED') {
      throw conflict('Your time for this test has expired. Your saved work was submitted.');
    }
    throw conflict(
      exam.maxAttempts > 1
        ? `You have used all ${exam.maxAttempts} attempts for this test.`
        : 'You have already submitted this test.',
    );
  }
  if (state.availability === 'EXPIRED') throw conflict('Your time for this test has expired.');
  // Resume an open sitting -- never extends the deadline. A finished one is
  // only followed by a new sitting when attempts remain (availability says so).
  if (state.session && !state.session.endedAt) return state.session;

  const startedAt = new Date();
  // Open test access is not cut short by the test's closing time.
  const closesAt = exam.endTime && !(await userHasOpenTestAccess(userId)) ? exam.endTime : null;
  const expiresAt = computeExpiry(startedAt, exam.durationMinutes, closesAt);
  const attemptNumber = (state.session?.attemptNumber ?? 0) + 1;

  try {
    return await prisma.$transaction(async (tx) => {
      const marks = await tx.examQuestion.aggregate({ where: { examId: exam.id }, _sum: { marks: true } });
      const session = await tx.examSession.create({
        data: {
          userId,
          examId: exam.id,
          attemptNumber,
          startedAt,
          expiresAt,
          lastHeartbeat: startedAt,
          status: 'ACTIVE',
          userAgent: userAgent?.slice(0, 300) ?? null,
          maxScore: marks._sum.marks ?? 0,
        },
      });
      await tx.examAssignment.updateMany({
        where: { examId: exam.id, userId, status: 'ASSIGNED' },
        data: { status: 'STARTED' },
      });
      await tx.proctorEvent.create({
        data: { userId, examId: exam.id, sessionId: session.id, type: 'EXAM_STARTED', violation: false },
      });
      return session;
    });
  } catch (err) {
    // A second tab started the same sitting a moment earlier: resume that one.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const raced = await currentSession(exam.id, userId);
      if (raced && raced.attemptNumber === attemptNumber) return raced;
    }
    throw err;
  }
}

export async function heartbeat(
  examId: string,
  userId: string,
): Promise<{ status: string; msRemaining: number }> {
  const now = new Date();
  const session = await currentSession(examId, userId);
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
        sessionId: s.id,
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

/** When every question of the current sitting is submitted, close the sitting. */
export async function maybeFinishExam(examId: string, userId: string): Promise<void> {
  const session = await currentSession(examId, userId);
  if (!session || session.endedAt) return;
  const [total, submitted] = await Promise.all([
    prisma.examQuestion.count({ where: { examId } }),
    prisma.attempt.count({
      where: { sessionId: session.id, status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } },
    }),
  ]);
  if (total > 0 && submitted >= total) {
    const ended = await prisma.examSession.updateMany({
      where: { id: session.id, endedAt: null },
      data: { endedAt: new Date(), status: 'SUBMITTED' },
    });
    await prisma.examAssignment.updateMany({ where: { examId, userId }, data: { status: 'SUBMITTED' } });
    await refreshSittingTotals(session.id);
    if (ended.count === 1) {
      await prisma.proctorEvent.create({
        data: {
          userId,
          examId,
          sessionId: session.id,
          type: 'EXAM_SUBMITTED',
          violation: false,
          metadata: { reason: 'STUDENT_ENDED' },
        },
      });
      // Same audit trail as pressing End Test: the sitting ended because every answer is in.
      await recordAudit({
        userId,
        action: 'exam.ended',
        entity: 'Exam',
        entityId: examId,
        metadata: {
          reason: 'ALL_SUBMITTED',
          attemptNumber: session.attemptNumber,
          submittedCount: submitted,
        },
      });
    }
  }
}
