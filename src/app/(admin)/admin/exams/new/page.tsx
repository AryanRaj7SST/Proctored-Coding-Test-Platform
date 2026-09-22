import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { ExamForm } from '@/components/admin/ExamForm';

export const dynamic = 'force-dynamic';

export default async function NewExamPage() {
  await requireAdmin();
  const [questions, students] = await Promise.all([
    prisma.question.findMany({
      where: { active: true },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, points: true, difficulty: true, validation: true },
    }),
    prisma.user.findMany({
      where: { role: 'STUDENT', active: true },
      orderBy: { email: 'asc' },
      select: { id: true, name: true, email: true, batch: true },
    }),
  ]);

  return <ExamForm questions={questions} students={students} />;
}
