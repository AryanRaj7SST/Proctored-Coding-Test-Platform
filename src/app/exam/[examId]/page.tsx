import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { ExamWorkspace } from '@/components/exam/ExamWorkspace';

export const dynamic = 'force-dynamic';

/**
 * The exam workspace is rendered outside the student layout: no site chrome,
 * no navigation, nothing to click away to by accident.
 */
export default async function ExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const user = await getSessionUser();
  const { examId } = await params;
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/exam/${examId}`)}`);

  // Existence + assignment are re-checked by the API; this only avoids
  // rendering a whole IDE for an exam the student cannot open.
  if (user.role !== 'ADMIN') {
    const assignment = await prisma.examAssignment.findUnique({
      where: { examId_userId: { examId, userId: user.id } },
      select: { id: true },
    });
    if (!assignment) notFound();
  }

  return <ExamWorkspace examId={examId} />;
}
