import { prisma } from '@/lib/prisma';
import { marksToNumber } from '@/server/grading/marks';
import { phaseWhere } from './exams';

/** Headline numbers for the admin dashboard. One round of parallel counts. */
export async function dashboardStats() {
  const now = new Date();
  const [
    questionsByStatus,
    upcoming,
    active,
    completed,
    draftTests,
    totalTests,
    users,
    students,
    inProgress,
    graded,
    passed,
    averages,
  ] = await Promise.all([
    prisma.question.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.exam.count({ where: phaseWhere('UPCOMING', now) }),
    prisma.exam.count({ where: phaseWhere('ACTIVE', now) }),
    prisma.exam.count({ where: phaseWhere('ENDED', now) }),
    prisma.exam.count({ where: phaseWhere('DRAFT', now) }),
    prisma.exam.count({ where: { status: { not: 'ARCHIVED' } } }),
    prisma.user.count({ where: { active: true } }),
    prisma.user.count({ where: { active: true, role: 'STUDENT' } }),
    prisma.examSession.count({ where: { endedAt: null } }),
    prisma.examSession.count({ where: { result: { not: null } } }),
    prisma.examSession.count({ where: { result: 'PASSED' } }),
    prisma.examSession.aggregate({ where: { result: { not: null } }, _avg: { percentage: true } }),
  ]);

  const byStatus = Object.fromEntries(questionsByStatus.map((g) => [g.status, g._count._all]));
  const count = (s: string) => (byStatus[s] as number | undefined) ?? 0;
  return {
    questions: {
      total: count('DRAFT') + count('VALIDATED') + count('PUBLISHED'),
      published: count('PUBLISHED'),
      drafts: count('DRAFT'),
      validated: count('VALIDATED'),
      archived: count('ARCHIVED'),
    },
    tests: { total: totalTests, upcoming, active, completed, drafts: draftTests },
    users: { total: users, students },
    sittings: {
      inProgress,
      graded,
      // Only fully graded sittings count: grading pending is never a 0.
      averagePercentage:
        averages._avg.percentage !== null
          ? Math.round(marksToNumber(averages._avg.percentage) * 10) / 10
          : null,
      passRate: graded > 0 ? Math.round((passed / graded) * 1000) / 10 : null,
    },
  };
}

/** Most recently finished sittings, graded or still pending. */
export async function recentSubmissions(limit = 8) {
  const rows = await prisma.examSession.findMany({
    where: { endedAt: { not: null } },
    orderBy: { endedAt: 'desc' },
    take: limit,
    include: {
      user: { select: { name: true, email: true } },
      exam: { select: { id: true, title: true } },
    },
  });
  return rows.map((s) => ({
    sessionId: s.id,
    student: s.user.name ?? s.user.email,
    email: s.user.email,
    examId: s.exam.id,
    examTitle: s.exam.title,
    attemptNumber: s.attemptNumber,
    endedAt: s.endedAt!.toISOString(),
    score: s.score !== null ? marksToNumber(s.score) : null,
    maxScore: marksToNumber(s.maxScore),
    percentage: s.percentage !== null ? marksToNumber(s.percentage) : null,
    result: s.result,
  }));
}

const ACTION_LABELS: Record<string, string> = {
  'question.created': 'created a question',
  'question.updated': 'edited a question',
  'question.test_cases_changed': 'changed test cases',
  'question.validated': 'validated a question',
  'question.published': 'published a question',
  'question.unpublished': 'unpublished a question',
  'question.archived': 'archived a question',
  'question.unarchived': 'restored a question',
  'question.deleted': 'deleted a question',
  'exam.created': 'created a test',
  'exam.updated': 'edited a test',
  'exam.schedule_changed': 'changed a test schedule',
  'exam.published': 'published a test',
  'exam.unpublished': 'unpublished a test',
  'exam.closed': 'closed a test',
  'exam.archived': 'archived a test',
  'exam.assigned': 'assigned students',
  'exam.access_revoked': "revoked a student's access to a test",
  'exam.access_restored': "restored a student's access to a test",
  'exam.accommodation_updated': 'changed an accommodation',
  'exam.unassigned': 'removed an assignment',
  'exam.started': 'started a test',
  'exam.resumed': 'resumed a test',
  'exam.ended': 'submitted a test',
  'exam.auto_submitted': 'was auto-submitted',
  'exam.terminated_violations': 'hit the violation limit',
  'attempt.submitted': 'submitted an answer',
  'attempt.regraded': 'regraded an attempt',
  'attempt.grading_failed': 'had grading deferred (runner)',
  'allowlist.added': 'added an address to the roster',
  'allowlist.updated': 'edited a roster entry',
  'allowlist.removed': 'removed an address from the roster',
  'allowlist.imported': 'imported a roster CSV',
  'user.role_changed': "changed a user's role",
  'user.admin_seeded': 'administrator added by the admin seed',
  'user.deactivated': 'deactivated an account',
  'user.reactivated': 'reactivated an account',
};

/** Human-readable recent activity, from the audit log. */
export async function recentActivity(limit = 12) {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { name: true, email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    actor: r.user ? (r.user.name ?? r.user.email) : 'System',
    action: r.action,
    text: ACTION_LABELS[r.action] ?? r.action.replace(/[._]/g, ' '),
    entity: r.entity,
    entityId: r.entityId,
  }));
}
