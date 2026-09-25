import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { RunnerRunResult } from '@shared/test-spec';

/**
 * Regression coverage for the exam-finalisation fixes:
 *   B1 timer expiry grades the sitting server-side
 *   B2 expired sittings are finalised even after the exam window closes
 *   B3 the violation limit is enforced by the server
 *   B4 PAGE_RELOAD is accepted and persisted
 *   B7 runner FAILED / TIMEOUT / malformed results never become a score
 *   B8 a runner outage during End Test leaves attempts "grading pending", not 0
 *
 * Real PostgreSQL (skipped without DATABASE_URL); only the runner HTTP call is
 * replaced so outages can be simulated deterministically.
 */

const runner = vi.hoisted(() => ({
  mode: 'pass' as
    'pass' | 'fail-all' | 'unavailable' | 'status-failed' | 'status-timeout' | 'partial' | 'malformed',
  calls: [] as { html: string; testIds: string[] }[],
}));

vi.mock('@/lib/runner-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/runner-client')>();
  return {
    ...actual,
    runOnRunner: vi.fn(async (req: { html: string; spec: { tests: { id: string }[] } }) => {
      const ids = req.spec.tests.map((t) => t.id);
      runner.calls.push({ html: req.html, testIds: ids });
      const base = { runId: 'r', durationMs: 5, consoleLogs: [] as string[] };
      switch (runner.mode) {
        case 'unavailable':
          throw new actual.RunnerError('UNAVAILABLE', 'Runner is unreachable (test).');
        case 'status-failed':
          return {
            ...base,
            status: 'FAILED',
            results: [{ id: ids[0], testName: 'x', passed: true, durationMs: 1 }],
          };
        case 'status-timeout':
          return { ...base, status: 'TIMEOUT', results: [] };
        case 'partial':
          return {
            ...base,
            status: 'COMPLETED',
            results: [{ id: ids[0], testName: 'x', passed: true, durationMs: 1 }],
          };
        case 'malformed':
          return {
            ...base,
            status: 'COMPLETED',
            results: ids.map((id) => ({ id, testName: 'x', durationMs: 1 })),
          };
        default:
          return {
            ...base,
            status: 'COMPLETED',
            results: ids.map((id) => ({ id, testName: 'x', passed: runner.mode === 'pass', durationMs: 1 })),
          } satisfies RunnerRunResult;
      }
    }),
  };
});

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('exam finalisation and grading (requires DATABASE_URL)', { timeout: 120_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let attempts: typeof import('@/server/services/attempts');
  let finalization: typeof import('@/server/services/finalization');
  let grading: typeof import('@/server/grading/grade-attempt');
  let runTests: typeof import('@/server/grading/run-tests');
  let sessions: typeof import('@/server/services/sessions');
  let proctoring: typeof import('@/server/services/proctoring');
  let timing: typeof import('@/lib/timing');
  let validation: typeof import('@/lib/validation');

  const stamp = Date.now();
  const questionId = `it-gl-q-${stamp}`;
  const createdExams: string[] = [];
  const createdUsers: string[] = [];
  let seq = 0;

  async function newExam(overrides: Record<string, unknown> = {}) {
    const id = `it-gl-exam-${stamp}-${(seq += 1)}`;
    createdExams.push(id);
    return prisma.exam.create({
      data: {
        id,
        title: `Grading lifecycle ${seq}`,
        durationMinutes: 30,
        status: 'PUBLISHED',
        questions: { create: [{ questionId, order: 0, marks: 10 }] },
        ...overrides,
      },
    });
  }

  async function newStudent(examId: string) {
    const id = `it-gl-user-${stamp}-${(seq += 1)}`;
    createdUsers.push(id);
    await prisma.user.create({ data: { id, email: `${id}@example.test`, role: 'STUDENT' } });
    await prisma.examAssignment.create({ data: { examId, userId: id, email: `${id}@example.test` } });
    return id;
  }

  /** Start a sitting and open the question, like POST /api/exams/:id/start. */
  async function sit(examOverrides: Record<string, unknown> = {}) {
    const exam = await newExam(examOverrides);
    const userId = await newStudent(exam.id);
    await sessions.startExamSession(exam, userId);
    const attempt = await attempts.getOrCreateAttempt(exam.id, questionId, userId);
    return { exam, userId, attempt };
  }

  /** Move the sitting's deadline into the past, beyond the grace window. */
  async function expire(examId: string, userId: string, msAgo = timingGrace() + 10_000) {
    await prisma.examSession.updateMany({
      where: { userId, examId },
      data: { expiresAt: new Date(Date.now() - msAgo) },
    });
  }
  const timingGrace = () => timing.SUBMIT_GRACE_MS;

  const attemptRow = (id: string) => prisma.attempt.findUniqueOrThrow({ where: { id } });
  const sessionRow = (examId: string, userId: string) =>
    prisma.examSession.findFirstOrThrow({ where: { userId, examId }, orderBy: { attemptNumber: 'desc' } });

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    attempts = await import('@/server/services/attempts');
    finalization = await import('@/server/services/finalization');
    grading = await import('@/server/grading/grade-attempt');
    runTests = await import('@/server/grading/run-tests');
    sessions = await import('@/server/services/sessions');
    proctoring = await import('@/server/services/proctoring');
    timing = await import('@/lib/timing');
    validation = await import('@/lib/validation');

    await prisma.question.create({
      data: {
        id: questionId,
        title: 'Grading lifecycle question',
        slug: questionId,
        description: 'Make the box exist.',
        starterHtml: '<div id="box"></div>',
        marks: 10,
        validation: 'PASSED',
        tests: {
          create: [
            {
              name: 'box exists',
              testType: 'DECLARATIVE',
              testCode: JSON.stringify({ assertions: [{ type: 'exists', selector: '#box' }] }),
              order: 0,
            },
            {
              name: 'box visible',
              testType: 'DECLARATIVE',
              testCode: JSON.stringify({ assertions: [{ type: 'visible', selector: '#box' }] }),
              order: 1,
            },
          ],
        },
      },
    });
  });

  beforeEach(() => {
    runner.mode = 'pass';
    runner.calls.length = 0;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.exam.deleteMany({ where: { id: { in: createdExams } } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.$disconnect();
  });

  /* ------------------------------------------------------------- B1 */

  describe('B1: timer expiry is finalised and graded by the server', () => {
    it('normal expiry: attempt AUTO_SUBMITTED, graded, sitting closed', async () => {
      const { exam, userId, attempt } = await sit();
      await expire(exam.id, userId);
      const res = await finalization.finalizeExpiredAttempts(exam.id, userId);

      const a = await attemptRow(attempt.id);
      expect(a.status).toBe('AUTO_SUBMITTED');
      expect(a.gradedAt).not.toBeNull();
      expect(Number(a.score)).toBe(10);
      expect(res).toMatchObject({ submittedCount: 1, gradedCount: 1, pendingCount: 0, closedSitting: true });
      const s = await sessionRow(exam.id, userId);
      expect(s.endedAt).not.toBeNull();
      expect(s.status).toBe('EXPIRED');
      const assignment = await prisma.examAssignment.findUniqueOrThrow({
        where: { examId_userId: { examId: exam.id, userId } },
      });
      expect(assignment.status).toBe('EXPIRED');
      expect(await finalization.sittingEndReason(exam.id, userId)).toBe('EXPIRED');
    });

    it('expiry with unsaved code: the final flush inside the grace window is saved and graded', async () => {
      const { exam, userId, attempt } = await sit();
      await expire(exam.id, userId, 1_000); // time is up, grace window still open

      const session = await sessionRow(exam.id, userId);
      expect(timing.sittingNeedsFinalization(exam, session)).toBe(false); // server waits for the flush

      const finalCode = { html: '<div id="box">final</div>', css: '', js: '' };
      // A practice run may not use the grace window...
      await expect(attempts.saveAttemptCode(attempt.id, userId, finalCode)).rejects.toThrow(/expired/i);
      // ...but the autosave flush may.
      await expect(
        attempts.saveAttemptCode(attempt.id, userId, finalCode, { allowGrace: true }),
      ).resolves.toMatchObject({ saved: true });

      await expire(exam.id, userId);
      await finalization.finalizeExpiredAttempts(exam.id, userId);
      expect(runner.calls.at(-1)?.html).toBe(finalCode.html);
      expect((await attemptRow(attempt.id)).html).toBe(finalCode.html);
    });

    it('expiry when the runner fails: submitted with grading pending, never scored 0', async () => {
      const { exam, userId, attempt } = await sit();
      await expire(exam.id, userId);
      runner.mode = 'unavailable';
      const res = await finalization.finalizeExpiredAttempts(exam.id, userId);

      const a = await attemptRow(attempt.id);
      expect(a.status).toBe('AUTO_SUBMITTED');
      expect(a.gradedAt).toBeNull(); // grading pending
      expect(res.pendingCount).toBe(1);
      expect(await prisma.testResult.count({ where: { attemptId: attempt.id, final: true } })).toBe(0);
      const run = await prisma.testRun.findFirstOrThrow({
        where: { attemptId: attempt.id, kind: 'SUBMISSION' },
      });
      expect(run.status).toBe('FAILED');
      expect((await sessionRow(exam.id, userId)).endedAt).not.toBeNull();
    });

    it('duplicate expiry requests grade each attempt exactly once', async () => {
      const { exam, userId, attempt } = await sit();
      await expire(exam.id, userId);
      const results = await Promise.all([
        finalization.finalizeExpiredAttempts(exam.id, userId),
        finalization.finalizeExpiredAttempts(exam.id, userId),
        finalization.finalizeExpiredAttempts(exam.id, userId),
      ]);
      expect(runner.calls.length).toBe(1);
      expect(results.reduce((n, r) => n + r.submittedCount, 0)).toBe(1);
      expect(results.filter((r) => r.closedSitting).length).toBe(1);
      expect(
        await prisma.proctorEvent.count({ where: { userId, examId: exam.id, type: 'EXAM_SUBMITTED' } }),
      ).toBe(1);
      expect(await prisma.testResult.count({ where: { attemptId: attempt.id, final: true } })).toBe(2);
    });

    it('an already-submitted attempt is not re-graded at expiry', async () => {
      const { exam, userId, attempt } = await sit();
      const submitted = await attempts.submitAttempt({ attemptId: attempt.id, userId });
      expect(submitted.gradingPending).toBe(false);
      expect(Number(submitted.score)).toBe(10);
      const callsAfterSubmit = runner.calls.length;

      await expire(exam.id, userId);
      runner.mode = 'fail-all'; // would change the score if it re-graded
      await finalization.finalizeExpiredAttempts(exam.id, userId);
      expect(runner.calls.length).toBe(callsAfterSubmit);
      const a = await attemptRow(attempt.id);
      expect(a.status).toBe('SUBMITTED');
      expect(Number(a.score)).toBe(10);
    });

    it('closed browser: the sweep finalises an abandoned sitting without any client call', async () => {
      const { exam, userId, attempt } = await sit();
      await expire(exam.id, userId);
      const n = await finalization.finalizeOverdueSittings({ userId });
      expect(n).toBe(1);
      expect((await attemptRow(attempt.id)).status).toBe('AUTO_SUBMITTED');
      expect(await finalization.finalizeOverdueSittings({ userId })).toBe(0); // idempotent
    });
  });

  /* ------------------------------------------------------------- B2 */

  describe('B2: expired sittings are finalised even when the exam has ended', () => {
    it('exam endTime passes while the sitting is active: finalised, cannot resume', async () => {
      // The sitting's deadline is capped at the exam's endTime (computeExpiry).
      const { exam, userId, attempt } = await sit({ endTime: new Date(Date.now() + 2 * 60_000) });
      expect((await sessionRow(exam.id, userId)).expiresAt.getTime()).toBe(exam.endTime!.getTime());
      // ...then time passes beyond both.
      const past = new Date(Date.now() - 60_000);
      const closed = await prisma.exam.update({ where: { id: exam.id }, data: { endTime: past } });
      await prisma.examSession.updateMany({
        where: { userId, examId: exam.id },
        data: { expiresAt: past },
      });
      const state = await sessions.getExamTimeState(exam.id, userId, closed);
      // Before the fix this read ENDED and the start route never finalised it.
      expect(state.availability).toBe('EXPIRED');
      expect(timing.sittingNeedsFinalization(closed, state.session)).toBe(true);

      await finalization.finalizeExpiredAttempts(exam.id, userId);
      expect((await attemptRow(attempt.id)).status).toBe('AUTO_SUBMITTED');
      await expect(sessions.startExamSession(closed, userId)).rejects.toThrow(/expired/i);
    });

    it('exam window shortened below an open sitting: ENDED, and still finalised', async () => {
      const { exam, userId, attempt } = await sit();
      const shortened = await prisma.exam.update({
        where: { id: exam.id },
        data: { endTime: new Date(Date.now() - 60_000) },
      });
      const state = await sessions.getExamTimeState(exam.id, userId, shortened);
      expect(state.availability).toBe('ENDED');
      expect(timing.sittingNeedsFinalization(shortened, state.session)).toBe(true);
      await finalization.finalizeExpiredAttempts(exam.id, userId);
      expect((await attemptRow(attempt.id)).status).toBe('AUTO_SUBMITTED');
    });

    it('admin ends the exam mid-sitting: finalised as EXAM_CLOSED', async () => {
      const { exam, userId, attempt } = await sit();
      const ended = await prisma.exam.update({ where: { id: exam.id }, data: { status: 'ENDED' } });
      const state = await sessions.getExamTimeState(exam.id, userId, ended);
      expect(timing.sittingNeedsFinalization(ended, state.session)).toBe(true);
      await finalization.finalizeExpiredAttempts(exam.id, userId);
      expect((await attemptRow(attempt.id)).gradedAt).not.toBeNull();
      expect(await finalization.sittingEndReason(exam.id, userId)).toBe('EXAM_CLOSED');
    });

    it('exam ended with no attempt: a new sitting cannot start', async () => {
      const exam = await newExam({ endTime: new Date(Date.now() - 60_000) });
      const userId = await newStudent(exam.id);
      await expect(sessions.startExamSession(exam, userId)).rejects.toThrow(/closed/i);
      expect(await prisma.examSession.count({ where: { examId: exam.id, userId } })).toBe(0);
    });

    it('already expired + already finalised: resume is refused and nothing re-grades', async () => {
      const { exam, userId } = await sit();
      await expire(exam.id, userId);
      await finalization.finalizeExpiredAttempts(exam.id, userId);
      const calls = runner.calls.length;
      await expect(sessions.startExamSession(exam, userId)).rejects.toThrow(/expired/i);
      await finalization.finalizeExpiredAttempts(exam.id, userId);
      expect(runner.calls.length).toBe(calls);
    });
  });

  /* ------------------------------------------------------------- B3 */

  describe('B3: the server enforces Exam.maxViolations', () => {
    const violation = (
      examId: string,
      userId: string,
      type: 'TAB_HIDDEN' | 'PASTE' | 'FULLSCREEN_EXIT' | 'PAGE_RELOAD',
    ) => proctoring.recordProctorEvent({ userId, examId, type });

    it('below the limit: the sitting stays open', async () => {
      const { exam, userId } = await sit({ maxViolations: 3 });
      await violation(exam.id, userId, 'TAB_HIDDEN');
      await violation(exam.id, userId, 'PASTE');
      expect(await finalization.enforceViolationLimit(exam, userId)).toBe(false);
      expect((await sessionRow(exam.id, userId)).endedAt).toBeNull();
    });

    it('exactly at the limit: sitting closed, open attempts auto-submitted and graded', async () => {
      const { exam, userId, attempt } = await sit({ maxViolations: 3 });
      await violation(exam.id, userId, 'TAB_HIDDEN');
      await violation(exam.id, userId, 'PASTE');
      await violation(exam.id, userId, 'FULLSCREEN_EXIT');
      expect(await finalization.enforceViolationLimit(exam, userId)).toBe(true);
      const a = await attemptRow(attempt.id);
      expect(a.status).toBe('AUTO_SUBMITTED');
      expect(a.gradedAt).not.toBeNull();
      expect(await finalization.sittingEndReason(exam.id, userId)).toBe('VIOLATION_LIMIT');
    });

    it('above the limit / repeated requests: later events are not recorded and change nothing', async () => {
      const { exam, userId } = await sit({ maxViolations: 1 });
      await violation(exam.id, userId, 'TAB_HIDDEN');
      expect(await finalization.enforceViolationLimit(exam, userId)).toBe(true);
      const calls = runner.calls.length;
      const late = await violation(exam.id, userId, 'PASTE');
      expect(late).toMatchObject({ recorded: false, sittingClosed: true, violationCount: 1 });
      expect(await finalization.enforceViolationLimit(exam, userId)).toBe(false); // already closed
      expect(runner.calls.length).toBe(calls);
    });

    it('concurrent violation events are counted atomically and close the sitting once', async () => {
      const { exam, userId } = await sit({ maxViolations: 3 });
      const types = ['TAB_HIDDEN', 'PASTE', 'FULLSCREEN_EXIT', 'PAGE_RELOAD'] as const;
      await Promise.all(
        types.map(async (t) => {
          await violation(exam.id, userId, t);
          await finalization.enforceViolationLimit(exam, userId);
        }),
      );
      expect(runner.calls.length).toBe(1); // one attempt, graded once
      expect(
        await prisma.proctorEvent.count({ where: { userId, examId: exam.id, type: 'EXAM_SUBMITTED' } }),
      ).toBe(1);
      expect((await sessionRow(exam.id, userId)).endedAt).not.toBeNull();
    });

    it('concurrent blur + visibilitychange for one tab switch count as a single violation', async () => {
      const { exam, userId } = await sit();
      const before = await proctoring.countViolations(userId, exam.id);
      await Promise.all([
        proctoring.recordProctorEvent({ userId, examId: exam.id, type: 'TAB_HIDDEN' }),
        proctoring.recordProctorEvent({ userId, examId: exam.id, type: 'WINDOW_BLUR' }),
      ]);
      expect(await proctoring.countViolations(userId, exam.id)).toBe(before + 1);
    });

    it('resume after max violations is refused with a clear reason', async () => {
      const { exam, userId } = await sit({ maxViolations: 1 });
      await violation(exam.id, userId, 'TAB_HIDDEN');
      await finalization.enforceViolationLimit(exam, userId);
      await expect(sessions.startExamSession(exam, userId)).rejects.toThrow(/violation limit/i);
    });

    it('the limit is disabled when maxViolations is 0', async () => {
      const { exam, userId } = await sit({ maxViolations: 0 });
      for (const t of ['TAB_HIDDEN', 'PASTE', 'FULLSCREEN_EXIT'] as const)
        await violation(exam.id, userId, t);
      expect(await finalization.enforceViolationLimit(exam, userId)).toBe(false);
    });

    it('malformed / invalid violation requests are rejected by validation', () => {
      const base = { examId: 'c0000000000000000000000000' };
      expect(validation.proctorEventInput.safeParse({ ...base, type: 'NOT_A_REAL_EVENT' }).success).toBe(
        false,
      );
      expect(validation.proctorEventInput.safeParse({ type: 'TAB_HIDDEN' }).success).toBe(false);
      expect(validation.proctorEventInput.safeParse({ ...base, type: 'EXAM_SUBMITTED' }).success).toBe(false);
      expect(
        validation.proctorEventInput.safeParse({ ...base, type: 'TAB_HIDDEN', durationMs: -5 }).success,
      ).toBe(false);
    });
  });

  /* ------------------------------------------------------------- B4 */

  describe('B4: PAGE_RELOAD is accepted and persisted', () => {
    it('passes validation and is stored as a violation', async () => {
      const { exam, userId, attempt } = await sit();
      expect(
        validation.proctorEventInput.safeParse({
          examId: exam.id,
          attemptId: attempt.id,
          type: 'PAGE_RELOAD',
        }).success,
      ).toBe(true);
      const res = await proctoring.recordProctorEvent({
        userId,
        examId: exam.id,
        attemptId: attempt.id,
        type: 'PAGE_RELOAD',
      });
      expect(res.recorded).toBe(true);
      expect(res.message).toMatch(/recorded/i);
      const stored = await prisma.proctorEvent.findFirstOrThrow({
        where: { userId, examId: exam.id, type: 'PAGE_RELOAD' },
      });
      expect(stored.violation).toBe(true);
      expect(stored.attemptId).toBe(attempt.id);
    });

    it("rejects an event that names another student's attempt", async () => {
      const { exam, attempt } = await sit();
      const intruder = await newStudent(exam.id);
      await expect(
        proctoring.recordProctorEvent({
          userId: intruder,
          examId: exam.id,
          attemptId: attempt.id,
          type: 'PAGE_RELOAD',
        }),
      ).rejects.toThrow(/not found/i);
    });

    it('does not record events once the sitting has ended', async () => {
      const { exam, userId } = await sit();
      await finalization.endExam(exam.id, userId);
      const res = await proctoring.recordProctorEvent({ userId, examId: exam.id, type: 'PAGE_RELOAD' });
      expect(res).toMatchObject({ recorded: false, sittingClosed: true });
      expect(
        await prisma.proctorEvent.count({ where: { userId, examId: exam.id, type: 'PAGE_RELOAD' } }),
      ).toBe(0);
    });
  });

  /* ------------------------------------------------------------- B7 */

  describe('B7: runner failures never become a score', () => {
    const cases = [
      ['status-failed', 'RUNNER_UNAVAILABLE', 'FAILED'],
      ['status-timeout', 'RUNNER_TIMEOUT', 'TIMEOUT'],
      ['unavailable', 'RUNNER_UNAVAILABLE', 'FAILED'],
      ['partial', 'RUNNER_UNAVAILABLE', 'FAILED'],
      ['malformed', 'RUNNER_UNAVAILABLE', 'FAILED'],
    ] as const;

    for (const [mode, code, runStatus] of cases) {
      it(`practice run with runner ${mode} -> 503 ${code}, no results stored`, async () => {
        const { userId, attempt } = await sit();
        runner.mode = mode;
        const err = await runTests
          .executeTests({
            attempt,
            code: { html: attempt.html, css: '', js: '' },
            kind: 'PRACTICE',
            final: false,
            userId,
          })
          .then(
            () => null,
            (e: unknown) => e as { status: number; code: string; message: string },
          );
        expect(err).toMatchObject({ status: 503, code });
        expect(err?.message).not.toMatch(/unreachable|test\)/i); // no runner internals
        const run = await prisma.testRun.findFirstOrThrow({ where: { attemptId: attempt.id } });
        expect(run.status).toBe(runStatus);
        expect(await prisma.testResult.count({ where: { attemptId: attempt.id } })).toBe(0);
      });
    }

    it('successful execution scores normally (passing and failing tests)', async () => {
      const { userId, attempt } = await sit();
      runner.mode = 'fail-all';
      const out = await runTests.executeTests({
        attempt,
        code: { html: attempt.html, css: '', js: '' },
        kind: 'PRACTICE',
        final: false,
        userId,
      });
      expect(out).toMatchObject({ status: 'COMPLETED', score: 0, failedCount: 2, totalCount: 2 });
    });

    it('submitting the last answer ends the sitting and audits it like End Test', async () => {
      const { exam, userId, attempt } = await sit();
      runner.mode = 'pass';
      await attempts.submitAttempt({ attemptId: attempt.id, userId });
      const session = await prisma.examSession.findFirstOrThrow({ where: { examId: exam.id, userId } });
      expect(session.endedAt).not.toBeNull();
      const audit = await prisma.auditLog.findFirst({
        where: { userId, action: 'exam.ended', entityId: exam.id },
      });
      expect(audit?.metadata).toMatchObject({ reason: 'ALL_SUBMITTED', attemptNumber: 1 });
    });

    it('a manual submit with the runner down is recorded as grading pending', async () => {
      const { userId, attempt } = await sit();
      runner.mode = 'status-failed';
      const res = await attempts.submitAttempt({ attemptId: attempt.id, userId });
      expect(res).toMatchObject({ gradingPending: true, alreadySubmitted: false, results: [] });
      const a = await attemptRow(attempt.id);
      expect(a.status).toBe('SUBMITTED');
      expect(a.gradedAt).toBeNull();
      // Duplicate submission returns the pending state, never a fresh (fake) grade.
      runner.mode = 'pass';
      const again = await attempts.submitAttempt({ attemptId: attempt.id, userId });
      expect(again).toMatchObject({ gradingPending: true, alreadySubmitted: true });
    });
  });

  /* ------------------------------------------------------------- B8 */

  describe('B8: End Test with the runner down does not award 0', () => {
    it('runner available: every open attempt graded', async () => {
      const { exam, userId, attempt } = await sit();
      const res = await finalization.endExam(exam.id, userId);
      expect(res).toMatchObject({ submittedCount: 1, gradedCount: 1, pendingCount: 0 });
      expect(Number((await attemptRow(attempt.id)).score)).toBe(10);
    });

    for (const mode of ['unavailable', 'status-timeout', 'status-failed'] as const) {
      it(`runner ${mode}: submitted, code preserved, grading pending`, async () => {
        const { exam, userId, attempt } = await sit();
        await attempts.saveAttemptCode(attempt.id, userId, {
          html: '<div id="box">mine</div>',
          css: '',
          js: '',
        });
        runner.mode = mode;
        const res = await finalization.endExam(exam.id, userId);
        expect(res).toMatchObject({ submittedCount: 1, gradedCount: 0, pendingCount: 1 });
        const a = await attemptRow(attempt.id);
        expect(a.status).toBe('SUBMITTED');
        expect(a.gradedAt).toBeNull();
        expect(a.html).toBe('<div id="box">mine</div>');
        const list = await (await import('@/server/services/exams')).listStudentExams(userId);
        const row = list.find((e) => e.id === exam.id);
        expect(row).toMatchObject({ score: null, gradingPending: 1 });
      });
    }

    it('retry after the runner recovers grades the pending attempt exactly once', async () => {
      const { exam, userId, attempt } = await sit();
      runner.mode = 'unavailable';
      await finalization.endExam(exam.id, userId);
      runner.mode = 'pass';
      const first = await grading.regradePendingAttempts({ attemptId: attempt.id });
      expect(first).toMatchObject({ attempted: 1, graded: 1, failed: 0 });
      const a = await attemptRow(attempt.id);
      expect(a.gradedAt).not.toBeNull();
      expect(Number(a.score)).toBe(10);
      // Graded attempts are no longer eligible: no double grading.
      const second = await grading.regradePendingAttempts({ attemptId: attempt.id });
      expect(second.attempted).toBe(0);
    });

    it('regrade while the runner is still down keeps the attempt pending', async () => {
      const { exam, userId, attempt } = await sit();
      runner.mode = 'unavailable';
      await finalization.endExam(exam.id, userId);
      const res = await grading.regradePendingAttempts({ attemptId: attempt.id });
      expect(res).toMatchObject({ attempted: 1, graded: 0, failed: 1 });
      expect((await attemptRow(attempt.id)).gradedAt).toBeNull();
    });

    it('duplicate End Test submissions are idempotent', async () => {
      const { exam, userId } = await sit();
      const [a, b] = await Promise.all([
        finalization.endExam(exam.id, userId),
        finalization.endExam(exam.id, userId),
      ]);
      expect(a.submittedCount + b.submittedCount).toBe(1);
      expect(runner.calls.length).toBe(1);
    });
  });
});
