import { auth } from './auth';
import { prisma } from './prisma';
import { forbidden, unauthorized, notFound } from './http';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: 'STUDENT' | 'ADMIN';
  batch: string | null;
}

/**
 * Resolve the authenticated user for an API route or server component.
 * Every protected route calls this independently -- the middleware is a UX
 * convenience, never the authorisation boundary.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
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
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') throw forbidden('Administrator access is required.');
  return user;
}

/**
 * Load an attempt and assert the caller owns it (or is an admin).
 * Returns 404 rather than 403 for other students' attempts so the API does not
 * confirm the existence of resources the caller may not see.
 */
export async function requireOwnedAttempt(attemptId: string, user: SessionUser) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { exam: true },
  });
  if (!attempt) throw notFound('Attempt not found.');
  if (user.role !== 'ADMIN' && attempt.userId !== user.id) throw notFound('Attempt not found.');
  return attempt;
}

/** Assert the student is assigned to the exam (admins bypass). */
export async function requireExamAccess(examId: string, user: SessionUser) {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw notFound('Exam not found.');
  if (user.role === 'ADMIN') return exam;

  const assignment = await prisma.examAssignment.findUnique({
    where: { examId_userId: { examId, userId: user.id } },
  });
  if (!assignment) throw notFound('Exam not found.');
  if (!exam.active || exam.status === 'DRAFT' || exam.status === 'ARCHIVED') {
    throw notFound('Exam not found.');
  }
  return exam;
}
