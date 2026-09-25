import { prisma } from '@/lib/prisma';
import { conflict, notFound } from '@/lib/errors';
import { marksToNumber } from '@/server/grading/marks';

/**
 * Who may sit a restricted (ASSIGNED_USERS_ONLY) test. Assignments are keyed
 * by email, so a student can be assigned before their first sign-in; the
 * assignment links to their account when they sign in (services/accounts.ts).
 */

export interface AssignInput {
  userIds?: string[];
  emails?: string[];
  batch?: string;
  allStudents?: boolean;
}

export interface AssignResult {
  assigned: number;
  alreadyAssigned: number;
  /** Requested emails that belong to an administrator or a deactivated account. */
  notAssignable: string[];
}

/**
 * Assign students by account, email, batch, or everyone. Anyone may sign in,
 * so any address can be assigned -- except one whose account is an
 * administrator or has been deactivated. Batches (and "everyone") cover
 * signed-in students plus roster addresses that have not signed in yet.
 */
export async function assignToExam(
  examId: string,
  input: AssignInput,
  assignedById: string,
): Promise<AssignResult> {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { status: true } });
  if (!exam) throw notFound('Test not found.');
  if (exam.status === 'ARCHIVED') throw conflict('Restore this test before assigning students.');

  const emails = new Set<string>();
  const notAssignable: string[] = [];
  const ineligible = { OR: [{ role: 'ADMIN' as const }, { active: false }] };

  if (input.userIds?.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: input.userIds }, active: true, role: 'STUDENT' },
      select: { email: true },
    });
    users.forEach((u) => emails.add(u.email));
  }
  if (input.emails?.length) {
    const blocked = await prisma.user.findMany({
      where: { email: { in: input.emails }, ...ineligible },
      select: { email: true },
    });
    const refused = new Set(blocked.map((u) => u.email));
    for (const email of input.emails) {
      if (refused.has(email)) notAssignable.push(email);
      else emails.add(email);
    }
  }
  if (input.batch || input.allStudents) {
    const scope = input.allStudents ? {} : { batch: input.batch };
    const [roster, users] = await Promise.all([
      prisma.allowedEmail.findMany({ where: scope, select: { email: true } }),
      prisma.user.findMany({ where: { ...scope, active: true, role: 'STUDENT' }, select: { email: true } }),
    ]);
    const blocked = await prisma.user.findMany({
      where: { email: { in: roster.map((r) => r.email) }, ...ineligible },
      select: { email: true },
    });
    const refused = new Set(blocked.map((u) => u.email));
    roster.forEach((r) => !refused.has(r.email) && emails.add(r.email));
    users.forEach((u) => emails.add(u.email));
  }

  const wanted = [...emails];
  if (wanted.length === 0) return { assigned: 0, alreadyAssigned: 0, notAssignable };

  const users = await prisma.user.findMany({
    where: { email: { in: wanted } },
    select: { id: true, email: true },
  });
  const userIdByEmail = new Map(users.map((u) => [u.email, u.id]));
  const result = await prisma.examAssignment.createMany({
    data: wanted.map((email) => ({ examId, email, userId: userIdByEmail.get(email) ?? null, assignedById })),
    skipDuplicates: true,
  });
  return { assigned: result.count, alreadyAssigned: wanted.length - result.count, notAssignable };
}

/** Called at sign-in: tests assigned to this email before the first sign-in now belong to the user. */
export async function linkPendingAssignments(email: string, userId: string): Promise<number> {
  const { count } = await prisma.examAssignment.updateMany({
    where: { email, userId: null },
    data: { userId },
  });
  return count;
}

/** Remove an assignment -- only while the student has never started the test. */
export async function unassign(examId: string, email: string): Promise<void> {
  const assignment = await prisma.examAssignment.findUnique({ where: { examId_email: { examId, email } } });
  if (!assignment) throw notFound('That student is not assigned to this test.');
  // On an open test, deleting a revoked row would silently give access back.
  if (assignment.revokedAt) throw conflict("Restore this student's access before removing them.");
  if (assignment.userId) {
    const started = await prisma.examSession.count({ where: { examId, userId: assignment.userId } });
    if (started > 0) throw conflict('This student has already started the test and cannot be unassigned.');
  }
  await prisma.examAssignment.delete({ where: { id: assignment.id } });
}

/**
 * Per-assignment accommodation, set explicitly by an administrator: the only
 * way a student is ever exempted from clipboard blocking.
 */
