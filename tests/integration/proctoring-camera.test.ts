import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * Proctoring events on the server: each belongs to the right student's
 * current sitting, only violations are counted, nothing is recorded after a
 * sitting closes, and no proctoring event can change a score. Real
 * PostgreSQL; the runner mock passes every test case.
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

describeDb('proctoring: camera and clipboard events (requires DATABASE_URL)', { timeout: 120_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let proctoring: typeof import('@/server/services/proctoring');
  let sessions: typeof import('@/server/services/sessions');
  let attempts: typeof import('@/server/services/attempts');

  const stamp = Date.now();
  const questionId = `it-pc-q-${stamp}`;
  const examId = `it-pc-exam-${stamp}`;
  const [alice, bob, carol] = ['a', 'b', 'c'].map((x) => `it-pc-${x}-${stamp}`);

  const record = (userId: string, type: string, metadata?: Record<string, string>) =>
    proctoring.recordProctorEvent({ userId, examId, type: type as never, ...(metadata ? { metadata } : {}) });
  const sittingOf = (userId: string) => prisma.examSession.findFirstOrThrow({ where: { examId, userId } });
  const eventsOf = (userId: string) =>
    prisma.proctorEvent.findMany({ where: { examId, userId }, orderBy: { occurredAt: 'asc' } });
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    proctoring = await import('@/server/services/proctoring');
    sessions = await import('@/server/services/sessions');
    attempts = await import('@/server/services/attempts');
    for (const id of [alice, bob, carol]) {
      await prisma.user.create({ data: { id, email: `${id}@example.test`, role: 'STUDENT' } });
    }
    await prisma.question.create({
      data: {
        id: questionId,
        title: 'Proctoring question',
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
        title: 'Proctoring',
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
    await prisma.user.deleteMany({ where: { id: { in: [alice, bob, carol] } } });
    await prisma.$disconnect();
  });

  it('a camera failure before the test starts belongs to no sitting and counts for nothing', async () => {
    const res = await record(alice, 'CAMERA_PERMISSION_DENIED', { reason: 'DENIED' });
    expect(res).toMatchObject({ recorded: true, violationCount: 0, message: null });
    const [event] = await eventsOf(alice);
    expect(event).toMatchObject({ type: 'CAMERA_PERMISSION_DENIED', sessionId: null, violation: false });
  });

  it("camera events land on the student's own sitting; only a stopped camera is a violation", async () => {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const a = await sessions.startExamSession(exam, alice);
    const b = await sessions.startExamSession(exam, bob);

    await record(alice, 'CAMERA_PERMISSION_GRANTED');
    const stopped = await record(alice, 'CAMERA_STREAM_STOPPED');
    expect(stopped).toMatchObject({ recorded: true, violationCount: 1 });
    expect(stopped.message).toMatch(/Camera access is required/);
    await record(alice, 'CAMERA_RESTORED');
    await record(bob, 'CAMERA_PERMISSION_GRANTED');

    const aliceEvents = (await eventsOf(alice)).filter((e) => e.sessionId && e.type.startsWith('CAMERA_'));
    expect(aliceEvents.map((e) => e.type)).toEqual([
      'CAMERA_PERMISSION_GRANTED',
      'CAMERA_STREAM_STOPPED',
      'CAMERA_RESTORED',
    ]);
    expect(aliceEvents.every((e) => e.sessionId === a.id)).toBe(true);
    expect((await sittingOf(alice)).violationCount).toBe(1);
    // Nothing of Alice's is on Bob's sitting, and his count is untouched.
    const onBob = await prisma.proctorEvent.findMany({ where: { sessionId: b.id } });
    expect(onBob.every((e) => e.userId === bob)).toBe(true);
    expect((await sittingOf(bob)).violationCount).toBe(0);
  });

  it('a repeated report of the same stop is one violation (the browser may retry)', async () => {
    await pause(1600); // outside the previous test's dedupe window
    const first = await record(alice, 'CAMERA_STREAM_STOPPED');
    const repeat = await record(alice, 'CAMERA_STREAM_STOPPED');
    expect(first.recorded).toBe(true);
    expect(repeat).toMatchObject({ recorded: false, reason: 'duplicate-same-type' });
    expect((await sittingOf(alice)).violationCount).toBe(2);
  });

  it('one tab switch (hidden + blur together) is one violation', async () => {
    await pause(1600); // outside the previous window
    await record(bob, 'TAB_HIDDEN');
    const blur = await record(bob, 'WINDOW_BLUR');
    expect(blur).toMatchObject({ recorded: false, reason: 'duplicate-leave' });
    expect((await sittingOf(bob)).violationCount).toBe(1);
  });

  it('proctoring events never change a score: both students are graded on their code alone', async () => {
    for (const type of ['COPY', 'PASTE', 'FULLSCREEN_EXIT', 'CONTEXT_MENU']) {
      await record(alice, type, { via: 'keyboard' });
      await pause(20);
    }
    const scores: Record<string, number> = {};
    for (const userId of [alice, bob]) {
      const session = await sessions.currentSession(examId, userId);
      const [{ attempt }] = await attempts.ensureAttempts(session!);
      const res = await attempts.submitAttempt({ attemptId: attempt.id, userId });
      scores[userId] = Number(res.score);
    }
    expect(scores[alice]).toBe(10);
    expect(scores[bob]).toBe(10);
    expect((await sittingOf(alice)).violationCount).toBeGreaterThan((await sittingOf(bob)).violationCount);
  });

  it('after the sitting closes, nothing more is recorded against it', async () => {
    const { endExam } = await import('@/server/services/finalization');
    await endExam(examId, alice); // submitting every question never ends a test; End Test does
    const closed = await sittingOf(alice);
    expect(closed.endedAt).not.toBeNull();
    const before = await prisma.proctorEvent.count({ where: { sessionId: closed.id } });
    const res = await record(alice, 'CAMERA_STREAM_STOPPED');
    expect(res).toMatchObject({ recorded: false, sittingClosed: true });
    expect(await prisma.proctorEvent.count({ where: { sessionId: closed.id } })).toBe(before);
  });

  it("a student with no sitting on this test never gets another student's events", async () => {
    await record(carol, 'CAMERA_UNAVAILABLE', { reason: 'UNAVAILABLE' });
    const mine = await eventsOf(carol);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ sessionId: null, userId: carol });
  });
});
