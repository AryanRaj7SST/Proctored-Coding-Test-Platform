import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

/**
 * Results: best-sitting view for admins, drill-down, and the student's own
 * result shaped by the test's result visibility. Real PostgreSQL; the runner
 * mock passes the first `runner.passing` test cases of every question.
 */

const runner = vi.hoisted(() => ({ passing: 2 }));
vi.mock('@/lib/runner-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/runner-client')>();
  return {
    ...actual,
    runOnRunner: vi.fn(async (req: { spec: { tests: { id: string }[] } }) => ({
      runId: 'r',
      status: 'COMPLETED',
      durationMs: 1,
      consoleLogs: [],
      results: req.spec.tests.map((t, i) => ({
        id: t.id,
        testName: 'x',
        passed: i < runner.passing,
        durationMs: 1,
        ...(i < runner.passing
          ? {}
          : {
              message: 'Expected "#b" to exist. Found: 0 element(s).',
              expected: 'present',
              actual: '0 element(s)',
            }),
      })),
    })),
  };
});

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('results (requires DATABASE_URL)', { timeout: 120_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let sessions: typeof import('@/server/services/sessions');
  let attempts: typeof import('@/server/services/attempts');
  let finalization: typeof import('@/server/services/finalization');
  let results: typeof import('@/server/services/results');

  const stamp = Date.now();
  const questionId = `it-rs-q-${stamp}`;
  const users = [`it-rs-u1-${stamp}`, `it-rs-u2-${stamp}`];
  const exams: string[] = [];

  async function newExam(extra: Record<string, unknown> = {}) {
    const id = `it-rs-exam-${stamp}-${exams.length + 1}`;
    exams.push(id);
    return prisma.exam.create({
      data: {
        id,
        title: `Results ${exams.length}`,
        status: 'PUBLISHED',
        accessMode: 'ANY_AUTHENTICATED_USER',
        durationMinutes: 30,
        questions: { create: [{ questionId, order: 0, marks: 10 }] },
        ...extra,
      },
    });
  }

  /** One full sitting for `userId`, graded with `passing` of 4 tests passing. */
  async function sitAndFinish(exam: { id: string }, userId: string, passing: number) {
    runner.passing = passing;
    const fresh = await prisma.exam.findUniqueOrThrow({ where: { id: exam.id } });
    const session = await sessions.startExamSession(fresh, userId);
    await attempts.ensureAttempts(session);
    await finalization.endExam(exam.id, userId);
    return session;
  }

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    sessions = await import('@/server/services/sessions');
    attempts = await import('@/server/services/attempts');
    finalization = await import('@/server/services/finalization');
    results = await import('@/server/services/results');
    for (const id of users)
      await prisma.user.create({ data: { id, email: `${id}@example.test`, role: 'STUDENT' } });
    await prisma.question.create({
      data: {
        id: questionId,
        title: 'Results question',
        slug: questionId,
        description: 'd',
        marks: 10,
        tests: {
          create: [0, 1, 2, 3].map((i) => ({
            name: `Check ${i + 1}`,
            testCode: JSON.stringify({ assertions: [{ type: 'exists', selector: `#el${i}` }] }),
            order: i,
          })),
        },
      },
    });
  });

  beforeEach(() => {
    runner.passing = 2;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.exam.deleteMany({ where: { id: { in: exams } } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('the default view shows each student their best sitting; "all" shows every sitting', async () => {
    const exam = await newExam({ maxAttempts: 3 });
    await sitAndFinish(exam, users[0]!, 1); // 2.5 / 10
    const best = await sitAndFinish(exam, users[0]!, 3); // 7.5 / 10
    await sitAndFinish(exam, users[0]!, 2); // 5 / 10

    const bestView = await results.listResults({ examId: exam.id });
    expect(bestView.total).toBe(1);
    expect(bestView.rows[0]).toMatchObject({
      sessionId: best.id,
      attemptNumber: 2,
      score: 7.5,
      percentage: 75,
      state: 'PASSED',
    });

    const allView = await results.listResults({ examId: exam.id, view: 'all' });
    expect(allView.total).toBe(3);
    expect(allView.rows.map((r) => r.score)).toEqual([7.5, 5, 2.5]);
  });

  it('filters by state', async () => {
    const exam = await newExam({ passingPercentage: '60' });
    await sitAndFinish(exam, users[0]!, 2); // 50% -> FAILED
    await sitAndFinish(exam, users[1]!, 4); // 100% -> PASSED
    const passed = await results.listResults({ examId: exam.id, state: 'PASSED' });
    expect(passed.rows.map((r) => r.userId)).toEqual([users[1]]);
    const failed = await results.listResults({ examId: exam.id, state: 'FAILED' });
    expect(failed.rows.map((r) => r.userId)).toEqual([users[0]]);
  });

  it('admin drill-down: question score, test cases with equal shares, submitted code', async () => {
    const exam = await newExam();
    const session = await sitAndFinish(exam, users[0]!, 3);
    const detail = await results.getSittingResultForAdmin(session.id);
    expect(detail).toMatchObject({ score: 7.5, maxScore: 10, percentage: 75, result: 'PASSED' });
    const q = detail.questions[0]!;
    expect(q).toMatchObject({
      score: 7.5,
      maxScore: 10,
      passedCount: 3,
      enabledCount: 4,
      resultStatus: 'PARTIAL',
    });
    expect(q.testCases.map((t) => [t.passed, t.points, t.pointsAwarded])).toEqual([
      [true, 2.5, 2.5],
      [true, 2.5, 2.5],
      [true, 2.5, 2.5],
      [false, 2.5, 0],
    ]);
    expect(q.testCases[3]).toMatchObject({ expected: 'present', actual: '0 element(s)' });
    expect(q.testCases[0]!.definition?.checks[0]).toMatch(/#el0/);
    expect(q.code).toHaveProperty('html');
  });

  it('student result follows the test visibility: FULL, SCORE_ONLY, HIDDEN', async () => {
    const full = await newExam({ resultVisibility: 'FULL' });
    const s1 = await sitAndFinish(full, users[0]!, 2);
    const fullView = await results.getSittingResultForStudent(s1.id, users[0]!);
    expect(fullView.totals).toMatchObject({ score: 5, maxScore: 10, percentage: 50, result: 'PASSED' });
    expect(fullView.questions?.[0]?.testCases).toHaveLength(4);
    expect(JSON.stringify(fullView)).not.toContain('referenceHtml');
    expect(JSON.stringify(fullView)).not.toContain('"code"');

    const scoreOnly = await newExam({ resultVisibility: 'SCORE_ONLY' });
    const s2 = await sitAndFinish(scoreOnly, users[0]!, 2);
    const scoreView = await results.getSittingResultForStudent(s2.id, users[0]!);
    expect(scoreView.totals).toMatchObject({ score: 5 });
    expect(scoreView.questions).toBeNull();

    const hidden = await newExam({ resultVisibility: 'HIDDEN' });
    const s3 = await sitAndFinish(hidden, users[0]!, 2);
    const hiddenView = await results.getSittingResultForStudent(s3.id, users[0]!);
    expect(hiddenView.totals).toBeNull();
    expect(hiddenView.questions).toBeNull();

    const mine = await results.listMySittings(users[0]!);
    const hiddenRow = mine.find((m) => m.sessionId === s3.id)!;
    expect(hiddenRow).toMatchObject({ score: null, result: null, resultsHidden: true });
  });

  it("a student cannot read another student's result", async () => {
    const exam = await newExam();
    const session = await sitAndFinish(exam, users[0]!, 2);
    await expect(results.getSittingResultForStudent(session.id, users[1]!)).rejects.toThrow(/not found/i);
  });

  it('exports formula-safe CSV rows', async () => {
    const exam = await newExam();
    await sitAndFinish(exam, users[0]!, 4);
    const rows = await results.listAllResults({ examId: exam.id });
    const csv = results.resultsToCsv(rows);
    expect(csv.split('\n')[0]).toContain('student_email');
    expect(csv).toContain(`${users[0]}@example.test`);
    expect(csv).not.toContain('<div');
  });
});
