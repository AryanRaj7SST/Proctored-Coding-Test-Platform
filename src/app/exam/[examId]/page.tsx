import { notFound, redirect } from 'next/navigation';
import { getSessionUser, requireTestAccess } from '@/lib/authz';
import { AppError } from '@/lib/errors';
import type { ExamAvailability } from '@/lib/timing';
import { ProctoredTest } from '@/components/proctor/ProctoredTest';
import { getExamTimeState } from '@/server/services/sessions';

export const dynamic = 'force-dynamic';

const NOT_READY: Partial<Record<ExamAvailability, string>> = {
  NOT_STARTED: 'This test has not opened yet.',
  ENDED: 'This test has closed.',
  SUBMITTED: 'You have already submitted this test and have no attempts left.',
  EXPIRED: 'Your time for this test has run out.',
  UNPUBLISHED: 'This test is not available.',
};

/**
 * The exam workspace is rendered outside the student layout: no site chrome,
 * no navigation, nothing to click away to by accident.
 */
export default async function ExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const user = await getSessionUser();
  const { examId } = await params;
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/exam/${examId}`)}`);

  // Every workspace API call re-checks access; this only avoids rendering a
  // whole IDE for a test the student cannot open.
  let exam;
  try {
    exam = await requireTestAccess(examId, user);
  } catch (err) {
    if (err instanceof AppError) notFound();
    throw err;
  }

  // Read-only: whether a sitting can start (or resume) right now. The server
  // decides again, authoritatively, when the student presses Start.
  const { availability } = await getExamTimeState(exam.id, user.id, exam);
  const ready = availability === 'AVAILABLE' || availability === 'IN_PROGRESS';

  return (
    <ProctoredTest
      examId={examId}
      readiness={{
        title: exam.title,
        durationMinutes: exam.durationMinutes,
        resuming: availability === 'IN_PROGRESS',
        ready,
        message: ready ? null : (NOT_READY[availability] ?? 'This test cannot be started right now.'),
      }}
    />
  );
}
