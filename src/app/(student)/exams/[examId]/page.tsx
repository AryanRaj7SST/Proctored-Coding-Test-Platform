import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/authz';
import { getContestLandingData } from '@/server/services/contest-landing';
import { ContestLandingView } from './ContestLandingView';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ examId: string }>;
}

export default async function ContestLandingPage({ params }: PageProps) {
  const user = await getSessionUser();
  const { examId } = await params;

  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/exams/${examId}`)}`);
  }

  let data;
  try {
    data = await getContestLandingData(examId, user);
  } catch (err: unknown) {
    const errorObj = err as { status?: number; code?: string } | null;
    if (errorObj?.status === 404 || errorObj?.code === 'NOT_FOUND') {
      notFound();
    }
    throw err;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <ContestLandingView data={data} user={user} />
    </div>
  );
}
