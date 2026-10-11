import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { marksToNumber } from '@/server/grading/marks';
import { requireAdmin } from '@/lib/authz';
import { AttemptsTable, type AttemptRow } from '@/components/admin/AttemptsTable';
import { RegradeButton } from '@/components/admin/RegradeButton';
import { finalizeOverdueSittings } from '@/server/services/finalization';
import { logger, sanitizeError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export default async function AttemptsPage({
  searchParams,
}: {
  searchParams: Promise<{ examId?: string; userId?: string }>;
}) {
  await requireAdmin();
  const { examId, userId } = await searchParams;
  // Grade sittings students abandoned in the background without blocking page render (safe and idempotent).
  after(() =>
    finalizeOverdueSittings().catch((err) =>
      logger.warn('finalize.attempts_sweep_failed', { error: sanitizeError(err) }),
    ),
  );

  const [rawAttempts, exams, questions, batchRows] = await Promise.all([
    prisma.attempt.findMany({
      where: {
        ...(examId ? { examId } : {}),
        ...(userId ? { userId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
      include: {
        user: { select: { id: true, name: true, email: true, batch: true } },
        exam: { select: { id: true, title: true } },
        question: { select: { id: true, title: true } },
      },
    }),
    prisma.exam.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true },
    }),
    prisma.question.findMany({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: { title: 'asc' },
      select: { id: true, title: true },
    }),
    prisma.user.findMany({
      where: { batch: { not: null } },
      distinct: ['batch'],
      select: { batch: true },
      orderBy: { batch: 'asc' },
    }),
  ]);

  const attempts: AttemptRow[] = rawAttempts.map((a) => {
    return {
      id: a.id,
      userId: a.user.id,
      userName: a.user.name,
      userEmail: a.user.email,
      userBatch: a.user.batch,
      examId: a.exam.id,
      examTitle: a.exam.title,
      questionId: a.question.id,
      questionTitle: a.question.title,
      status: a.status,
      score: marksToNumber(a.score),
      maxScore: marksToNumber(a.maxScore),
      updatedAt: a.updatedAt.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? null,
      manuallyGraded: false,
      manualFeedback: a.reviewFeedback,
      gradingPending: a.status !== 'IN_PROGRESS' && !a.gradedAt,
    };
  });
  const pendingCount = attempts.filter((a) => a.gradingPending).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">Submissions & Code Review</h1>
        <p className="mt-1 text-sm text-slate-400">
          Inspect student submitted code, compare with starter code, review test run timelines, and manually
          adjust scores or give feedback.
        </p>
      </div>

      {pendingCount > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          <span>
            {pendingCount} submitted attempt(s) are awaiting grading because the test runner was unavailable.
            Their code is saved; no score has been recorded yet.
          </span>
          <RegradeButton examId={examId} label="Grade pending attempts" />
        </div>
      ) : null}

      <AttemptsTable
        attempts={attempts}
        exams={exams}
        questions={questions}
        batches={batchRows.map((b) => b.batch).filter((b): b is string => Boolean(b))}
        initialExamId={examId ?? ''}
        initialUserId={userId ?? ''}
      />
    </div>
  );
}
