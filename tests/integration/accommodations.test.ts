import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * Security regression: the hard-coded personal-email bypass (early exam access
 * + clipboard exemption) is gone. Exemptions now come only from an explicit,
 * admin-set accommodation on the student's assignment, and only for clipboard
 * events. Uses the real database and the real proctor-events route handler.
 */
const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock('@/lib/auth', () => ({ auth: async () => session.current }));

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('accommodations instead of email bypasses (requires DATABASE_URL)', { timeout: 120_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let sessions: typeof import('@/server/services/sessions');
  const stamp = Date.now();
  const ids = {
    question: `it-acc-q-${stamp}`,
    exam: `it-acc-exam-${stamp}`,
    formerlyBypassed: `it-acc-u1-${stamp}`,
    student: `it-acc-u2-${stamp}`,
    accommodated: `it-acc-u3-${stamp}`,
    admin: `it-acc-admin-${stamp}`,
  };
  const users = [
    // The address that used to be special-cased in application code.
    { id: ids.formerlyBypassed, email: 'agnihotriaryan5361@gmail.com', role: 'STUDENT' as const },
    { id: ids.student, email: `${ids.student}@example.test`, role: 'STUDENT' as const },
    { id: ids.accommodated, email: `${ids.accommodated}@example.test`, role: 'STUDENT' as const },
    { id: ids.admin, email: `${ids.admin}@example.test`, role: 'ADMIN' as const },
  ];
  let preexistingUser: { id: string } | null = null;

  const signInAs = (u: (typeof users)[number]) => {
    session.current = { user: { id: u.id, email: u.email, role: u.role } };
  };
  /** Open the window (the early-start tests above ran first) and start u's sitting. */
  const startSitting = async (u: (typeof users)[number]) => {
    const exam = await prisma.exam.update({
      where: { id: ids.exam },
      data: { startTime: new Date(Date.now() - 60_000) },
    });
    await sessions.startExamSession(exam, u.id);
    signInAs(u);
  };
  const postEvent = async (body: Record<string, unknown>) => {
    const { POST } = await import('@/app/api/proctor-events/route');
    const res = await POST(
      new Request('http://localhost/api/proctor-events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    sessions = await import('@/server/services/sessions');
    // Never touch a real account that happens to use the special-cased address.
    preexistingUser = await prisma.user.findUnique({
      where: { email: users[0]!.email },
      select: { id: true },
    });
    if (preexistingUser) users.shift();
    await prisma.user.createMany({ data: users });
    await prisma.question.create({
      data: { id: ids.question, title: 'Acc question', slug: ids.question, description: 'x', marks: 1 },
    });
    await prisma.exam.create({
      data: {
        id: ids.exam,
        title: 'Opens tomorrow',
        durationMinutes: 30,
        status: 'PUBLISHED',
        startTime: new Date(Date.now() + 24 * 3600_000),
        questions: { create: [{ questionId: ids.question, order: 0, marks: 10 }] },
        assignments: {
          create: users
            .filter((u) => u.role === 'STUDENT')
            .map((u) => ({ userId: u.id, email: u.email, allowClipboard: u.id === ids.accommodated })),
        },
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.exam.deleteMany({ where: { id: ids.exam } });
    await prisma.question.deleteMany({ where: { id: ids.question } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await prisma.$disconnect();
  });

  it('arbitrary emails (including the formerly special-cased one) cannot start early', async () => {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: ids.exam } });
    for (const u of users.filter((x) => x.role === 'STUDENT')) {
      const state = await sessions.getExamTimeState(ids.exam, u.id, exam);
      expect(state.availability).toBe('NOT_STARTED');
      await expect(sessions.startExamSession(exam, u.id)).rejects.toThrow(/not opened/i);
    }
  });

  it('administrators keep the explicit dry-run early start (a role rule)', async () => {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: ids.exam } });
    const state = await sessions.getExamTimeState(ids.exam, ids.admin, exam);
    expect(state.availability).toBe('AVAILABLE');
  });

  it('normal students get no clipboard bypass: PASTE is recorded as a violation', async () => {
    await startSitting(users.find((x) => x.id === ids.student)!);
    const res = await postEvent({ examId: ids.exam, type: 'PASTE' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ recorded: true, violationCount: 1 });
  });

  if (!preexistingUser) {
    it('the formerly special-cased email gets no clipboard bypass either', async () => {
      await startSitting(users.find((x) => x.id === ids.formerlyBypassed)!);
      const res = await postEvent({ examId: ids.exam, type: 'PASTE' });
      expect(res.body).toMatchObject({ recorded: true, violationCount: 1 });
    });
  }

  it('an explicitly configured accommodation exempts clipboard events only', async () => {
    await startSitting(users.find((x) => x.id === ids.accommodated)!);
    const paste = await postEvent({ examId: ids.exam, type: 'PASTE' });
    expect(paste.body).toMatchObject({ recorded: false, violationCount: 0 });
    const tab = await postEvent({ examId: ids.exam, type: 'TAB_HIDDEN' });
    expect(tab.body).toMatchObject({ recorded: true, violationCount: 1 });
  });

  it('admins do not inherit any student exemption', async () => {
    signInAs(users.find((x) => x.id === ids.admin)!);
    const res = await postEvent({ examId: ids.exam, type: 'PASTE' });
    expect(res.body).toMatchObject({ recorded: true });
  });
});
