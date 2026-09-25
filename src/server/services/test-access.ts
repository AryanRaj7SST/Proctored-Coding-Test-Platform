import { prisma } from '@/lib/prisma';
import { conflict, notFound } from '@/lib/errors';
import { normalizeEmail } from '@/lib/email';
import { finalizeSitting } from './finalization';
import { currentSession } from './sessions';

/**
 * Per-test access revocation. Tests are open to every signed-in student by
 * default (ANY_AUTHENTICATED_USER); an administrator can take one student's
 * access to one test away -- and give it back -- without touching their
 * account. The same flag also closes an assigned-only test to that student.
 *
 * The decision lives on the student's assignment row (`revokedAt`), which is
 * keyed by email, so access can be revoked before a first sign-in too.
 * lib/authz reads it on every workspace request.
 */

export interface TestAccessChange {
  email: string;
  revoked: boolean;
  /** A sitting that was open when access was revoked, now submitted. */
  closedSitting: boolean;
}

export async function setTestAccess(
  examId: string,
  rawEmail: string,
  revoked: boolean,
  adminId: string,
): Promise<TestAccessChange> {
  const email = normalizeEmail(rawEmail);
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } });
  if (!exam) throw notFound('Test not found.');
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });

  if (!revoked) {
    const row = await prisma.examAssignment.findUnique({ where: { examId_email: { examId, email } } });
    if (!row?.revokedAt) throw notFound("That student's access to this test is not revoked.");
    await prisma.examAssignment.update({ where: { id: row.id }, data: { revokedAt: null } });
    return { email, revoked: false, closedSitting: false };
  }

  if (user?.role === 'ADMIN') throw conflict('Administrators always have access to every test.');
  await prisma.examAssignment.upsert({
    where: { examId_email: { examId, email } },
    create: { examId, email, userId: user?.id ?? null, assignedById: adminId, revokedAt: new Date() },
    update: { revokedAt: new Date() },
  });

  // A sitting in progress ends now: the work so far is submitted and graded,
  // exactly as when time runs out, and the student is locked out of it.
  let closedSitting = false;
  if (user) {
    const session = await currentSession(examId, user.id);
    if (session && !session.endedAt) {
      closedSitting = (await finalizeSitting(examId, user.id, 'ACCESS_REVOKED')).closedSitting;
    }
  }
  return { email, revoked: true, closedSitting };
}
