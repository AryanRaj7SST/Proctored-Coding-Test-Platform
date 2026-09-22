import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { ExamForm, examValuesFrom } from '@/components/admin/ExamForm';

export const dynamic = 'force-dynamic';

export default async function EditExamPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const exam = await prisma.exam.findUnique({
    where: { id },
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
}
