import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/authz';
import { AppError } from '@/lib/errors';
import { studentQuestionOf } from '@/server/services/questions';
import { loadPracticeAttempt, PRACTICE_IN_PROGRESS_MESSAGE } from '@/server/services/practice';
import { PracticeWorkspace } from '@/components/practice/PracticeWorkspace';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

interface PracticePageProps {
  params: Promise<{ attemptId: string }>;
}

export default async function PracticePage({ params }: PracticePageProps) {
  const user = await requireAuth();
  const { attemptId } = await params;

  // Same checks as the practice run API: owner only, completed attempts only,
  // access not revoked, and never while the student's sitting is in progress.
  let attempt: Awaited<ReturnType<typeof loadPracticeAttempt>>;
  try {
    attempt = await loadPracticeAttempt(attemptId, user);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    if (err instanceof AppError && err.message === PRACTICE_IN_PROGRESS_MESSAGE) {
      return (
        <Card className="mx-auto max-w-xl space-y-3 p-5 text-sm text-slate-300">
          <p>Practice mode is not available while your test is in progress.</p>
          <Link href="/dashboard" className="text-brand-300 hover:underline">
            Back to dashboard
          </Link>
        </Card>
      );
    }
    if (err instanceof AppError && err.status === 403) notFound();
    throw err;
  }

  return (
    <PracticeWorkspace
      attemptId={attempt.id}
      // The question exactly as it was graded: the attempt's frozen snapshot and marks.
      question={studentQuestionOf(attempt)}
      examTitle={attempt.exam.title}
      initialCode={{
        html: attempt.html,
        css: attempt.css,
        js: attempt.js,
      }}
    />
  );
}
