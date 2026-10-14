import { notFound, redirect } from 'next/navigation';
import { getSessionUser, requireTestAccess } from '@/lib/authz';
import { AppError } from '@/lib/errors';
import { LeaderboardView } from './LeaderboardView';
import { TopBar } from '@/components/TopBar';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ examId: string }>;
}

export default async function LeaderboardPage({ params }: PageProps) {
  const user = await getSessionUser();
  const { examId } = await params;

  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/exams/${examId}/leaderboard`)}`);
  }

  let exam;
  try {
    exam = await requireTestAccess(examId, user);
  } catch (err) {
    if (err instanceof AppError) notFound();
    throw err;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <TopBar user={user} title={exam.title} variant="scaler" />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <LeaderboardView
          examId={examId}
          examTitle={exam.title}
          currentUserHandle={user.name ? undefined : undefined}
          currentUserId={user.id}
        />
      </main>
    </div>
  );
}
