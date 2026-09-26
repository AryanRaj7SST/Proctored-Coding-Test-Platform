import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * Post-submission Practice Mode on real PostgreSQL: a submitted question can
 * be re-run with new code, and nothing about the graded attempt changes.
 * The runner mock passes a test only when the page has an element #a.
 */
vi.mock('@/lib/runner-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/runner-client')>();
  return {
    ...actual,
    runOnRunner: vi.fn(async (req: { html: string; spec: { tests: { id: string }[] } }) => ({
      runId: 'r',
      status: 'COMPLETED',
      durationMs: 1,
      consoleLogs: [],
      results: req.spec.tests.map((t) => ({
        id: t.id,
        testName: 'x',
        passed: req.html.includes('id="a"'),
        durationMs: 1,
      })),
    })),
  };
});

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('post-submission practice mode (requires DATABASE_URL)', { timeout: 120_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let sessions: typeof import('@/server/services/sessions');
  let attempts: typeof import('@/server/services/attempts');
  let practice: typeof import('@/server/services/practice');

  const stamp = Date.now();
  const questionId = `it-pm-q-${stamp}`;
  const examId = `it-pm-exam-${stamp}`;
  const ids = { owner: `it-pm-owner-${stamp}`, other: `it-pm-other-${stamp}` };
  const user = (id: string) => ({
    id,
    email: `${id}@example.test`,
    name: null,
    role: 'STUDENT' as const,
    batch: null,
  });
  let attemptId = '';

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    sessions = await import('@/server/services/sessions');
    attempts = await import('@/server/services/attempts');
    practice = await import('@/server/services/practice');
    for (const id of Object.values(ids)) {
      await prisma.user.create({ data: { id, email: `${id}@example.test`, role: 'STUDENT' } });
    }
    await prisma.question.create({
      data: {
        id: questionId,
        title: 'Practice question',
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
        title: 'Practice',
        status: 'PUBLISHED',
        durationMinutes: 30,
        maxAttempts: 2,
        questions: { create: [{ questionId, order: 0, marks: 10 }] },
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.testRun.deleteMany({ where: { questionId, attemptId: null } });
    await prisma.exam.deleteMany({ where: { id: examId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.$disconnect();
  });

  it('is refused while the attempt is still in progress', async () => {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const sitting = await sessions.startExamSession(exam, ids.owner);
    const [{ attempt }] = await attempts.ensureAttempts(sitting);
    attemptId = attempt.id;
    await expect(
      practice.executePracticeTests({
        attemptId,
        user: user(ids.owner),
        code: { html: '', css: '', js: '' },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('runs new code against the frozen tests and never changes the graded attempt', async () => {
    await attempts.submitAttempt({
      attemptId,
      userId: ids.owner,
      code: { html: '<p>wrong</p>', css: '', js: '' },
    });
    const { endExam } = await import('@/server/services/finalization');
    await endExam(examId, ids.owner); // practice opens once the test has ended
    const before = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(before).toMatchObject({ status: 'SUBMITTED', html: '<p>wrong</p>' });
    expect(Number(before.score)).toBe(0);
    const resultsBefore = await prisma.testResult.count({ where: { attemptId } });
    const runsBefore = await prisma.testRun.count({ where: { attemptId } });

    const outcome = await practice.executePracticeTests({
      attemptId,
      user: user(ids.owner),
      code: { html: '<div id="a"></div>', css: '', js: '' },
    });
    expect(outcome).toMatchObject({ passedCount: 1, totalCount: 1, score: 10, maxScore: 10 });

    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(after).toEqual(before);
    expect(await prisma.testResult.count({ where: { attemptId } })).toBe(resultsBefore);
    expect(await prisma.testRun.count({ where: { attemptId } })).toBe(runsBefore);

    const run = await prisma.testRun.findUniqueOrThrow({ where: { id: outcome.runId } });
    expect(run).toMatchObject({
      attemptId: null,
      questionId,
      userId: ids.owner,
      kind: 'PRACTICE',
      status: 'COMPLETED',
      passedCount: 1,
    });
    // The sitting's result is untouched too.
    const sitting = await prisma.examSession.findFirstOrThrow({ where: { examId, userId: ids.owner } });
    expect(Number(sitting.score)).toBe(0);
  });

  it('lists each completed question once for the dashboard', async () => {
    const links = await practice.listPracticeAttempts(ids.owner);
    expect(links.get(examId)).toEqual([{ attemptId, questionTitle: 'Practice question' }]);
    expect((await practice.listPracticeAttempts(ids.other)).size).toBe(0);
  });

  it("another student's attempt is a 404", async () => {
    await expect(
      practice.executePracticeTests({
        attemptId,
        user: user(ids.other),
        code: { html: '', css: '', js: '' },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('is refused while a new sitting of the same test is in progress', async () => {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const second = await sessions.startExamSession(exam, ids.owner);
    expect(second.attemptNumber).toBe(2);
    await expect(practice.loadPracticeAttempt(attemptId, user(ids.owner))).rejects.toMatchObject({
      status: 403,
      message: practice.PRACTICE_IN_PROGRESS_MESSAGE,
    });
    await prisma.examSession.update({ where: { id: second.id }, data: { endedAt: new Date() } });
    await expect(practice.loadPracticeAttempt(attemptId, user(ids.owner))).resolves.toMatchObject({
      id: attemptId,
    });
  });

  it('is refused once an administrator revokes access to the test', async () => {
    await prisma.examAssignment.create({
      data: { examId, userId: ids.owner, email: `${ids.owner}@example.test`, revokedAt: new Date() },
    });
    await expect(practice.loadPracticeAttempt(attemptId, user(ids.owner))).rejects.toMatchObject({
      status: 404,
    });
  });
});
