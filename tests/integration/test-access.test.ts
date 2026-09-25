import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * Per-test access revocation: tests are open to every signed-in student by
 * default, and an administrator can take one student's access to one test
 * away (and give it back) without touching the account. Real PostgreSQL; the
 * runner mock passes every test case.
 */
// lib/authz reads the session through lib/auth; these tests pass users explicitly.
vi.mock('@/lib/auth', () => ({ auth: async () => null }));

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

describeDb('test access revocation (requires DATABASE_URL)', { timeout: 120_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let access: typeof import('@/server/services/test-access');
  let authz: typeof import('@/lib/authz');
  let exams: typeof import('@/server/services/exams');
  let sessions: typeof import('@/server/services/sessions');
  let attempts: typeof import('@/server/services/attempts');
  let accounts: typeof import('@/server/services/accounts');
  let assignments: typeof import('@/server/services/assignments');

  const stamp = Date.now();
  const questionId = `it-ta-q-${stamp}`;
  const adminId = `it-ta-admin-${stamp}`;
  const studentId = `it-ta-s-${stamp}`;
  const email = (id: string) => `${id}@example.test`;
  const newcomer = `it-ta-new-${stamp}@example.test`;
  const examIds: string[] = [];

  const student = () => ({
    id: studentId,
    email: email(studentId),
    name: null,
    role: 'STUDENT' as const,
    batch: null,
  });

  async function newExam(extra: Record<string, unknown> = {}) {
    const id = `it-ta-exam-${stamp}-${examIds.length + 1}`;
    examIds.push(id);
    return prisma.exam.create({
      data: {
        id,
        title: `Access ${examIds.length}`,
        status: 'PUBLISHED',
        durationMinutes: 30,
        maxAttempts: 2,
        questions: { create: [{ questionId, order: 0, marks: 10 }] },
        ...extra,
      },
    });
  }

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    access = await import('@/server/services/test-access');
    authz = await import('@/lib/authz');
    exams = await import('@/server/services/exams');
    sessions = await import('@/server/services/sessions');
    attempts = await import('@/server/services/attempts');
    accounts = await import('@/server/services/accounts');
    assignments = await import('@/server/services/assignments');
    await prisma.user.create({ data: { id: adminId, email: email(adminId), role: 'ADMIN' } });
    await prisma.user.create({ data: { id: studentId, email: email(studentId), role: 'STUDENT' } });
    await prisma.question.create({
      data: {
        id: questionId,
        title: 'Access question',
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
    await prisma.user.deleteMany({ where: { id: { in: [adminId, studentId] } } });
    await prisma.user.deleteMany({ where: { email: newcomer } });
    await prisma.$disconnect();
  });

  const visibleTo = async (examId: string) =>
    (await exams.listStudentExams(studentId)).some((e) => e.id === examId);

  it('a new test is open to every signed-in student by default', async () => {
    const { examCreateInput } = await import('@/lib/validation');
    const exam = await exams.createExam(
      examCreateInput.parse({ title: 'Default access test', durationMinutes: 30 }),
    );
    examIds.push(exam.id);
    expect(exam.accessMode).toBe('ANY_AUTHENTICATED_USER');
    const raw = await prisma.exam.create({ data: { title: 'Raw insert' } });
    examIds.push(raw.id);
    expect(raw.accessMode).toBe('ANY_AUTHENTICATED_USER');
  });

  it('revoke -> the student keeps their account but loses this test; restore -> access returns', async () => {
    const exam = await newExam();
    await expect(authz.requireTestAccess(exam.id, student())).resolves.toMatchObject({ id: exam.id });
    expect(await visibleTo(exam.id)).toBe(true);

    await access.setTestAccess(exam.id, email(studentId), true, adminId);
    await expect(authz.requireTestAccess(exam.id, student())).rejects.toMatchObject({ status: 404 });
    expect(await visibleTo(exam.id)).toBe(false);
    // Still a working account: signs in and gets a session role as before.
    expect(await accounts.accountForToken(email(studentId))).toMatchObject({ role: 'STUDENT' });

    await access.setTestAccess(exam.id, email(studentId), false, adminId);
    await expect(authz.requireTestAccess(exam.id, student())).resolves.toMatchObject({ id: exam.id });
    expect(await visibleTo(exam.id)).toBe(true);
    const fresh = await prisma.exam.findUniqueOrThrow({ where: { id: exam.id } });
    await expect(sessions.startExamSession(fresh, studentId)).resolves.toMatchObject({ attemptNumber: 1 });
  });

  it('revoking mid-sitting submits and grades the work, and the sitting cannot be reopened', async () => {
    const exam = await newExam();
    const fresh = await prisma.exam.findUniqueOrThrow({ where: { id: exam.id } });
    const session = await sessions.startExamSession(fresh, studentId);
    await attempts.ensureAttempts(session);

    const change = await access.setTestAccess(exam.id, email(studentId), true, adminId);
    expect(change).toMatchObject({ revoked: true, closedSitting: true });
    const closed = await prisma.examSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(closed.endedAt).not.toBeNull();
    expect(Number(closed.score)).toBe(10);
    const ended = await prisma.proctorEvent.findFirstOrThrow({
      where: { sessionId: session.id, type: 'EXAM_SUBMITTED' },
    });
    expect(ended.metadata).toMatchObject({ reason: 'ACCESS_REVOKED' });
    await expect(authz.requireTestAccess(exam.id, student())).rejects.toMatchObject({ status: 404 });
  });

  it('an assigned-only test: a revoked assignment grants nothing until restored', async () => {
    const exam = await newExam({ accessMode: 'ASSIGNED_USERS_ONLY' });
    await assignments.assignToExam(exam.id, { userIds: [studentId] }, adminId);
    await expect(authz.requireTestAccess(exam.id, student())).resolves.toBeTruthy();
    await access.setTestAccess(exam.id, email(studentId), true, adminId);
    await expect(authz.requireTestAccess(exam.id, student())).rejects.toMatchObject({ status: 404 });
    // Deleting a revoked row is refused: on an open test it would silently restore access.
    await expect(assignments.unassign(exam.id, email(studentId))).rejects.toThrow(/Restore/);
    const rows = await assignments.listAssignments(exam.id);
    expect(rows.find((r) => r.email === email(studentId))).toMatchObject({ revoked: true });
    await access.setTestAccess(exam.id, email(studentId), false, adminId);
    await expect(authz.requireTestAccess(exam.id, student())).resolves.toBeTruthy();
  });

  it('access can be revoked before a first sign-in, and stays revoked once the account exists', async () => {
    const exam = await newExam();
    await access.setTestAccess(exam.id, newcomer, true, adminId);
    const signIn = await accounts.acceptGoogleSignIn({ email: newcomer, email_verified: true });
    expect(signIn.ok).toBe(true);
    const id = signIn.ok ? signIn.user.id : '';
    const who = { id, email: newcomer, name: null, role: 'STUDENT' as const, batch: null };
    await expect(authz.requireTestAccess(exam.id, who)).rejects.toMatchObject({ status: 404 });
  });

  it('administrators cannot be revoked; restoring an unrevoked student is a 404', async () => {
    const exam = await newExam();
    await expect(access.setTestAccess(exam.id, email(adminId), true, adminId)).rejects.toThrow(
      /Administrators/,
    );
    await expect(access.setTestAccess(exam.id, 'nobody@example.test', false, adminId)).rejects.toMatchObject({
      status: 404,
    });
  });
});
