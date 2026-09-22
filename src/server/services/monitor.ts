import { prisma } from '@/lib/prisma';
import { deriveSessionStatus } from '@/lib/proctor';
import { env } from '@/lib/env';
import { sweepStaleSessions } from './sessions';

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
  msRemaining: number;
  violationCount: number;
  lastEventType: string | null;
  lastEventAt: string | null;
  submittedCount: number;
  questionCount: number;
}

export async function monitorSnapshot(examId?: string): Promise<MonitorRow[]> {
  await sweepStaleSessions();

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

  const userIds = sessions.map((s) => s.userId);
  const examIds = [...new Set(sessions.map((s) => s.examId))];

  const [events, attempts] = await Promise.all([
    prisma.proctorEvent.findMany({
      where: { userId: { in: userIds }, examId: { in: examIds } },
      orderBy: { occurredAt: 'desc' },
      take: 2000,
      select: { userId: true, examId: true, type: true, occurredAt: true },
    }),
    prisma.attempt.groupBy({
      by: ['userId', 'examId'],
      where: { userId: { in: userIds }, examId: { in: examIds }, status: { not: 'IN_PROGRESS' } },
      _count: { _all: true },
    }),
  ]);

  const now = new Date();
  return sessions.map((s) => {
    const lastEvent = events.find((e) => e.userId === s.userId && e.examId === s.examId) ?? null;
    const submitted = attempts.find((a) => a.userId === s.userId && a.examId === s.examId);
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
      msRemaining: Math.max(0, s.expiresAt.getTime() - now.getTime()),
      violationCount: s.violationCount,
      lastEventType: lastEvent?.type ?? null,
      lastEventAt: lastEvent?.occurredAt.toISOString() ?? null,
      submittedCount: submitted?._count._all ?? 0,
      questionCount: s.exam._count.questions,
    };
  });
}

export async function dashboardStats() {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [activeExams, students, questions, activeAttempts, submissions, scoreAgg, violations, recentRuns] =
    await Promise.all([
      prisma.exam.count({ where: { status: { in: ['PUBLISHED', 'ACTIVE'] }, active: true } }),
      prisma.user.count({ where: { role: 'STUDENT', active: true } }),
      prisma.question.count({ where: { active: true } }),
      prisma.attempt.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.attempt.count({ where: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } } }),
      prisma.attempt.aggregate({
        where: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } },
        _sum: { score: true, maxScore: true },
      }),
      prisma.proctorEvent.count({ where: { violation: true, occurredAt: { gte: since } } }),
      prisma.testRun.count({ where: { startedAt: { gte: since } } }),
    ]);

  const sum = scoreAgg._sum.score ?? 0;
  const max = scoreAgg._sum.maxScore ?? 0;
  return {
    activeExams,
    students,
    questions,
    activeAttempts,
    submissions,
    averagePercentage: max > 0 ? Math.round((sum / max) * 1000) / 10 : 0,
    recentViolations: violations,
    recentRuns,
  };
}

export async function recentActivity(limit = 15) {
  const [attempts, events, runs, users] = await Promise.all([
    prisma.attempt.findMany({
      where: { submittedAt: { not: null } },
      orderBy: { submittedAt: 'desc' },
      take: limit,
      include: { user: { select: { name: true, email: true } }, exam: { select: { title: true } } },
    }),
    prisma.proctorEvent.findMany({
      where: { violation: true },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      include: { user: { select: { name: true, email: true } }, exam: { select: { title: true } } },
    }),
    prisma.testRun.findMany({
      where: { status: { in: ['FAILED', 'TIMEOUT'] } },
      orderBy: { startedAt: 'desc' },
      take: 5,
    }),
    prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { email: true, createdAt: true } }),
  ]);

  type Item = { at: Date; kind: string; text: string };
  const items: Item[] = [
    ...attempts.map((a) => ({
      at: a.submittedAt as Date,
      kind: 'submission',
      text: `${a.user.name ?? a.user.email} submitted a question in "${a.exam.title}" (${a.score}/${a.maxScore})`,
    })),
    ...events.map((e) => ({
      at: e.occurredAt,
      kind: 'violation',
      text: `${e.user.name ?? e.user.email} triggered ${e.type} in "${e.exam.title}"`,
    })),
    ...runs.map((r) => ({ at: r.startedAt, kind: 'runner', text: `Test run ${r.id.slice(0, 8)} ended as ${r.status}` })),
    ...users.map((u) => ({ at: u.createdAt, kind: 'user', text: `${u.email} signed in for the first time` })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
