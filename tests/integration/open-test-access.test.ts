import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * Open test access (hasOpenTestAccess): administrators and the listed tester
 * accounts are bound by neither the test window nor the attempt limit. Every
 * sitting is still timed and graded, and nothing is deleted. Students are
 * unaffected. Real PostgreSQL; the runner mock passes every test case.
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
const TESTER_EMAIL = 'agnihotriaryan5361@gmail.com';
const HOUR = 60 * 60_000;

describeDb('open test access (requires DATABASE_URL)', { timeout: 120_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let sessions: typeof import('@/server/services/sessions');
  let attempts: typeof import('@/server/services/attempts');
  let finalization: typeof import('@/server/services/finalization');
  let exams: typeof import('@/server/services/exams');

  const stamp = Date.now();
  const questionId = `it-oa-q-${stamp}`;
  const examIds: string[] = [];
  const ids = { admin: `it-oa-admin-${stamp}`, student: `it-oa-student-${stamp}` };
  let testerId = '';
  let createdTester = false;
  let seq = 0;

  async function newExam(overrides: Record<string, unknown>) {
    const id = `it-oa-exam-${stamp}-${(seq += 1)}`;
    examIds.push(id);
    return prisma.exam.create({
      data: {
        id,
        title: `Open access ${seq}`,
        durationMinutes: 30,
        maxAttempts: 1,
        status: 'PUBLISHED',
        questions: { create: [{ questionId, order: 0, marks: 10 }] },
        ...overrides,
      },
    });
  }

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    sessions = await import('@/server/services/sessions');
    attempts = await import('@/server/services/attempts');
    finalization = await import('@/server/services/finalization');
    exams = await import('@/server/services/exams');
    await prisma.user.create({ data: { id: ids.admin, email: `${ids.admin}@example.test`, role: 'ADMIN' } });
    await prisma.user.create({
      data: { id: ids.student, email: `${ids.student}@example.test`, role: 'STUDENT' },
    });
    const tester = await prisma.user.findUnique({ where: { email: TESTER_EMAIL } });
    if (tester) {
      testerId = tester.id;
    } else {
      testerId = (await prisma.user.create({ data: { email: TESTER_EMAIL, role: 'STUDENT' } })).id;
      createdTester = true;
    }
    await prisma.question.create({
      data: {
        id: questionId,
        title: 'Open access question',
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
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.exam.deleteMany({ where: { id: { in: examIds } } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    if (createdTester) await prisma.user.deleteMany({ where: { id: testerId } });
    await prisma.$disconnect();
  });

  it('is granted to administrators and the listed tester only', async () => {
    expect(sessions.hasOpenTestAccess({ role: 'ADMIN', email: 'x@example.test' })).toBe(true);
    expect(sessions.hasOpenTestAccess({ role: 'STUDENT', email: TESTER_EMAIL })).toBe(true);
    expect(sessions.hasOpenTestAccess({ role: 'STUDENT', email: TESTER_EMAIL.toUpperCase() })).toBe(true);
    expect(sessions.hasOpenTestAccess({ role: 'STUDENT', email: `x${TESTER_EMAIL}` })).toBe(false);
    expect(sessions.hasOpenTestAccess({ role: 'STUDENT', email: 's@example.test' })).toBe(false);
    expect(sessions.hasOpenTestAccess(null)).toBe(false);
  });

  it('a test that has not opened yet: students wait, open access may start', async () => {
    const exam = await newExam({ startTime: new Date(Date.now() + HOUR) });
    expect((await sessions.getExamTimeState(exam.id, ids.student, exam)).availability).toBe('NOT_STARTED');
    await expect(sessions.startExamSession(exam, ids.student)).rejects.toThrow(/not opened yet/);
    for (const userId of [ids.admin, testerId]) {
      expect((await sessions.getExamTimeState(exam.id, userId, exam)).availability).toBe('AVAILABLE');
      expect(await sessions.startExamSession(exam, userId)).toMatchObject({ attemptNumber: 1 });
    }
  });

  it('a closed test: students are refused; open access gets a full-length sitting that stays open', async () => {
    const exam = await newExam({
      startTime: new Date(Date.now() - 3 * HOUR),
      endTime: new Date(Date.now() - HOUR),
    });
    expect((await sessions.getExamTimeState(exam.id, ids.student, exam)).availability).toBe('ENDED');
    await expect(sessions.startExamSession(exam, ids.student)).rejects.toThrow(/closed/);

    const sitting = await sessions.startExamSession(exam, testerId);
    // Not cut short by the (past) closing time: the full 30 minutes.
    expect(sitting.expiresAt.getTime() - sitting.startedAt.getTime()).toBe(30 * 60_000);
    expect((await sessions.getExamTimeState(exam.id, testerId, exam)).availability).toBe('IN_PROGRESS');

    // The closed window alone never finalises it; work can be saved and submitted.
    await finalization.finalizeOverdueSittings({ examId: exam.id, limit: 50 });
    expect(await prisma.examSession.findUniqueOrThrow({ where: { id: sitting.id } })).toMatchObject({
      endedAt: null,
    });
    const [{ attempt }] = await attempts.ensureAttempts(sitting);
    await attempts.saveAttemptCode(attempt.id, testerId, { html: '<div id="a"></div>', css: '', js: '' });
    await attempts.submitAttempt({ attemptId: attempt.id, userId: testerId });
    const graded = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(graded.status).toBe('SUBMITTED');
    expect(Number(graded.score)).toBe(10);
  });

  it('an administrator-closed test (status ENDED) stays open to open access', async () => {
    const exam = await newExam({ status: 'ENDED' });
    expect((await sessions.getExamTimeState(exam.id, ids.student, exam)).availability).toBe('ENDED');
    expect((await sessions.getExamTimeState(exam.id, ids.admin, exam)).availability).toBe('AVAILABLE');
    const sitting = await sessions.startExamSession(exam, ids.admin);
    await finalization.finalizeOverdueSittings({ examId: exam.id, limit: 50 });
    expect(await prisma.examSession.findUniqueOrThrow({ where: { id: sitting.id } })).toMatchObject({
      endedAt: null,
    });
  });

  it('the attempt limit: students stop at maxAttempts; open access starts a new sitting and keeps the old one', async () => {
    const exam = await newExam({});
    for (const userId of [ids.student, testerId]) {
      const first = await sessions.startExamSession(exam, userId);
      const [{ attempt }] = await attempts.ensureAttempts(first);
      await attempts.submitAttempt({ attemptId: attempt.id, userId });
      await finalization.endExam(exam.id, userId);
    }
    expect((await sessions.getExamTimeState(exam.id, ids.student, exam)).availability).toBe('SUBMITTED');
    await expect(sessions.startExamSession(exam, ids.student)).rejects.toThrow(/already submitted/);

    expect((await sessions.getExamTimeState(exam.id, testerId, exam)).availability).toBe('AVAILABLE');
    const second = await sessions.startExamSession(exam, testerId);
    expect(second.attemptNumber).toBe(2);
    // The first sitting and its graded attempt are still there.
    const sittings = await prisma.examSession.findMany({
      where: { examId: exam.id, userId: testerId },
      orderBy: { attemptNumber: 'asc' },
      include: { attempts: true },
    });
    expect(sittings.map((s) => s.attemptNumber)).toEqual([1, 2]);
    expect(sittings[0]!.endedAt).not.toBeNull();
    expect(sittings[0]!.attempts[0]!.status).toBe('SUBMITTED');
  });

  it('an open-access sitting still expires on its own clock and is graded', async () => {
    const exam = await newExam({ status: 'ENDED' });
    const sitting = await sessions.startExamSession(exam, ids.admin);
    await attempts.ensureAttempts(sitting);
    await prisma.examSession.update({
      where: { id: sitting.id },
      data: { expiresAt: new Date(Date.now() - 10 * 60_000) },
    });
    await finalization.finalizeOverdueSittings({ examId: exam.id, limit: 50 });
    expect(
      (await prisma.examSession.findUniqueOrThrow({ where: { id: sitting.id } })).endedAt,
    ).not.toBeNull();
  });

  it('the dashboard shows the same availability', async () => {
    const exam = await newExam({ status: 'ENDED' });
    const forStudent = (await exams.listStudentExams(ids.student)).find((e) => e.id === exam.id);
    const forTester = (await exams.listStudentExams(testerId)).find((e) => e.id === exam.id);
    expect(forStudent?.availability).toBe('ENDED');
    expect(forTester?.availability).toBe('AVAILABLE');
  });
});
