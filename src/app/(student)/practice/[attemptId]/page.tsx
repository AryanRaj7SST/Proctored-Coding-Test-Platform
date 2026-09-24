import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/authz';
import { forbidden } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { toStudentQuestion } from '@/server/services/questions';
import { getExamTimeState } from '@/server/services/sessions';
import { COMPLETED_ATTEMPT_STATUSES } from '@/server/services/practice';
import { PracticeWorkspace } from '@/components/practice/PracticeWorkspace';

export const dynamic = 'force-dynamic';

interface PracticePageProps {
  params: Promise<{ attemptId: string }>;
}

export default async function PracticePage({ params }: PracticePageProps) {
  const user = await requireUser();
  const { attemptId } = await params;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: true,
      question: {
        include: {
          tests: { orderBy: { order: 'asc' } },
        },
      },
    },
  });

  if (!attempt || attempt.userId !== user.id) {
    notFound();
  }

  // Access control: only completed attempts can be practiced
  if (!COMPLETED_ATTEMPT_STATUSES.includes(attempt.status as (typeof COMPLETED_ATTEMPT_STATUSES)[number])) {
    notFound();
  }

  // Must not allow practice mode if the student's exam is currently in progress
  const timeState = await getExamTimeState(attempt.examId, user.id, attempt.exam);
  if (timeState.availability === 'IN_PROGRESS') {
    throw forbidden('Cannot access practice mode while the exam is currently in progress.');
  }

  return (
    <PracticeWorkspace
      attemptId={attempt.id}
      question={toStudentQuestion(attempt.question)}
      examTitle={attempt.exam.title}
      initialCode={{
        html: attempt.html,
        css: attempt.css,
        js: attempt.js,
      }}
    />
  );
}
