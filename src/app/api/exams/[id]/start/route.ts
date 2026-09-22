import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireExamAccess, requireUser } from '@/lib/authz';
import { handler, ok } from '@/lib/http';
import { startExamSession, getExamTimeState } from '@/server/services/sessions';
import { getOrCreateAttempt, finalizeExpiredAttempts } from '@/server/services/attempts';
import { toStudentQuestion } from '@/server/services/questions';
import { countViolations } from '@/server/services/proctoring';
import { recordAudit, clientIp } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Start (or resume) a sitting and return everything the exam workspace needs.
 *
 * The expiry, the availability and the violation count all come from the
 * database. Nothing here is influenced by the client's clock or state.
 */
export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireUser();
  const { id: examId } = await ctx.params;
  const exam = await requireExamAccess(examId, user);

  // If the sitting silently ran out (closed laptop), finalise before resuming.
  const pre = await getExamTimeState(examId, user.id, exam);
  if (pre.availability === 'EXPIRED') {
    await finalizeExpiredAttempts(examId, user.id);
  }

  const session = await startExamSession(exam, user.id, req.headers.get('user-agent'));

  const examQuestions = await prisma.examQuestion.findMany({
    where: { examId },
    orderBy: { order: 'asc' },
    include: { question: { include: { tests: { orderBy: { order: 'asc' } } } } },
  });

  const questions = [];
  for (const eq of examQuestions) {
    const attempt = await getOrCreateAttempt(examId, eq.questionId, user.id);
    questions.push({
      order: eq.order,
      points: eq.pointsOverride ?? eq.question.points,
      question: toStudentQuestion(eq.question),
      attempt: {
        id: attempt.id,
        html: attempt.html,
        css: attempt.css,
        js: attempt.js,
        status: attempt.status,
        score: attempt.status === 'IN_PROGRESS' ? null : attempt.score,
        maxScore: attempt.maxScore,
        updatedAt: attempt.updatedAt.toISOString(),
      },
    });
  }

  const state = await getExamTimeState(examId, user.id, exam);
  await recordAudit({
    userId: user.id,
    action: 'exam.started',
    entity: 'Exam',
    entityId: examId,
    ip: clientIp(req),
  });

  return ok({
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      durationMinutes: exam.durationMinutes,
      maxViolations: exam.maxViolations,
    },
    session: {
      startedAt: session.startedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      msRemaining: state.msRemaining,
      serverTime: state.serverTime.toISOString(),
      availability: state.availability,
    },
    violationCount: await countViolations(user.id, examId),
    questions,
  });
});
