import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { getAdminExamLeaderboard } from '@/server/services/leaderboard';
import { AdminLeaderboardView } from '@/components/admin/leaderboard/AdminLeaderboardView';

export const dynamic = 'force-dynamic';

export default async function AdminExamLeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const exam = await prisma.exam.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!exam) notFound();

  const data = await getAdminExamLeaderboard({ examId: id, pageSize: 200 });

  return <AdminLeaderboardView initialData={data} examId={id} />;
}
