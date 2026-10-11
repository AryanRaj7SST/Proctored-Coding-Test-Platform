import { cache } from 'react';
import type { Attempt, Exam } from '@prisma/client';
import { auth } from './auth';
import { prisma } from './prisma';
import { forbidden, notFound, unauthorized } from './errors';

/**
 * Server-side authorisation. Every protected route, page and layout calls
 * these helpers independently: the middleware is a UX convenience and hiding a
 * button is never an authorisation decision.
 *
 *   requireAuth()                 any signed-in, active user
 *   requireAdmin()                ADMIN only
 *   requireTestAccess(examId)     the user may open this test
 *   requireAttemptAccess(id, m)   read: owner or admin / write: owner only
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: 'STUDENT' | 'ADMIN';
  batch: string | null;
}

/**
 * Resolve the authenticated user, or null. Role/active come from the DB (see lib/auth.ts).
 *
 * Wrapped in React `cache()`: the Auth.js `jwt` callback re-reads the user from
 * the database on every `auth()` call, and a page render calls this from both
 * the layout and the page. Memoising per request makes that ONE lookup per
 * render instead of two, without weakening anything: the role and active flag
 * are still read fresh from the database on every request. Outside a React
 * render (route handlers, tests) `cache()` simply calls through.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    role: user.role === 'ADMIN' ? 'ADMIN' : 'STUDENT',
    batch: user.batch ?? null,
  };
});

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role !== 'ADMIN') throw forbidden('Administrator access is required.');
  return user;
}

/* ----------------------------------------------------------------- tests */

type TestVisibility = Pick<Exam, 'active' | 'status'>;
type TestAccess = TestVisibility & Pick<Exam, 'accessMode'>;

/** A test exists for students only while it is active and published (not DRAFT / ARCHIVED). */
export function isTestVisibleToStudents(exam: TestVisibility): boolean {
  return exam.active && exam.status !== 'DRAFT' && exam.status !== 'ARCHIVED';
}

/** This student's assignment row for a test, as far as access is concerned. */
export interface StudentTestAccess {
  /** An assignment exists and has not been revoked. */
  assigned: boolean;
  /** An administrator revoked this student's access to this test. */
  revoked: boolean;
}

/**
 * Pure access rule for a student: the test is visible, access has not been
 * revoked for this student, and the test is either open to any signed-in user
 * (ANY_AUTHENTICATED_USER, the default) or assigned to this student.
 */
export function studentCanAccessTest(exam: TestAccess, access: StudentTestAccess): boolean {
  if (!isTestVisibleToStudents(exam)) return false;
  if (access.revoked) return false;
  return exam.accessMode === 'ANY_AUTHENTICATED_USER' || access.assigned;
}

/** Read a student's assignment row as an access decision. */
export function accessFromAssignment(row: { revokedAt: Date | null } | null): StudentTestAccess {
  return { assigned: Boolean(row && !row.revokedAt), revoked: Boolean(row?.revokedAt) };
}

/**
 * Load a test and assert the caller may open it. Admins may open any test
 * (dry runs, monitoring). Students get 404 -- not 403 -- for tests they cannot
 * see (including one whose access was revoked for them), so the API never
 * confirms that a test exists. Scheduling and attempt limits are enforced
 * separately, when a sitting starts.
 */
export async function requireTestAccess(examId: string, user: SessionUser): Promise<Exam> {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw notFound('Test not found.');
  if (user.role === 'ADMIN') return exam;

  const assignment = await prisma.examAssignment.findUnique({
    where: { examId_userId: { examId, userId: user.id } },
    select: { revokedAt: true },
  });
  if (!studentCanAccessTest(exam, accessFromAssignment(assignment))) throw notFound('Test not found.');
  return exam;
}

/* -------------------------------------------------------------- attempts */

export type AttemptAccessMode = 'read' | 'write';

/**
 * Load an attempt and assert the caller may use it.
 *
 *  - `read`:  the owner, or an administrator (review screens).
 *  - `write`: the owner only. Administrators can inspect a student's attempt
 *             but never save, run or submit it on the student's behalf.
 *
 * Another student's attempt is a 404, never a 403.
 */
export async function requireAttemptAccess(
  attemptId: string,
  user: SessionUser,
  mode: AttemptAccessMode,
): Promise<Attempt & { exam: Exam }> {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId }, include: { exam: true } });
  if (!attempt) throw notFound('Attempt not found.');
  if (attempt.userId === user.id) return attempt;
  if (user.role !== 'ADMIN') throw notFound('Attempt not found.');
  if (mode === 'write') throw forbidden('Administrators cannot modify a student attempt.');
  return attempt;
}
