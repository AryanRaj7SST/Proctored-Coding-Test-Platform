import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { AttemptsTable, type AttemptRow } from '@/components/admin/AttemptsTable';

export const dynamic = 'force-dynamic';

export default async function AttemptsPage({
  searchParams,
}: {
  searchParams: Promise<{ examId?: string; userId?: string }>;
}) {
  await requireAdmin();
  const { examId, userId } = await searchParams;

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
      where: { active: true },
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
    const snapshot = (a.snapshot && typeof a.snapshot === 'object') ? (a.snapshot as Record<string, unknown>) : {};
    const manualReview = (snapshot.manualReview && typeof snapshot.manualReview === 'object')
      ? (snapshot.manualReview as Record<string, unknown>)
      : null;

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
      score: a.score,
      maxScore: a.maxScore,
      updatedAt: a.updatedAt.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? null,
      manuallyGraded: Boolean(manualReview),
      manualFeedback: (manualReview?.feedback as string) ?? null,
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">Submissions & Code Review</h1>
        <p className="mt-1 text-sm text-slate-400">
          Inspect student submitted code, compare with starter code, review test run timelines, and manually adjust scores or give feedback.
        </p>
      </div>

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

