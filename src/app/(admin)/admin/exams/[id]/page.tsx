import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { ExamForm, examValuesFrom } from '@/components/admin/ExamForm';

export const dynamic = 'force-dynamic';

export default async function EditExamPage({ params }: { params: Promise<{ id: string }> }) {
  let examId = 'unknown';
  try {
    await requireAdmin();
    const resolvedParams = await params;
    examId = resolvedParams.id;

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: { orderBy: { order: 'asc' }, select: { questionId: true } },
        assignments: { select: { userId: true } },
      },
    });
    if (!exam) notFound();

    const [questions, students] = await Promise.all([
      prisma.question.findMany({
        where: { OR: [{ active: true }, { id: { in: exam.questions.map((q) => q.questionId) } }] },
        orderBy: { title: 'asc' },
        select: { id: true, title: true, points: true, difficulty: true, validation: true },
      }),
      prisma.user.findMany({
        where: { role: 'STUDENT', active: true },
        orderBy: { email: 'asc' },
        select: { id: true, name: true, email: true, batch: true },
      }),
    ]);

    return (
      <ExamForm
        initial={examValuesFrom({ ...exam, questionIds: exam.questions.map((q) => q.questionId) })}
        questions={questions}
        students={students}
        assignedIds={exam.assignments.map((a) => a.userId)}
      />
    );
  } catch (err: any) {
    if (err?.digest?.startsWith('NEXT_')) throw err;
    console.error(`[EditExamPage] Error loading exam ${examId}:`, err);
    return (
      <div className="space-y-4 rounded-lg bg-bad/10 p-6 text-slate-100 ring-1 ring-bad/30">
        <h2 className="text-lg font-semibold text-rose-400">Failed to load exam editor ({examId})</h2>
        <pre className="mt-2 overflow-auto rounded bg-ink-900 p-3 text-xs text-rose-300">
          {err?.stack || err?.message || String(err)}
        </pre>
      </div>
    );
  }
}
