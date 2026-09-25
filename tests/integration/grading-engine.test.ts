import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

/**
 * The grading model end to end, against real PostgreSQL:
 *   question score = marks x passed / enabled (decimal, rounded once)
 *   PASSED only when every enabled test passes
 *   sitting total, percentage and PASS/FAIL against the pass mark
 *   regrades keep history and are audited; runner failures never score
 * Only the runner HTTP call is replaced: `runner.verdicts[i]` decides test i.
 */

const runner = vi.hoisted(() => ({
  verdicts: [] as boolean[],
  mode: 'ok' as 'ok' | 'down' | 'slow',
  calls: [] as string[][],
}));

vi.mock('@/lib/runner-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/runner-client')>();
  return {
    ...actual,
    runOnRunner: vi.fn(async (req: { spec: { tests: { id: string }[] } }) => {
      const ids = req.spec.tests.map((t) => t.id);
      runner.calls.push(ids);
      if (runner.mode === 'down') throw new actual.RunnerError('UNAVAILABLE', 'down (test)');
      if (runner.mode === 'slow') await new Promise((r) => setTimeout(r, 150));
      return {
        runId: 'r',
        status: 'COMPLETED',
        durationMs: 1,
        consoleLogs: [],
        results: ids.map((id, i) => ({
          id,
          testName: id,
          passed: runner.verdicts[i] ?? false,
          durationMs: 1,
          ...(runner.verdicts[i]
            ? {}
            : { message: `Check ${i + 1} failed. Found: nothing.`, expected: 'x', actual: 'nothing' }),
        })),
      };
    }),
  };
});

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('grading engine (requires DATABASE_URL)', { timeout: 120_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let sessions: typeof import('@/server/services/sessions');
  let attempts: typeof import('@/server/services/attempts');
  let finalization: typeof import('@/server/services/finalization');
  let grading: typeof import('@/server/grading/grade-attempt');

  const stamp = Date.now();
  const questions: string[] = [];
  const exams: string[] = [];
  const users: string[] = [];
  let seq = 0;
  const next = (p: string) => `it-ge-${p}-${stamp}-${(seq += 1)}`;

  /** A question with `n` test cases, `disabled` of the last ones switched off. */
  async function newQuestion(marks: string, n: number, disabled = 0) {
    const id = next('q');
    questions.push(id);
    await prisma.question.create({
      data: {
        id,
        title: `Engine ${id}`,
        slug: id,
        description: 'd',
        marks,
        tests: {
          create: Array.from({ length: n }, (_, i) => ({
            name: `Test ${i + 1}`,
            testCode: JSON.stringify({ assertions: [{ type: 'exists', selector: `#el${i}` }] }),
            order: i,
            enabled: i < n - disabled,
          })),
        },
      },
    });
    return id;
  }

  /** A test over the given questions (marks default to each question's own), and one student sitting it. */
  async function sit(questionIds: string[], exam: Record<string, unknown> = {}) {
    const examId = next('exam');
    exams.push(examId);
    const qs = await prisma.question.findMany({ where: { id: { in: questionIds } } });
    const created = await prisma.exam.create({
      data: {
        id: examId,
        title: examId,
        durationMinutes: 30,
        status: 'PUBLISHED',
        questions: {
          create: questionIds.map((questionId, order) => ({
            questionId,
            order,
            marks: qs.find((q) => q.id === questionId)!.marks,
          })),
        },
        ...exam,
      },
    });
    const userId = next('user');
    users.push(userId);
    await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, role: 'STUDENT' } });
    await prisma.examAssignment.create({ data: { examId, userId, email: `${userId}@example.test` } });
    const session = await sessions.startExamSession(created, userId);
    const opened = await attempts.ensureAttempts(session);
    return { exam: created, userId, session, attempts: opened.map((o) => o.attempt) };
  }

  const reload = (id: string) => prisma.attempt.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    sessions = await import('@/server/services/sessions');
    attempts = await import('@/server/services/attempts');
    finalization = await import('@/server/services/finalization');
    grading = await import('@/server/grading/grade-attempt');
  });

  beforeEach(() => {
    runner.verdicts = [];
    runner.mode = 'ok';
    runner.calls = [];
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.exam.deleteMany({ where: { id: { in: exams } } });
    await prisma.question.deleteMany({ where: { id: { in: questions } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  describe('question score = marks x passed / enabled', () => {
    it.each([
      [5, '10', 'PASSED'],
      [4, '8', 'PARTIAL'],
      [3, '6', 'PARTIAL'],
      [2, '4', 'PARTIAL'],
      [1, '2', 'PARTIAL'],
      [0, '0', 'FAILED'],
    ])('10 marks, 5 tests, %i passing -> %s (%s)', async (passing, score, status) => {
      const q = await newQuestion('10', 5);
      const {
        exam,
        userId,
        attempts: [attempt],
      } = await sit([q]);
      runner.verdicts = Array.from({ length: 5 }, (_, i) => i < passing);
      await finalization.endExam(exam.id, userId);

      const graded = await reload(attempt!.id);
      expect(graded.score.toFixed(4)).toBe(Number(score).toFixed(4));
      expect(graded.maxScore.toFixed(4)).toBe('10.0000');
      expect(graded.resultStatus).toBe(status);
      expect(graded.passedCount).toBe(passing);
      expect(graded.enabledCount).toBe(5);

      const rows = await prisma.testResult.findMany({ where: { attemptId: attempt!.id, final: true } });
      expect(rows).toHaveLength(5);
      expect(rows.every((r) => r.points.toFixed(4) === '2.0000')).toBe(true);
      expect(rows.filter((r) => r.pointsAwarded.toFixed(4) === '2.0000')).toHaveLength(passing);
    });

    it('7 marks over 3 tests stores exact decimals', async () => {
      const q = await newQuestion('7', 3);
      const {
        exam,
        userId,
        attempts: [attempt],
      } = await sit([q]);
      runner.verdicts = [true, true, false];
      await finalization.endExam(exam.id, userId);
      const graded = await reload(attempt!.id);
      expect(graded.score.toFixed(4)).toBe('4.6667');
      expect(graded.resultStatus).toBe('PARTIAL');
    });

    it('disabled test cases are not run and not counted', async () => {
      const q = await newQuestion('10', 5, 1);
      const {
        exam,
        userId,
        attempts: [attempt],
      } = await sit([q]);
      runner.verdicts = [true, true, true, false];
      await finalization.endExam(exam.id, userId);
      expect(runner.calls[0]).toHaveLength(4);
      const graded = await reload(attempt!.id);
      expect(graded.enabledCount).toBe(4);
      expect(graded.score.toFixed(4)).toBe('7.5000');
    });

    it('a question with no enabled test case is never scored 0: grading stays pending', async () => {
      const q = await newQuestion('10', 2, 2);
      const {
        exam,
        userId,
        attempts: [attempt],
      } = await sit([q]);
      await finalization.endExam(exam.id, userId);
      const row = await reload(attempt!.id);
      expect(row.gradedAt).toBeNull();
      expect(row.status).toBe('SUBMITTED');
      expect(runner.calls).toHaveLength(0);
    });
  });

  describe('sitting totals', () => {
    it('sums question scores, computes the percentage and applies the pass mark', async () => {
      const q1 = await newQuestion('10', 5);
      const q2 = await newQuestion('10', 5);
      const { exam, userId, session } = await sit([q1, q2], { passingPercentage: '40' });
      runner.verdicts = [true, true, false, false, false]; // 4/10 on each question
      await finalization.endExam(exam.id, userId);
      const s = await prisma.examSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(s.score?.toFixed(4)).toBe('8.0000');
      expect(s.maxScore.toFixed(4)).toBe('20.0000');
      expect(s.percentage?.toFixed(4)).toBe('40.0000');
      expect(s.result).toBe('PASSED');
    });

    it('just below the pass mark fails', async () => {
      const q = await newQuestion('100', 100);
      const { exam, userId, session } = await sit([q], { passingPercentage: '40' });
      runner.verdicts = Array.from({ length: 100 }, (_, i) => i < 39);
      await finalization.endExam(exam.id, userId);
      const s = await prisma.examSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(s.score?.toFixed(4)).toBe('39.0000');
      expect(s.result).toBe('FAILED');
    });

    it('no total and no FAIL while any question is still pending', async () => {
      const q = await newQuestion('10', 2);
      const { exam, userId, session } = await sit([q]);
      runner.mode = 'down';
      await finalization.endExam(exam.id, userId);
      const s = await prisma.examSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(s.endedAt).not.toBeNull();
      expect(s.score).toBeNull();
      expect(s.result).toBeNull();
    });
  });

  describe('runner failures never become a score', () => {
    it('an outage leaves the attempt RUNNER_ERROR / pending, and a retry grades it', async () => {
      const q = await newQuestion('10', 2);
      const {
        exam,
        userId,
        attempts: [attempt],
      } = await sit([q]);
      runner.mode = 'down';
      await finalization.endExam(exam.id, userId);
      let row = await reload(attempt!.id);
      expect(row.gradedAt).toBeNull();
      expect(row.resultStatus).toBe('RUNNER_ERROR');
      expect(row.gradingError).toMatch(/UNAVAILABLE/);
      expect(Number(row.score)).toBe(0); // untouched default, never presented: gradedAt is null

      runner.mode = 'ok';
      runner.verdicts = [true, true];
      await grading.regradePendingAttempts({ attemptId: attempt!.id });
      row = await reload(attempt!.id);
      expect(row.resultStatus).toBe('PASSED');
      expect(row.score.toFixed(4)).toBe('10.0000');
      expect(row.gradingError).toBeNull();
    });

    it('a failed regrade keeps the existing grade', async () => {
      const q = await newQuestion('10', 2);
      const {
        exam,
        userId,
        attempts: [attempt],
      } = await sit([q]);
      runner.verdicts = [true, false];
      await finalization.endExam(exam.id, userId);

      runner.mode = 'down';
      const result = await grading.regradeAttempt(attempt!.id, { adminId: userId, reason: 'test outage' });
      expect(result.graded).toBe(false);
      const row = await reload(attempt!.id);
      expect(row.score.toFixed(4)).toBe('5.0000');
      expect(row.resultStatus).toBe('PARTIAL');
      expect(row.gradedAt).not.toBeNull();
    });
  });

  describe('regrading', () => {
    it('re-runs a partial attempt, keeps the earlier results as history, and audits before/after', async () => {
      const q = await newQuestion('10', 2);
      const {
        exam,
        userId,
        attempts: [attempt],
      } = await sit([q]);
      runner.verdicts = [true, false];
      await finalization.endExam(exam.id, userId);

      runner.verdicts = [true, true];
      const result = await grading.regradeAttempt(attempt!.id, { adminId: userId, reason: 'flaky runner' });
      expect(result).toMatchObject({
        graded: true,
        skipped: false,
        before: { score: 5 },
        after: { score: 10 },
      });

      const all = await prisma.testResult.findMany({ where: { attemptId: attempt!.id } });
      expect(all.filter((r) => r.final)).toHaveLength(2);
      expect(all.filter((r) => !r.final)).toHaveLength(2); // the superseded first grading
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'attempt.regraded', entityId: attempt!.id },
      });
      expect(audit.metadata).toMatchObject({
        reason: 'flaky runner',
        before: { score: 5 },
        after: { score: 10 },
      });
      const run = await prisma.testRun.findFirstOrThrow({
        where: { attemptId: attempt!.id, reason: 'regrade: flaky runner' },
      });
      expect(run.triggeredById).toBe(userId);
    });

    it('skips an attempt that already earned full marks unless forced', async () => {
      const q = await newQuestion('10', 2);
      const {
        exam,
        userId,
        attempts: [attempt],
      } = await sit([q]);
      runner.verdicts = [true, true];
      await finalization.endExam(exam.id, userId);
      const calls = runner.calls.length;

      const skipped = await grading.regradeAttempt(attempt!.id, { adminId: userId, reason: 'check' });
      expect(skipped.skipped).toBe(true);
      expect(runner.calls.length).toBe(calls);

      const forced = await grading.regradeAttempt(attempt!.id, {
        adminId: userId,
        reason: 'check',
        force: true,
      });
      expect(forced.graded).toBe(true);
      expect(runner.calls.length).toBe(calls + 1);
    });

    it('two concurrent gradings of one attempt: one runs, the other is refused', async () => {
      const q = await newQuestion('10', 2);
      const {
        exam,
        userId,
        attempts: [attempt],
      } = await sit([q]);
      runner.mode = 'down';
      await finalization.endExam(exam.id, userId); // claimed, grading pending
      runner.mode = 'slow';
      runner.verdicts = [true, false];
      runner.calls = [];

      const [a, b] = await Promise.all([
        grading.gradeAttempt(attempt!.id),
        grading.gradeAttempt(attempt!.id),
      ]);
      expect([a.graded, b.graded].sort()).toEqual([false, true]);
      expect([a.busy, b.busy]).toContain(true);
      expect(runner.calls).toHaveLength(1);
      expect(await prisma.testResult.count({ where: { attemptId: attempt!.id, final: true } })).toBe(2);
      expect((await reload(attempt!.id)).gradingLeaseUntil).toBeNull();
    });

    it('rejects regrading an attempt that is still in progress', async () => {
      const q = await newQuestion('10', 2);
      const {
        userId,
        attempts: [attempt],
      } = await sit([q]);
      await expect(grading.regradeAttempt(attempt!.id, { adminId: userId, reason: 'x' })).rejects.toThrow(
        /not been submitted/,
      );
    });
  });
});
