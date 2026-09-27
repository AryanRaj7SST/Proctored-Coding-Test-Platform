import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

/**
 * Question lifecycle: DRAFT -> VALIDATED (validation) -> PUBLISHED, ARCHIVED
 * from anywhere. Validation runs the enabled test cases against the reference
 * solution; a runner outage proves nothing and changes nothing.
 */

const runner = vi.hoisted(() => ({ verdicts: [] as boolean[], down: false, sent: [] as string[][] }));

vi.mock('@/lib/runner-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/runner-client')>();
  return {
    ...actual,
    runOnRunner: vi.fn(async (req: { html: string; spec: { tests: { id: string }[] } }) => {
      const ids = req.spec.tests.map((t) => t.id);
      runner.sent.push(ids);
      if (runner.down) throw new actual.RunnerError('UNAVAILABLE', 'down (test)');
      return {
        runId: 'r',
        status: 'COMPLETED',
        durationMs: 1,
        consoleLogs: [],
        results: ids.map((id, i) => ({
          id,
          testName: id,
          passed: runner.verdicts[i] ?? true,
          durationMs: 1,
          ...(runner.verdicts[i] === false ? { message: 'nope', expected: 'red', actual: 'blue' } : {}),
        })),
      };
    }),
  };
});

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('question lifecycle (requires DATABASE_URL)', { timeout: 120_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let questions: typeof import('@/server/services/questions');
  let validation: typeof import('@/server/services/validation-runs');

  const stamp = Date.now();
  const created: string[] = [];
  const adminId = `it-ql-admin-${stamp}`;
  const spec = (selector: string) => JSON.stringify({ assertions: [{ type: 'exists', selector }] });

  async function draft(overrides: Record<string, unknown> = {}) {
    const q = await questions.createQuestion(
      {
        title: `Lifecycle ${created.length + 1}`,
        description: 'Make a button.',
        type: 'WEB',
        marks: '10',
        starterHtml: '',
        starterCss: '',
        starterJs: '',
        referenceHtml: '<button id="b">Go</button>',
        difficulty: 'EASY',
        tags: [],
        tests: [
          { name: 'button exists', testType: 'DECLARATIVE', testCode: spec('#b'), order: 0, enabled: true },
          {
            name: 'label exists',
            testType: 'DECLARATIVE',
            testCode: spec('#label'),
            order: 1,
            enabled: true,
          },
          {
            name: 'extra (disabled)',
            testType: 'DECLARATIVE',
            testCode: spec('#x'),
            order: 2,
            enabled: false,
          },
        ],
        ...overrides,
      } as never,
      adminId,
    );
    created.push(q.id);
    return q;
  }
  const row = (id: string) => prisma.question.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    questions = await import('@/server/services/questions');
    validation = await import('@/server/services/validation-runs');
    await prisma.user.create({ data: { id: adminId, email: `${adminId}@example.test`, role: 'ADMIN' } });
  });

  beforeEach(() => {
    runner.verdicts = [];
    runner.down = false;
    runner.sent = [];
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.question.deleteMany({ where: { id: { in: created } } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it('a new question is a DRAFT and cannot be published before validation', async () => {
    const q = await draft();
    expect(q.status).toBe('DRAFT');
    await expect(questions.changeQuestionStatus(q.id, 'publish')).rejects.toThrow(/cannot be published/);
  });

  it('validation runs only the enabled test cases, then the question can be published', async () => {
    const q = await draft();
    const result = await validation.validateQuestion(q.id);
    expect(runner.sent[0]).toHaveLength(2);
    expect(result).toMatchObject({ ok: true, passedCount: 2, totalCount: 2, status: 'VALIDATED' });

    const published = await questions.changeQuestionStatus(q.id, 'publish');
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).not.toBeNull();
  });

  it('a failing test case blocks publishing and shows the admin expected vs actual', async () => {
    const q = await draft();
    runner.verdicts = [true, false];
    const result = await validation.validateQuestion(q.id);
    expect(result.ok).toBe(false);
    expect(result.results[1]).toMatchObject({
      testName: 'label exists',
      passed: false,
      expected: 'red',
      actual: 'blue',
    });
    const after = await row(q.id);
    expect(after.validation).toBe('FAILED');
    expect(after.status).toBe('DRAFT');
    await expect(questions.changeQuestionStatus(q.id, 'publish')).rejects.toThrow(/cannot be published/);
  });

  it('a runner outage leaves the validation state untouched', async () => {
    const q = await draft();
    await validation.validateQuestion(q.id);
    runner.down = true;
    await expect(validation.validateQuestion(q.id)).rejects.toMatchObject({ status: 503 });
    const after = await row(q.id);
    expect(after.validation).toBe('PASSED');
    expect(after.status).toBe('VALIDATED');
  });

  it('refuses to validate without a reference solution or without an enabled test', async () => {
    const noRef = await draft({ referenceHtml: null });
    await expect(validation.validateQuestion(noRef.id)).rejects.toThrow(/reference solution/);
  });

  it('editing the tests of a published question sends it back to DRAFT', async () => {
    const q = await draft();
    await validation.validateQuestion(q.id);
    await questions.changeQuestionStatus(q.id, 'publish');
    const tests = q.tests.map((t) => ({ ...t, enabled: true })); // enable the third test
    const { question } = await questions.updateQuestion(q.id, { tests } as never);
    expect(question.status).toBe('DRAFT');
    expect(question.validation).toBe('NOT_VALIDATED');
  });

  it('unpublish, archive and restore follow the transition rules', async () => {
    const q = await draft();
    await validation.validateQuestion(q.id);
    await questions.changeQuestionStatus(q.id, 'publish');
    expect((await questions.changeQuestionStatus(q.id, 'unpublish')).status).toBe('VALIDATED');
    expect((await questions.changeQuestionStatus(q.id, 'archive')).status).toBe('ARCHIVED');
    await expect(questions.updateQuestion(q.id, { title: 'Renamed' })).rejects.toThrow(/Restore/);
    await expect(questions.changeQuestionStatus(q.id, 'publish')).rejects.toThrow(/Restore/);
    expect((await questions.changeQuestionStatus(q.id, 'unarchive')).status).toBe('VALIDATED');
  });

  it('a draft may be saved unfinished, but validation and publishing enforce the full rules', async () => {
    const q = await draft({
      tests: [{ name: 'only', testType: 'DECLARATIVE', testCode: spec('#b'), order: 0, enabled: false }],
    });
    await expect(validation.validateQuestion(q.id)).rejects.toThrow(/enabled/);
    await expect(questions.changeQuestionStatus(q.id, 'publish')).rejects.toThrow(/enabled/);

    const empty = await draft({ tests: [] });
    expect(empty.status).toBe('DRAFT');
    await expect(validation.validateQuestion(empty.id)).rejects.toThrow(/at least one test/);
  });

  it('duplicate test names are rejected even for drafts (the database requires unique names)', async () => {
    await expect(
      draft({
        tests: [
          { name: 'same', testType: 'DECLARATIVE', testCode: spec('#a'), order: 0, enabled: true },
          { name: 'Same', testType: 'DECLARATIVE', testCode: spec('#b'), order: 1, enabled: true },
        ],
      }),
    ).rejects.toThrow(/duplicate/);
  });

  it('lists questions filtered by status', async () => {
    const q = await draft();
    const drafts = await questions.listQuestions({ page: 1, pageSize: 100, status: 'DRAFT', q: q.title });
    expect(drafts.items.map((i) => i.id)).toContain(q.id);
    const item = drafts.items.find((i) => i.id === q.id)!;
    expect(item.enabledTests).toBe(2);
    expect(item.marks).toBe(10);
  });

  it('blocks deleting a test case when graded results reference it', async () => {
    const q = await draft();
    const testCase = q.tests[0]!;
    const exam = await prisma.exam.create({ data: { title: `Test Exam ${Date.now()}` } });
    const session = await prisma.examSession.create({
      data: { userId: adminId, examId: exam.id, expiresAt: new Date(Date.now() + 3600_000) },
    });
    const attempt = await prisma.attempt.create({
      data: {
        userId: adminId,
        examId: exam.id,
        sessionId: session.id,
        questionId: q.id,
        snapshot: {},
      },
    });
    await prisma.testResult.create({
      data: {
        attemptId: attempt.id,
        testId: testCase.id,
        testName: testCase.name,
        passed: true,
      },
    });

    const remainingTests = q.tests.filter((t) => t.id !== testCase.id);
    await expect(questions.updateQuestion(q.id, { tests: remainingTests as never })).rejects.toThrow(
      /cannot be deleted because graded results are attached to it/,
    );

    // Cleanup exam and attempt
    await prisma.testResult.deleteMany({ where: { attemptId: attempt.id } });
    await prisma.attempt.delete({ where: { id: attempt.id } });
    await prisma.examSession.delete({ where: { id: session.id } });
    await prisma.exam.delete({ where: { id: exam.id } });
  });
});
