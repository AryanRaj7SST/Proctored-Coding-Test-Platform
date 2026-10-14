import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Leaderboard Service Integration Tests (requires live PostgreSQL).
 * Runs when DATABASE_URL is accessible (e.g. in CI or container).
 */

const DATABASE_URL = process.env.DATABASE_URL;

// Test connection probe
let canConnect = false;
if (DATABASE_URL) {
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    canConnect = true;
  } catch {
    canConnect = false;
  }
}

const describeDb = canConnect ? describe : describe.skip;

describeDb('leaderboard service (live Postgres)', { timeout: 60_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let leaderboardService: typeof import('@/server/services/leaderboard');

  const stamp = Date.now();
  const examId = `it-lb-exam-${stamp}`;
  const qId1 = `it-lb-q1-${stamp}`;
  const qId2 = `it-lb-q2-${stamp}`;
  const user1 = `it-lb-u1-${stamp}`;
  const user2 = `it-lb-u2-${stamp}`;

  beforeAll(async () => {
    const p = await import('@/lib/prisma');
    prisma = p.prisma;
    leaderboardService = await import('@/server/services/leaderboard');

    // Create test users
    await prisma.user.createMany({
      data: [
        {
          id: user1,
          email: `${user1}@example.com`,
          name: 'Student One',
          displayHandle: 'student_one',
        },
        {
          id: user2,
          email: `${user2}@example.com`,
          name: 'Student Two',
          displayHandle: 'student_two',
        },
      ],
    });

    // Create test questions
    await prisma.question.createMany({
      data: [
        {
          id: qId1,
          slug: qId1,
          title: 'Question 1',
          description: 'Description 1',
          marks: 50,
          status: 'PUBLISHED',
        },
        {
          id: qId2,
          slug: qId2,
          title: 'Question 2',
          description: 'Description 2',
          marks: 50,
          status: 'PUBLISHED',
        },
      ],
    });

    // Create exam
    await prisma.exam.create({
      data: {
        id: examId,
        title: `Contest ${stamp}`,
        status: 'PUBLISHED',
        leaderboardMode: 'LIVE',
        wrongTryPenaltySeconds: 300,
        questions: {
          create: [
            { questionId: qId1, order: 0, marks: 50 },
            { questionId: qId2, order: 1, marks: 50 },
          ],
        },
      },
    });

    // Create sessions & attempts for users
    const sess1 = await prisma.examSession.create({
      data: {
        id: `sess1-${stamp}`,
        examId,
        userId: user1,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const att1 = await prisma.attempt.create({
      data: {
        id: `att1-${stamp}`,
        examId,
        sessionId: sess1.id,
        userId: user1,
        questionId: qId1,
        score: 50,
        maxScore: 50,
        status: 'SUBMITTED',
        snapshot: {},
        acceptedAt: new Date(),
        triesCount: 1,
      },
    });

    // Create a submission run for att1
    await prisma.testRun.create({
      data: {
        id: `tr1-${stamp}`,
        attemptId: att1.id,
        questionId: qId1,
        userId: user1,
        kind: 'SUBMISSION',
        status: 'COMPLETED',
        score: 50,
        maxScore: 50,
        completedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.testRun.deleteMany({ where: { questionId: { in: [qId1, qId2] } } });
    await prisma.attemptFlag.deleteMany({ where: { attempt: { examId } } });
    await prisma.attempt.deleteMany({ where: { examId } });
    await prisma.examSession.deleteMany({ where: { examId } });
    await prisma.examQuestion.deleteMany({ where: { examId } });
    await prisma.exam.deleteMany({ where: { id: examId } });
    await prisma.question.deleteMany({ where: { id: { in: [qId1, qId2] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user1, user2] } } });
  });

  it('retrieves paginated leaderboard rows and requesting user row', async () => {
    const result = await leaderboardService.getExamLeaderboard({
      examId,
      requestingUserId: user1,
      page: 1,
      pageSize: 50,
    });

    expect(result.exam.id).toBe(examId);
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.userRow).not.toBeNull();
    expect(result.userRow?.userId).toBe(user1);
    expect(result.userRow?.score).toBe(50);
  });

  it('allows admin to flag and unflag attempt for plagiarism', async () => {
    const attempt = await prisma.attempt.findFirstOrThrow({ where: { examId, userId: user1 } });

    await leaderboardService.flagAttempt({
      attemptId: attempt.id,
      kind: 'PLAGIARISM',
      adminUserId: user2,
      note: 'Copied solution',
    });

    const flagged = await leaderboardService.getExamLeaderboard({
      examId,
      requestingUserId: user1,
      isAdmin: true,
    });

    const userRow = flagged.rows.find((r) => r.userId === user1);
    expect(userRow?.questions[qId1]?.state).toBe('PLAGIARIZED');
    expect(userRow?.score).toBe(0);

    // Unflag
    await leaderboardService.unflagAttempt({
      attemptId: attempt.id,
      kind: 'PLAGIARISM',
    });

    const unflagged = await leaderboardService.getExamLeaderboard({
      examId,
      requestingUserId: user1,
      isAdmin: true,
    });
    const restoredRow = unflagged.rows.find((r) => r.userId === user1);
    expect(restoredRow?.questions[qId1]?.state).toBe('ACCEPTED');
    expect(restoredRow?.score).toBe(50);
  });
});
