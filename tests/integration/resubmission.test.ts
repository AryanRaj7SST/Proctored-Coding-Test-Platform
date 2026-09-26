import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * Resubmission on real PostgreSQL: while time remains a question can be
 * submitted again and again, every submission is graded, the best score
 * counts, and nothing ends the test except the timer or End Test. The runner
 * mock passes a test case only when the page has an element #a.
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

const PASS = { html: '<div id="a"></div>', css: '', js: '' };
const FAIL = { html: '<p>nothing yet</p>', css: '', js: '' };

describeDb('resubmitting questions (requires DATABASE_URL)', { timeout: 120_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let sessions: typeof import('@/server/services/sessions');
  let attempts: typeof import('@/server/services/attempts');
  let finalization: typeof import('@/server/services/finalization');

  const stamp = Date.now();
  const questionId = `it-rs-q-${stamp}`;
  const examId = `it-rs-exam-${stamp}`;
  const users: string[] = [];
  let seq = 0;

  /** A fresh student with an open sitting and its one attempt. */
  async function sit() {
    const userId = `it-rs-u-${stamp}-${(seq += 1)}`;
    users.push(userId);
    await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, role: 'STUDENT' } });
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const sitting = await sessions.startExamSession(exam, userId);
    const [{ attempt }] = await attempts.ensureAttempts(sitting);
    return { userId, sitting, attemptId: attempt.id };
  }
  const row = (id: string) => prisma.attempt.findUniqueOrThrow({ where: { id } });
  const countedPassed = (id: string) =>
    prisma.testResult.count({ where: { attemptId: id, final: true, passed: true } });

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    sessions = await import('@/server/services/sessions');
    attempts = await import('@/server/services/attempts');
    finalization = await import('@/server/services/finalization');
    await prisma.question.create({
      data: {
        id: questionId,
        title: 'Resubmission question',
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
        title: 'Resubmission',
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
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('a better resubmission replaces the score; the test stays open', async () => {
    const { userId, sitting, attemptId } = await sit();
    const first = await attempts.submitAttempt({ attemptId, userId, code: FAIL });
    expect(first).toMatchObject({ score: 0, bestScore: 0 });

    const second = await attempts.submitAttempt({ attemptId, userId, code: PASS });
    expect(second).toMatchObject({ score: 10, bestScore: 10, alreadySubmitted: false });
    expect(Number((await row(attemptId)).score)).toBe(10);
    expect(await countedPassed(attemptId)).toBe(1);
    expect((await prisma.examSession.findUniqueOrThrow({ where: { id: sitting.id } })).endedAt).toBeNull();
    expect(
      await prisma.auditLog.count({ where: { action: 'attempt.resubmitted', entityId: attemptId } }),
    ).toBe(1);
  });

  it('a worse resubmission is graded and shown, but the best score is kept', async () => {
    const { userId, attemptId } = await sit();
    await attempts.submitAttempt({ attemptId, userId, code: PASS });
    const worse = await attempts.submitAttempt({ attemptId, userId, code: FAIL });
    expect(worse).toMatchObject({ score: 0, bestScore: 10 });
    expect(Number((await row(attemptId)).score)).toBe(10);
    expect(await countedPassed(attemptId)).toBe(1);
    // Both gradings are kept as history.
    expect(
      await prisma.testRun.count({ where: { attemptId, kind: 'SUBMISSION', status: 'COMPLETED' } }),
    ).toBe(2);
  });

  it('a submitted question stays editable while time remains', async () => {
    const { userId, attemptId } = await sit();
    await attempts.submitAttempt({ attemptId, userId, code: FAIL });
    await expect(attempts.saveAttemptCode(attemptId, userId, PASS)).resolves.toMatchObject({ saved: true });
    expect((await row(attemptId)).html).toBe(PASS.html);
  });

  it('End Test: a question edited after its last submit is graded once more, and counts if better', async () => {
    const { userId, attemptId } = await sit();
    await attempts.submitAttempt({ attemptId, userId, code: FAIL });
    await attempts.saveAttemptCode(attemptId, userId, PASS); // fixed, but never resubmitted
    await finalization.endExam(examId, userId);
    const a = await row(attemptId);
    expect(Number(a.score)).toBe(10);
    expect(a.html).toBe(PASS.html);
  });

  it('End Test: a worse edit after the best submit is graded but not counted; the counted code is kept', async () => {
    const { userId, attemptId } = await sit();
    await attempts.submitAttempt({ attemptId, userId, code: PASS });
    await attempts.saveAttemptCode(attemptId, userId, FAIL); // broke it afterwards
    await finalization.endExam(examId, userId);
    const a = await row(attemptId);
    expect(Number(a.score)).toBe(10);
    // The attempt keeps the code its counted result was graded on; the worse code stays in history.
    expect(a.html).toBe(PASS.html);
    const history = await prisma.testRun.findMany({
      where: { attemptId, kind: 'SUBMISSION' },
      orderBy: { startedAt: 'asc' },
    });
    expect(history.map((r) => (r.code as { html: string }).html)).toEqual([PASS.html, FAIL.html]);
  });

  it('after the test ends, nothing can be edited or resubmitted', async () => {
    const { userId, attemptId } = await sit();
    await attempts.submitAttempt({ attemptId, userId, code: PASS });
    await finalization.endExam(examId, userId);
    await expect(attempts.saveAttemptCode(attemptId, userId, FAIL)).rejects.toMatchObject({ status: 409 });
    const again = await attempts.submitAttempt({ attemptId, userId, code: FAIL });
    expect(again).toMatchObject({ alreadySubmitted: true, score: 10, bestScore: 10 });
    expect((await row(attemptId)).html).toBe(PASS.html);
  });

  it('once time is up, a resubmission is refused', async () => {
    const { userId, sitting, attemptId } = await sit();
    await attempts.submitAttempt({ attemptId, userId, code: FAIL });
    await prisma.examSession.update({
      where: { id: sitting.id },
      data: { expiresAt: new Date(Date.now() - 10 * 60_000) },
    });
    await expect(attempts.submitAttempt({ attemptId, userId, code: PASS })).rejects.toMatchObject({
      status: 403,
    });
    expect(Number((await row(attemptId)).score)).toBe(0);
  });
});
