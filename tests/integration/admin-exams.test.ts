import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * The test builder: drafts, the publish gate (published questions only),
 * snapshot pinning, per-question marks, locking once students start, access
 * modes, assignments (including before first sign-in) and pass-mark changes.
 * Real PostgreSQL; the runner always passes.
 */

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock('@/lib/auth', () => ({ auth: async () => session.current }));
vi.mock('@/lib/runner-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/runner-client')>();
  return {
    ...actual,
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

describeDb('test builder (requires DATABASE_URL)', { timeout: 120_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let exams: typeof import('@/server/services/exams');
  let assignments: typeof import('@/server/services/assignments');
  let sessions: typeof import('@/server/services/sessions');
  let finalization: typeof import('@/server/services/finalization');
  let attemptsSvc: typeof import('@/server/services/attempts');
  let authz: typeof import('@/lib/authz');

  const stamp = Date.now();
  const ids = {
    admin: `it-tb-admin-${stamp}`,
    s1: `it-tb-s1-${stamp}`,
    s2: `it-tb-s2-${stamp}`,
    batch: `IT-TB-${stamp}`,
    q1: `it-tb-q1-${stamp}`,
    q2: `it-tb-q2-${stamp}`,
    draftQ: `it-tb-q3-${stamp}`,
  };
  const newcomer = `it-tb-new-${stamp}@example.test`;
  const examIds: string[] = [];
  const email = (id: string) => `${id}@example.test`;

  const base = {
    durationMinutes: 45,
    timezone: 'Asia/Kolkata',
    accessMode: 'ASSIGNED_USERS_ONLY' as const,
    maxAttempts: 1,
    passingPercentage: '40',
    resultVisibility: 'FULL' as const,
    maxViolations: 0,
    shuffleQuestions: false,
  };
  async function draft(
    questions: { questionId: string; marks?: string }[],
    extra: Record<string, unknown> = {},
  ) {
    const exam = await exams.createExam({
      ...base,
      title: `Builder ${examIds.length + 1} ${stamp}`,
      questions,
      ...extra,
    } as never);
    examIds.push(exam.id);
    return exam;
  }

  async function question(id: string, status: 'PUBLISHED' | 'DRAFT', marks: string) {
    await prisma.question.create({
      data: {
        id,
        title: `Builder question ${id}`,
        slug: id,
        description: 'Original wording.',
        referenceHtml: '<div id="a"></div>',
        marks,
        status,
        validation: status === 'PUBLISHED' ? 'PASSED' : 'NOT_VALIDATED',
        tests: {
          create: [0, 1].map((i) => ({
            name: `t${i}`,
            testCode: JSON.stringify({ assertions: [{ type: 'exists', selector: `#a${i}` }] }),
            order: i,
          })),
        },
      },
    });
  }

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    exams = await import('@/server/services/exams');
    assignments = await import('@/server/services/assignments');
    sessions = await import('@/server/services/sessions');
    finalization = await import('@/server/services/finalization');
    attemptsSvc = await import('@/server/services/attempts');
    authz = await import('@/lib/authz');

    await prisma.user.create({ data: { id: ids.admin, email: email(ids.admin), role: 'ADMIN' } });
    for (const id of [ids.s1, ids.s2]) {
      await prisma.user.create({ data: { id, email: email(id), role: 'STUDENT', batch: ids.batch } });
      await prisma.allowedEmail.create({ data: { email: email(id), batch: ids.batch } });
    }
    // On the roster, never signed in.
    await prisma.allowedEmail.create({ data: { email: newcomer, batch: ids.batch } });
    await question(ids.q1, 'PUBLISHED', '10');
    await question(ids.q2, 'PUBLISHED', '7');
    await question(ids.draftQ, 'DRAFT', '5');
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.exam.deleteMany({ where: { id: { in: examIds } } });
    await prisma.question.deleteMany({ where: { id: { in: [ids.q1, ids.q2, ids.draftQ] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.s1, ids.s2] } } });
    await prisma.user.deleteMany({ where: { email: newcomer } });
    await prisma.allowedEmail.deleteMany({
      where: { email: { in: [email(ids.s1), email(ids.s2), newcomer] } },
    });
    await prisma.$disconnect();
  });

  it('creates a DRAFT with ordered questions and per-question marks (default: the question marks)', async () => {
    const exam = await draft([{ questionId: ids.q1 }, { questionId: ids.q2, marks: '12.5' }]);
    expect(exam.status).toBe('DRAFT');
    const view = await exams.getExamForAdmin(exam.id);
    expect(view.questions.map((q) => [q.questionId, q.order, q.marks])).toEqual([
      [ids.q1, 0, 10],
      [ids.q2, 1, 12.5],
    ]);
    expect(view.totalMarks).toBe(22.5);
    expect(view.timezone).toBe('Asia/Kolkata');
    expect(view.phase).toBe('DRAFT');
  });

  it('refuses to publish while a question is not published, then publishes and pins snapshots', async () => {
    const exam = await draft([{ questionId: ids.q1 }, { questionId: ids.draftQ }]);
    expect((await exams.getExamForAdmin(exam.id)).blockers.join(' ')).toMatch(/not published/);
    await expect(exams.changeExamStatus(exam.id, 'publish')).rejects.toThrow(/not ready to publish/);

    await exams.updateExam(exam.id, { questions: [{ questionId: ids.q1 }] });
    const published = await exams.changeExamStatus(exam.id, 'publish');
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).not.toBeNull();
    const pinned = await prisma.examQuestion.findMany({ where: { examId: exam.id } });
    expect(pinned.every((p) => p.snapshot !== null && p.pinnedAt !== null)).toBe(true);
  });

  it('refuses to publish an empty test', async () => {
    const exam = await draft([]);
    await expect(exams.changeExamStatus(exam.id, 'publish')).rejects.toThrow(/at least one question/);
  });

  it('reorders questions, changes marks and reports what changed', async () => {
    const exam = await draft([{ questionId: ids.q1 }, { questionId: ids.q2 }]);
    const { changed } = await exams.updateExam(exam.id, {
      durationMinutes: 90,
      questions: [{ questionId: ids.q2, marks: '3' }, { questionId: ids.q1 }],
    });
    expect(changed).toEqual(expect.arrayContaining(['durationMinutes', 'schedule', 'questions']));
    const view = await exams.getExamForAdmin(exam.id);
    expect(view.questions.map((q) => [q.questionId, q.marks])).toEqual([
      [ids.q2, 3],
      [ids.q1, 10],
    ]);
  });

  it('rejects an end time before the start time', async () => {
    const exam = await draft([{ questionId: ids.q1 }]);
    await expect(
      exams.updateExam(exam.id, {
        startTime: new Date('2026-10-01T10:00:00Z'),
        endTime: new Date('2026-10-01T09:00:00Z'),
      }),
    ).rejects.toThrow(/end time/);
  });

  it('locks questions and marks once a student has started, and refuses to unpublish', async () => {
    const exam = await draft([{ questionId: ids.q1 }]);
    await exams.changeExamStatus(exam.id, 'publish');
    await assignments.assignToExam(exam.id, { userIds: [ids.s1] }, ids.admin);
    await sessions.startExamSession(await prisma.exam.findUniqueOrThrow({ where: { id: exam.id } }), ids.s1);

    await expect(
      exams.updateExam(exam.id, { questions: [{ questionId: ids.q1, marks: '20' }] }),
    ).rejects.toThrow(/locked/);
    await expect(exams.changeExamStatus(exam.id, 'unpublish')).rejects.toThrow(/Close or archive/);
    // Settings that only affect new sittings may still change.
    await expect(exams.updateExam(exam.id, { maxAttempts: 2 })).resolves.toBeTruthy();
  });

  it('assigns by batch (including a roster email that never signed in) and links it at sign-in', async () => {
    const exam = await draft([{ questionId: ids.q1 }]);
    const result = await assignments.assignToExam(exam.id, { batch: ids.batch }, ids.admin);
    expect(result.assigned).toBe(3);

    const rows = await assignments.listAssignments(exam.id);
    const pending = rows.find((r) => r.email === newcomer)!;
    expect(pending.signedIn).toBe(false);
    expect(pending.attemptState).toBe('NOT_STARTED');

    const user = await prisma.user.create({ data: { email: newcomer, role: 'STUDENT' } });
    expect(await assignments.linkPendingAssignments(newcomer, user.id)).toBeGreaterThanOrEqual(1);
    expect((await assignments.listAssignments(exam.id)).find((r) => r.email === newcomer)!.signedIn).toBe(
      true,
    );
  });

  it('assigning twice is idempotent; any address may be assigned, admin accounts are refused', async () => {
    const exam = await draft([{ questionId: ids.q1 }]);
    await assignments.assignToExam(exam.id, { emails: [email(ids.s1)] }, ids.admin);
    const stranger = `stranger-${ids.batch.toLowerCase()}@example.test`;
    const again = await assignments.assignToExam(
      exam.id,
      { emails: [email(ids.s1), stranger, email(ids.admin)] },
      ids.admin,
    );
    // Nobody needs to be on the roster: a never-seen address is assigned and links at first sign-in.
    expect(again).toEqual({ assigned: 1, alreadyAssigned: 1, notAssignable: [email(ids.admin)] });
    const pending = (await assignments.listAssignments(exam.id)).find((r) => r.email === stranger)!;
    expect(pending.signedIn).toBe(false);
  });

  it('never assigns a deactivated account, by email or by batch', async () => {
    const exam = await draft([{ questionId: ids.q1 }]);
    await prisma.user.update({ where: { id: ids.s2 }, data: { active: false } });
    try {
      const byEmail = await assignments.assignToExam(exam.id, { emails: [email(ids.s2)] }, ids.admin);
      expect(byEmail).toMatchObject({ assigned: 0, notAssignable: [email(ids.s2)] });
      await assignments.assignToExam(exam.id, { batch: ids.batch }, ids.admin);
      const emails = (await assignments.listAssignments(exam.id)).map((r) => r.email);
      expect(emails).not.toContain(email(ids.s2));
      expect(emails).toEqual(expect.arrayContaining([email(ids.s1), newcomer]));
    } finally {
      await prisma.user.update({ where: { id: ids.s2 }, data: { active: true } });
    }
  });

  it('refuses to unassign a student who has started', async () => {
    const exam = await draft([{ questionId: ids.q1 }]);
    await exams.changeExamStatus(exam.id, 'publish');
    await assignments.assignToExam(exam.id, { userIds: [ids.s2] }, ids.admin);
    await sessions.startExamSession(await prisma.exam.findUniqueOrThrow({ where: { id: exam.id } }), ids.s2);
    await expect(assignments.unassign(exam.id, email(ids.s2))).rejects.toThrow(/already started/);
  });

  it('ASSIGNED_USERS_ONLY admits only assignees; ANY_AUTHENTICATED_USER admits every student', async () => {
    const exam = await draft([{ questionId: ids.q1 }]);
    await exams.changeExamStatus(exam.id, 'publish');
    const student = { id: ids.s2, email: email(ids.s2), name: null, role: 'STUDENT' as const, batch: null };

    await expect(authz.requireTestAccess(exam.id, student)).rejects.toThrow(/not found/i);
    expect((await exams.listStudentExams(ids.s2)).map((e) => e.id)).not.toContain(exam.id);

    await exams.updateExam(exam.id, { accessMode: 'ANY_AUTHENTICATED_USER' });
    await expect(authz.requireTestAccess(exam.id, student)).resolves.toMatchObject({ id: exam.id });
    const listed = (await exams.listStudentExams(ids.s2)).find((e) => e.id === exam.id);
    expect(listed).toMatchObject({
      questionCount: 1,
      totalMarks: 10,
      availability: 'AVAILABLE',
      phase: 'ACTIVE',
    });
  });

  it('a draft test is invisible to students even when open to everyone', async () => {
    const exam = await draft([{ questionId: ids.q1 }], { accessMode: 'ANY_AUTHENTICATED_USER' });
    const student = { id: ids.s1, email: email(ids.s1), name: null, role: 'STUDENT' as const, batch: null };
    await expect(authz.requireTestAccess(exam.id, student)).rejects.toThrow(/not found/i);
  });

  it('changing the pass mark re-evaluates PASS/FAIL of graded sittings', async () => {
    const exam = await draft([{ questionId: ids.q1 }], {
      accessMode: 'ANY_AUTHENTICATED_USER',
      passingPercentage: '40',
    });
    await exams.changeExamStatus(exam.id, 'publish');
    const fresh = await prisma.exam.findUniqueOrThrow({ where: { id: exam.id } });
    const sitting = await sessions.startExamSession(fresh, ids.s1);
    await attemptsSvc.ensureAttempts(sitting); // the workspace opens every question on start
    await finalization.endExam(exam.id, ids.s1); // runner mock: 1 of 2 tests pass -> 50%
    expect((await prisma.examSession.findUniqueOrThrow({ where: { id: sitting.id } })).result).toBe('PASSED');

    const { changed } = await exams.updateExam(exam.id, { passingPercentage: '60' });
    expect(changed).toContain('passingPercentage');
    expect((await prisma.examSession.findUniqueOrThrow({ where: { id: sitting.id } })).result).toBe('FAILED');
  });

  it('closing a test finalises its open sittings immediately', async () => {
    const exam = await draft([{ questionId: ids.q1 }], { accessMode: 'ANY_AUTHENTICATED_USER' });
    await exams.changeExamStatus(exam.id, 'publish');
    const sitting = await sessions.startExamSession(
      await prisma.exam.findUniqueOrThrow({ where: { id: exam.id } }),
      ids.s2,
    );
    await exams.changeExamStatus(exam.id, 'close');
    const closed = await prisma.examSession.findUniqueOrThrow({ where: { id: sitting.id } });
    expect(closed.endedAt).not.toBeNull();
    expect(closed.status).toBe('EXPIRED');
    expect((await exams.getExamForAdmin(exam.id)).phase).toBe('ENDED');
  });

  it('deletes an unstarted test; a started one must be archived', async () => {
    const unused = await draft([{ questionId: ids.q1 }]);
    await exams.deleteExam(unused.id);
    expect(await prisma.exam.findUnique({ where: { id: unused.id } })).toBeNull();

    const used = await draft([{ questionId: ids.q1 }], { accessMode: 'ANY_AUTHENTICATED_USER' });
    await exams.changeExamStatus(used.id, 'publish');
    await sessions.startExamSession(await prisma.exam.findUniqueOrThrow({ where: { id: used.id } }), ids.s1);
    await expect(exams.deleteExam(used.id)).rejects.toThrow(/Archive/);
  });
});
