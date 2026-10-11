import { describe, it, expect, vi, beforeEach } from 'vitest';

const finalizeOverdueSittingsMock = vi.fn().mockResolvedValue(0);
vi.mock('@/server/services/finalization', () => ({
  finalizeOverdueSittings: (...args: unknown[]) => finalizeOverdueSittingsMock(...args),
}));

const prismaMock = {
  user: {
    findUnique: vi.fn(),
  },
  examAssignment: {
    findMany: vi.fn(),
  },
  examSession: {
    findMany: vi.fn(),
  },
  exam: {
    findMany: vi.fn(),
  },
};

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

const { listStudentExams } = await import('@/server/services/exams');

describe('listStudentExams query optimization', () => {
  const userId = 'u-test-student';

  beforeEach(() => {
    vi.clearAllMocks();
    finalizeOverdueSittingsMock.mockResolvedValue(0);
    prismaMock.user.findUnique.mockResolvedValue({ role: 'STUDENT', email: 'student@example.test' });
    prismaMock.examAssignment.findMany.mockResolvedValue([]);
    prismaMock.examSession.findMany.mockResolvedValue([]);
    prismaMock.exam.findMany.mockResolvedValue([]);
  });

  it('skips finalizeOverdueSittings when alreadyFinalized option is true', async () => {
    await listStudentExams(userId, { alreadyFinalized: true });
    expect(finalizeOverdueSittingsMock).not.toHaveBeenCalled();
  });

  it('calls finalizeOverdueSittings when alreadyFinalized option is not set', async () => {
    await listStudentExams(userId);
    expect(finalizeOverdueSittingsMock).toHaveBeenCalledWith({ userId });
  });

  it('avoids querying prisma.user when user is passed in options', async () => {
    await listStudentExams(userId, {
      user: { role: 'STUDENT', email: 'preloaded@example.test' },
      alreadyFinalized: true,
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('queries prisma.user when user is not provided in options', async () => {
    await listStudentExams(userId, { alreadyFinalized: true });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: userId },
      select: { role: true, email: true },
    });
  });

  it('queries examSession only once and derives inProgressExamIds without a second session query', async () => {
    prismaMock.examSession.findMany.mockResolvedValue([
      {
        id: 'sess-1',
        examId: 'exam-1',
        attemptNumber: 1,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
        endedAt: null,
        status: 'ACTIVE',
        result: null,
        score: null,
        maxScore: 10,
        percentage: null,
        attempts: [],
      },
    ]);

    prismaMock.exam.findMany.mockResolvedValue([
      {
        id: 'exam-1',
        title: 'Exam 1',
        description: null,
        durationMinutes: 60,
        startTime: null,
        endTime: null,
        status: 'PUBLISHED',
        timezone: 'Asia/Kolkata',
        questions: [{ marks: 10 }],
        maxAttempts: 1,
        resultVisibility: 'FULL',
      },
    ]);

    const results = await listStudentExams(userId, { alreadyFinalized: true });

    // examSession.findMany should only be called once, not twice
    expect(prismaMock.examSession.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.examSession.findMany).toHaveBeenCalledWith({
      where: { userId },
      orderBy: { attemptNumber: 'desc' },
      include: { attempts: { select: { status: true, gradedAt: true } } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.availability).toBe('IN_PROGRESS');
  });
});
