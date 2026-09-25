import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * The scheduled maintenance job (Vercel Cron -> /api/cron/maintenance):
 * abandoned sittings are graded, and log retention never destroys graded
 * evidence. Real PostgreSQL; the runner mock passes every test case.
 */
vi.mock('@/lib/runner-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/runner-client')>();
  return {
    ...actual,
    runOnRunner: vi.fn(async (req: { spec: { tests: { id: string }[] } }) => ({
      runId: 'r',
      status: 'COMPLETED',
      durationMs: 1,
      consoleLogs: [],
      results: req.spec.tests.map((t) => ({ id: t.id, testName: 'x', passed: true, durationMs: 1 })),
    })),
  };
});

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;
const DAY = 24 * 60 * 60 * 1000;

describeDb('scheduled maintenance (requires DATABASE_URL)', { timeout: 120_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let maintenance: typeof import('@/server/services/maintenance');
  let sessions: typeof import('@/server/services/sessions');
  let attempts: typeof import('@/server/services/attempts');

  const stamp = Date.now();
  const questionId = `it-mt-q-${stamp}`;
  const examId = `it-mt-exam-${stamp}`;
  const userId = `it-mt-u-${stamp}`;

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    maintenance = await import('@/server/services/maintenance');
    sessions = await import('@/server/services/sessions');
    attempts = await import('@/server/services/attempts');
    await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, role: 'STUDENT' } });
    await prisma.question.create({
      data: {
        id: questionId,
        title: 'Maintenance question',
        slug: questionId,
        description: 'd',
        marks: 10,
        tests: {
          create: [
            {
              name: 'Exists',
              testCode: JSON.stringify({ assertions: [{ type: 'exists', selector: '#a' }] }),
              order: 0,
            },
          ],
        },
      },
    });
    await prisma.exam.create({
      data: {
        id: examId,
        title: 'Maintenance',
        status: 'PUBLISHED',
        durationMinutes: 30,
        questions: { create: [{ questionId, order: 0, marks: 10 }] },
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.exam.deleteMany({ where: { id: examId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('grades a sitting its student abandoned, and applies retention without losing graded evidence', async () => {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const sitting = await sessions.startExamSession(exam, userId);
    const [{ attempt }] = await attempts.ensureAttempts(sitting);
    await attempts.saveAttemptCode(attempt.id, userId, { html: '<div id="a"></div>', css: '', js: '' });
    // The student closed the tab and never came back: time ran out 10 minutes ago.
    await prisma.examSession.update({
      where: { id: sitting.id },
      data: { expiresAt: new Date(Date.now() - 10 * 60_000) },
    });

    const old = new Date(Date.now() - 200 * DAY);
    const oldPractice = await prisma.testRun.create({
      data: {
        attemptId: attempt.id,
        userId,
        kind: 'PRACTICE',
        status: 'COMPLETED',
        startedAt: old,
        logs: 'console',
        code: { html: 'x' },
      },
    });
    await prisma.testResult.create({
      data: { attemptId: attempt.id, testRunId: oldPractice.id, testName: 'p', passed: true },
    });
    const oldGraded = await prisma.testRun.create({
      data: {
        attemptId: attempt.id,
        userId,
        kind: 'SUBMISSION',
        status: 'COMPLETED',
        startedAt: old,
        logs: 'console',
        error: 'boom',
        code: { html: 'graded' },
      },
    });
    await prisma.testResult.create({
      data: { attemptId: attempt.id, testRunId: oldGraded.id, testName: 'g', passed: true, final: false },
    });
    const recentPractice = await prisma.testRun.create({
      data: { attemptId: attempt.id, userId, kind: 'PRACTICE', status: 'COMPLETED', logs: 'fresh' },
    });

    const report = await maintenance.runMaintenance({ retentionDays: 90 });
    expect(report.sittingsFinalized).toBeGreaterThanOrEqual(1);
    expect(report.practiceRunsDeleted).toBeGreaterThanOrEqual(1);
    expect(report.runLogsCleared).toBeGreaterThanOrEqual(1);

    // The abandoned sitting is closed and graded by the server.
    const closed = await prisma.examSession.findUniqueOrThrow({ where: { id: sitting.id } });
    expect(closed.endedAt).not.toBeNull();
    const graded = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(Number(graded.score)).toBe(10);

    // Retention: the old practice run is gone; the old graded run keeps results and code, loses logs.
    expect(await prisma.testRun.findUnique({ where: { id: oldPractice.id } })).toBeNull();
    const kept = await prisma.testRun.findUniqueOrThrow({ where: { id: oldGraded.id } });
    expect(kept).toMatchObject({ logs: null, error: null, code: { html: 'graded' } });
    expect(await prisma.testResult.count({ where: { testRunId: oldGraded.id } })).toBe(1);
    // Anything inside the retention window is untouched.
    expect(await prisma.testRun.findUniqueOrThrow({ where: { id: recentPractice.id } })).toMatchObject({
      logs: 'fresh',
    });
  });
});
