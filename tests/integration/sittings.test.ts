import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * Numbered sittings (Exam.maxAttempts), per-sitting violation counts and
 * pinned question snapshots. Real PostgreSQL; the runner always passes.
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

describeDb(
  'sittings, attempt limits and pinned snapshots (requires DATABASE_URL)',
  { timeout: 120_000 },
  () => {
    let prisma: typeof import('@/lib/prisma').prisma;
    let sessions: typeof import('@/server/services/sessions');
    let attempts: typeof import('@/server/services/attempts');
    let finalization: typeof import('@/server/services/finalization');
    let proctoring: typeof import('@/server/services/proctoring');
    let questions: typeof import('@/server/services/questions');

    const stamp = Date.now();
    const questionId = `it-st-q-${stamp}`;
    const exams: string[] = [];
    const users: string[] = [];
    let seq = 0;

    async function newExam(overrides: Record<string, unknown> = {}) {
      const id = `it-st-exam-${stamp}-${(seq += 1)}`;
      exams.push(id);
      return prisma.exam.create({
        data: {
          id,
          title: `Sittings ${seq}`,
          durationMinutes: 30,
          status: 'PUBLISHED',
          questions: { create: [{ questionId, order: 0, marks: 10 }] },
          ...overrides,
        },
      });
    }

    async function newStudent(examId: string) {
      const id = `it-st-user-${stamp}-${(seq += 1)}`;
      users.push(id);
      await prisma.user.create({ data: { id, email: `${id}@example.test`, role: 'STUDENT' } });
      await prisma.examAssignment.create({ data: { examId, userId: id, email: `${id}@example.test` } });
      return id;
    }

    beforeAll(async () => {
      prisma = (await import('@/lib/prisma')).prisma;
      sessions = await import('@/server/services/sessions');
      attempts = await import('@/server/services/attempts');
      finalization = await import('@/server/services/finalization');
      proctoring = await import('@/server/services/proctoring');
      questions = await import('@/server/services/questions');
      await prisma.question.create({
        data: {
          id: questionId,
          title: 'Sittings question',
          slug: questionId,
          description: 'Version one wording.',
          starterHtml: '<div id="box"></div>',
          marks: 10,
          tests: {
            create: [
              {
                name: 'box exists',
                testCode: JSON.stringify({ assertions: [{ type: 'exists', selector: '#box' }] }),
                order: 0,
              },
            ],
          },
        },
      });
    });

    afterAll(async () => {
      if (!prisma) return;
      await prisma.exam.deleteMany({ where: { id: { in: exams } } });
      await prisma.question.deleteMany({ where: { id: questionId } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.$disconnect();
    });

    it('with maxAttempts = 1 a finished sitting cannot be restarted', async () => {
      const exam = await newExam();
      const userId = await newStudent(exam.id);
      await sessions.startExamSession(exam, userId);
      await finalization.endExam(exam.id, userId);
      await expect(sessions.startExamSession(exam, userId)).rejects.toThrow(/already submitted/i);
      expect(await prisma.examSession.count({ where: { examId: exam.id, userId } })).toBe(1);
    });

    it('with maxAttempts = 2 a second, separate sitting starts after the first ends', async () => {
      const exam = await newExam({ maxAttempts: 2 });
      const userId = await newStudent(exam.id);

      const first = await sessions.startExamSession(exam, userId);
      const a1 = await attempts.getOrCreateAttempt(exam.id, questionId, userId);
      await finalization.endExam(exam.id, userId);

      const second = await sessions.startExamSession(exam, userId);
      expect(second.id).not.toBe(first.id);
      expect(second.attemptNumber).toBe(2);
      expect(Number(second.maxScore)).toBe(10);

      const a2 = await attempts.getOrCreateAttempt(exam.id, questionId, userId);
      expect(a2.id).not.toBe(a1.id);
      expect(a2.sessionId).toBe(second.id);
      expect(a2.status).toBe('IN_PROGRESS');
      // The first sitting's work is untouched.
      expect((await prisma.attempt.findUniqueOrThrow({ where: { id: a1.id } })).status).toBe('SUBMITTED');

      await finalization.endExam(exam.id, userId);
      await expect(sessions.startExamSession(exam, userId)).rejects.toThrow(
        'You have used all 2 attempts for this test.',
      );
    });

    it('resuming an open sitting never creates a second one', async () => {
      const exam = await newExam({ maxAttempts: 3 });
      const userId = await newStudent(exam.id);
      const [a, b] = await Promise.all([
        sessions.startExamSession(exam, userId),
        sessions.startExamSession(exam, userId),
      ]);
      expect(a.id).toBe(b.id);
      expect(await prisma.examSession.count({ where: { examId: exam.id, userId } })).toBe(1);
    });

    it('violations count per sitting: a new sitting starts from zero', async () => {
      const exam = await newExam({ maxAttempts: 2 });
      const userId = await newStudent(exam.id);
      await sessions.startExamSession(exam, userId);
      await proctoring.recordProctorEvent({ userId, examId: exam.id, type: 'TAB_HIDDEN' });
      expect(await proctoring.countViolations(userId, exam.id)).toBe(1);
      await finalization.endExam(exam.id, userId);

      await sessions.startExamSession(exam, userId);
      expect(await proctoring.countViolations(userId, exam.id)).toBe(0);
    });

    it('the live monitor shows remaining time only for open sittings, the final state otherwise', async () => {
      const monitor = await import('@/server/services/monitor');
      const exam = await newExam({ maxAttempts: 2 });
      const userId = await newStudent(exam.id);
      const first = await sessions.startExamSession(exam, userId);
      await finalization.endExam(exam.id, userId);
      const second = await sessions.startExamSession(exam, userId);

      const rows = await monitor.monitorSnapshot(exam.id);
      const ended = rows.find((r) => r.sessionId === first.id)!;
      const open = rows.find((r) => r.sessionId === second.id)!;
      expect(ended).toMatchObject({ status: 'SUBMITTED', msRemaining: null });
      expect(ended.endedAt).not.toBeNull();
      expect(open.endedAt).toBeNull();
      expect(open.msRemaining).toBeGreaterThan(0);
    });

    it('events outside any sitting count towards no one', async () => {
      const exam = await newExam();
      const [alice, bob] = [await newStudent(exam.id), await newStudent(exam.id)];
      const res = await proctoring.recordProctorEvent({ userId: alice, examId: exam.id, type: 'PASTE' });
      expect(res.violationCount).toBe(0);
      await sessions.startExamSession(exam, bob);
      expect(await proctoring.countViolations(bob, exam.id)).toBe(0);
    });

    it('every attempt in a test grades against the same pinned snapshot, even after the question changes', async () => {
      const exam = await newExam();
      const [first, second] = [await newStudent(exam.id), await newStudent(exam.id)];

      await sessions.startExamSession(exam, first);
      const a1 = await attempts.getOrCreateAttempt(exam.id, questionId, first);

      // The admin edits the question after the first student opened it.
      await prisma.question.update({
        where: { id: questionId },
        data: { description: 'Version two wording.', version: { increment: 1 } },
      });

      await sessions.startExamSession(exam, second);
      const a2 = await attempts.getOrCreateAttempt(exam.id, questionId, second);

      expect(questions.snapshotOf(a1).description).toBe('Version one wording.');
      expect(questions.snapshotOf(a2).description).toBe('Version one wording.');
      expect(a2.questionVersion).toBe(a1.questionVersion);

      const pinned = await prisma.examQuestion.findFirstOrThrow({ where: { examId: exam.id } });
      expect(pinned.pinnedAt).not.toBeNull();
      expect(pinned.questionVersion).toBe(a1.questionVersion);
    });
  },
);