export async function setAccommodation(
  examId: string,
  email: string,
  allowClipboard: boolean,
): Promise<void> {
  const updated = await prisma.examAssignment.updateMany({
    where: { examId, email },
    data: { allowClipboard },
  });
  if (updated.count === 0) throw notFound('That student is not assigned to this test.');
}

export type AttemptState = 'NOT_STARTED' | 'IN_PROGRESS' | 'GRADING_PENDING' | 'SUBMITTED';

/** The assignment table: every assignee with their attempt state and best result. */
export async function listAssignments(examId: string) {
  const assignments = await prisma.examAssignment.findMany({
    where: { examId },
    orderBy: { email: 'asc' },
    include: { user: { select: { id: true, name: true, batch: true, lastLogin: true } } },
  });
  const userIds = assignments.flatMap((a) => (a.userId ? [a.userId] : []));
  // People who have not signed in yet have no user row: their batch is on the roster.
  const roster = await prisma.allowedEmail.findMany({
    where: { email: { in: assignments.map((a) => a.email) } },
    select: { email: true, batch: true },
  });
  const rosterBatch = new Map(roster.map((a) => [a.email, a.batch]));
  const sessions = await prisma.examSession.findMany({
    where: { examId, userId: { in: userIds } },
    orderBy: { attemptNumber: 'desc' },
    include: { attempts: { select: { status: true, gradedAt: true } } },
  });

  return assignments.map((a) => {
    const mine = sessions.filter((s) => s.userId === a.userId);
    const current = mine[0];
    const pending = current?.attempts.some((t) => t.status !== 'IN_PROGRESS' && !t.gradedAt) ?? false;
    const attemptState: AttemptState = !current
      ? 'NOT_STARTED'
      : !current.endedAt
        ? 'IN_PROGRESS'
        : pending
          ? 'GRADING_PENDING'
          : 'SUBMITTED';
    const best = mine
      .filter((s) => s.result !== null)
      .sort((x, y) => Number(y.percentage) - Number(x.percentage) || x.attemptNumber - y.attemptNumber)[0];
    return {
      id: a.id,
      email: a.email,
      userId: a.userId,
      name: a.user?.name ?? null,
      batch: a.user?.batch ?? rosterBatch.get(a.email) ?? null,
      signedIn: Boolean(a.userId),
      assignmentStatus: a.status,
      attemptState,
      attemptsUsed: current?.attemptNumber ?? 0,
      submittedAt: current?.endedAt?.toISOString() ?? null,
      score: best?.score ? marksToNumber(best.score) : null,
      maxScore: best ? marksToNumber(best.maxScore) : null,
      percentage: best?.percentage ? marksToNumber(best.percentage) : null,
      result: best?.result ?? null,
      bestSessionId: best?.id ?? null,
      allowClipboard: a.allowClipboard,
      revoked: Boolean(a.revokedAt),
      revokedAt: a.revokedAt?.toISOString() ?? null,
      assignedAt: a.assignedAt.toISOString(),
    };
  });
}

/** Tests with their assignment counts, for the assignments overview. */
export async function assignmentOverview() {
  const exams = await prisma.exam.findMany({
    where: { status: { not: 'ARCHIVED' } },
    orderBy: [{ startTime: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      title: true,
      status: true,
      accessMode: true,
      startTime: true,
      endTime: true,
      timezone: true,
      _count: { select: { assignments: { where: { revokedAt: null } } } },
    },
  });
  const ids = exams.map((e) => e.id);
  const [signedIn, started] = await Promise.all([
    prisma.examAssignment.groupBy({
      by: ['examId'],
      where: { examId: { in: ids }, userId: { not: null }, revokedAt: null },
      _count: { _all: true },
    }),
    prisma.examAssignment.groupBy({
      by: ['examId'],
      where: { examId: { in: ids }, status: { not: 'ASSIGNED' }, revokedAt: null },
      _count: { _all: true },
    }),
  ]);
  const signedInBy = new Map(signedIn.map((g) => [g.examId, g._count._all]));
  const startedBy = new Map(started.map((g) => [g.examId, g._count._all]));
  return exams.map(({ _count, ...e }) => ({
    ...e,
    assigned: _count.assignments,
    signedIn: signedInBy.get(e.id) ?? 0,
    started: startedBy.get(e.id) ?? 0,
  }));
}
