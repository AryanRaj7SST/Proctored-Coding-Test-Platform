import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * Nobody can write a score. Through the real route handlers (session from a
 * mocked lib/auth, everything else real): a student's code endpoints reject
 * any extra field such as `score`, the reviewer-feedback endpoint rejects one
 * too, and the stored score only ever comes from the server's own grading.
 */
const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock('@/lib/auth', () => ({ auth: async () => session.current }));

vi.mock('@/lib/runner-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/runner-client')>();
  return {
    ...actual,
    // One of two test cases passes: 5 / 10.
    runOnRunner: vi.fn(async (req: { spec: { tests: { id: string }[] } }) => ({
      runId: 'r',
      status: 'COMPLETED',
      durationMs: 1,
      consoleLogs: [],
      results: req.spec.tests.map((t, i) => ({ id: t.id, testName: 'x', passed: i === 0, durationMs: 1 })),
    })),
  };
});

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('score integrity (requires DATABASE_URL)', { timeout: 120_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  const stamp = Date.now();
  const questionId = `it-si-q-${stamp}`;
  const examId = `it-si-exam-${stamp}`;
  const studentId = `it-si-s-${stamp}`;
  const adminId = `it-si-admin-${stamp}`;
  let attemptId = '';

  const asStudent = () => {
    session.current = { user: { id: studentId, email: `${studentId}@example.test`, role: 'STUDENT' } };
  };
  const asAdmin = () => {
    session.current = { user: { id: adminId, email: `${adminId}@example.test`, role: 'ADMIN' } };
  };
  const call = (method: string, body?: unknown) =>
    new Request('http://localhost/api/x', {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const withId = () => ({ params: Promise.resolve({ id: attemptId }) });
  const code = { html: '<div id="a"></div>', css: '', js: '' };
  const storedScore = async () =>
    (await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } })).score;

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    await prisma.user.create({
      data: { id: studentId, email: `${studentId}@example.test`, role: 'STUDENT' },
    });
    await prisma.user.create({ data: { id: adminId, email: `${adminId}@example.test`, role: 'ADMIN' } });
    await prisma.question.create({
      data: {
        id: questionId,
        title: 'Integrity question',
        slug: questionId,
        description: 'd',
        marks: 10,
        tests: {
          create: [0, 1].map((i) => ({
            name: `t${i}`,
            testCode: JSON.stringify({ assertions: [{ type: 'exists', selector: `#el${i}` }] }),
            order: i,
          })),
        },
      },
    });
    await prisma.exam.create({
      data: {
        id: examId,
        title: 'Integrity',
        status: 'PUBLISHED',
        durationMinutes: 30,
        questions: { create: [{ questionId, order: 0, marks: 10 }] },
      },
    });
    const sessions = await import('@/server/services/sessions');
    const attempts = await import('@/server/services/attempts');
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const sitting = await sessions.startExamSession(exam, studentId);
    const [first] = await attempts.ensureAttempts(sitting);
    attemptId = first!.attempt.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    session.current = null;
    await prisma.exam.deleteMany({ where: { id: examId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, adminId] } } });
    await prisma.$disconnect();
  });

  it('saving code with a score field is a 400, and nothing is stored', async () => {
    asStudent();
    const { PATCH } = await import('@/app/api/attempts/[id]/route');
    const res = await PATCH(call('PATCH', { ...code, score: 10, maxScore: 10 }), withId());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(Number(await storedScore())).toBe(0);
    // The same body without the extra field saves normally.
    expect((await PATCH(call('PATCH', code), withId())).status).toBe(200);
  });

  it('running with a score field is a 400', async () => {
    asStudent();
    const { POST } = await import('@/app/api/attempts/[id]/run/route');
    const res = await POST(call('POST', { ...code, score: 10 }), withId());
    expect(res.status).toBe(400);
  });

  it('submitting with a score field is a 400; a normal submit is graded by the server (5 / 10)', async () => {
    asStudent();
    const { POST } = await import('@/app/api/attempts/[id]/submit/route');
    const forged = await POST(call('POST', { score: 10 }), withId());
    expect(forged.status).toBe(400);
    const res = await POST(call('POST', code), withId());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ score: 5, maxScore: 10 });
    expect(Number(await storedScore())).toBe(5);
  });

  it('a student cannot reach the reviewer endpoint; an admin cannot write a score through it', async () => {
    const { PATCH } = await import('@/app/api/admin/attempts/[id]/route');
    asStudent();
    expect((await PATCH(call('PATCH', { feedback: 'x', score: 10 }), withId())).status).toBe(403);
    asAdmin();
    const res = await PATCH(call('PATCH', { feedback: 'Good start.', score: 10 }), withId());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await PATCH(call('PATCH', { feedback: 'Good start.' }), withId())).status).toBe(200);
    expect(Number(await storedScore())).toBe(5);
  });
});
