import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Integration coverage for the rules that only exist once a database is
 * involved: attempt snapshotting, autosave conflict handling, submit
 * idempotency and proctor-event deduplication.
 *
 * Skipped entirely without DATABASE_URL so the default test run stays hermetic.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

// Generous per-test budget: a remote database (e.g. Neon) costs ~250 ms per
// round trip, and some tests make 20+ sequential queries.
describeDb('attempt lifecycle (requires DATABASE_URL)', { timeout: 60_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let questions: typeof import('@/server/services/questions');
  let attempts: typeof import('@/server/services/attempts');
  let proctoring: typeof import('@/server/services/proctoring');

  const ids = {
    user: `it-user-${Date.now()}`,
    exam: `it-exam-${Date.now()}`,
    question: `it-question-${Date.now()}`,
  };

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    questions = await import('@/server/services/questions');
    attempts = await import('@/server/services/attempts');
    proctoring = await import('@/server/services/proctoring');

    await prisma.user.create({
      data: { id: ids.user, email: `${ids.user}@example.test`, role: 'STUDENT', name: 'Integration Student' },
    });

    const question = await prisma.question.create({
      data: {
        id: ids.question,
        title: 'Integration question',
        slug: ids.question,
        description: 'Make the box exist.',
        starterHtml: '<div id="box"></div>',
        marks: 10,
        version: 1,
        tests: {
          create: [
            {
              name: 'box exists',
              testType: 'DECLARATIVE',
              testCode: JSON.stringify({ assertions: [{ type: 'exists', selector: '#box' }] }),
              order: 0,
            },
          ],
        },
      },
      include: { tests: true },
    });

    const exam = await prisma.exam.create({
      data: {
        id: ids.exam,
        title: 'Integration exam',
        durationMinutes: 30,
        status: 'PUBLISHED',
        questions: { create: [{ questionId: question.id, order: 0, marks: 10 }] },
        assignments: { create: [{ userId: ids.user, email: `${ids.user}@example.test` }] },
      },
    });
    // Attempts only exist inside a sitting.
    await (await import('@/server/services/sessions')).startExamSession(exam, ids.user);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.exam.deleteMany({ where: { id: ids.exam } });
    await prisma.question.deleteMany({ where: { id: ids.question } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.$disconnect();
  });

  it('freezes a snapshot of the question when the attempt is created', async () => {
    const attempt = await attempts.getOrCreateAttempt(ids.exam, ids.question, ids.user);
    const snapshot = questions.snapshotOf(attempt);
    expect(snapshot.questionId).toBe(ids.question);
    expect(snapshot.tests).toHaveLength(1);
    expect(snapshot.tests[0]).toMatchObject({ name: 'box exists', enabled: true });
    expect(snapshot.tests[0]?.testCode).toContain('#box');
    // Marks come from the test (ExamQuestion.marks), never from the snapshot.
    expect(Number(attempt.maxScore)).toBe(10);
  });

  it('returns the same attempt on a second open rather than creating a duplicate', async () => {
    const first = await attempts.getOrCreateAttempt(ids.exam, ids.question, ids.user);
    const second = await attempts.getOrCreateAttempt(ids.exam, ids.question, ids.user);
    expect(second.id).toBe(first.id);
    const count = await prisma.attempt.count({ where: { userId: ids.user, examId: ids.exam } });
    expect(count).toBe(1);
  });

  it('keeps the snapshot even after the question is edited', async () => {
    const attempt = await attempts.getOrCreateAttempt(ids.exam, ids.question, ids.user);
    await questions.updateQuestion(ids.question, { description: 'Completely different wording.' });

    const reloaded = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    const snapshot = questions.snapshotOf(reloaded);
    expect(snapshot.description).toBe('Make the box exist.');

    const fresh = await prisma.question.findUniqueOrThrow({ where: { id: ids.question } });
    expect(fresh.version).toBeGreaterThan(snapshot.version);
    // Editing invalidates a previous validation pass.
    expect(fresh.validation).toBe('NOT_VALIDATED');
  });

  it('autosaves only when the code actually changed', async () => {
    const attempt = await attempts.getOrCreateAttempt(ids.exam, ids.question, ids.user);
    const code = { html: '<div id="box"></div>', css: 'body{}', js: '' };
    const first = await attempts.saveAttemptCode(attempt.id, ids.user, code);
    expect(first.saved).toBe(true);
    const second = await attempts.saveAttemptCode(attempt.id, ids.user, code);
    expect(second.saved).toBe(false);
  });

  it("refuses to autosave another student's attempt", async () => {
    const attempt = await attempts.getOrCreateAttempt(ids.exam, ids.question, ids.user);
    await expect(
      attempts.saveAttemptCode(attempt.id, 'someone-else', { html: 'x', css: '', js: '' }),
    ).rejects.toThrow(/not found/i);
  });

  it('deduplicates the blur + visibilitychange pair into a single violation', async () => {
    // One tab switch makes the browser fire both events in the same tick, so
    // they are sent together. (Awaiting one before sending the other made this
    // test depend on database latency: each call is ~9 round trips, which on a
    // remote database exceeds the 1.5 s dedupe window by itself.)
    const before = await proctoring.countViolations(ids.user, ids.exam);
    await Promise.all([
      proctoring.recordProctorEvent({ userId: ids.user, examId: ids.exam, type: 'TAB_HIDDEN' }),
      proctoring.recordProctorEvent({ userId: ids.user, examId: ids.exam, type: 'WINDOW_BLUR' }),
    ]);
    expect(await proctoring.countViolations(ids.user, ids.exam)).toBe(before + 1);

    // A genuinely separate, later tab switch still counts. Move the stored
    // pair outside the window instead of sleeping, so the result does not
    // depend on how fast the database is.
    await prisma.proctorEvent.updateMany({
      where: { userId: ids.user, examId: ids.exam, type: { in: ['TAB_HIDDEN', 'WINDOW_BLUR'] } },
      data: { occurredAt: new Date(Date.now() - 10_000) },
    });
    await proctoring.recordProctorEvent({ userId: ids.user, examId: ids.exam, type: 'WINDOW_BLUR' });
    expect(await proctoring.countViolations(ids.user, ids.exam)).toBe(before + 2);
  });

  it('recomputes the violation count from the database, not from the client', async () => {
    const result = await proctoring.recordProctorEvent({
      userId: ids.user,
      examId: ids.exam,
      type: 'PASTE',
    });
    const counted = await proctoring.countViolations(ids.user, ids.exam);
    expect(result.violationCount).toBe(counted);
  });
});
