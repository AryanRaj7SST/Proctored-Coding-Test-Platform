import { prisma } from '@/lib/prisma';
import { gradeSitting } from './evaluate';
import { fromMicro, toMicro } from './marks';

/**
 * Recompute a sitting's stored totals from its attempts.
 *
 * Totals exist only for a closed sitting whose every attempt is graded;
 * otherwise they are cleared, so a sitting with grading pending never shows
 * a (partial) score or a FAIL. Idempotent: safe after any grading or regrade.
 */
export async function refreshSittingTotals(sessionId: string): Promise<void> {
  const session = await prisma.examSession.findUnique({
    where: { id: sessionId },
    select: {
      endedAt: true,
      maxScore: true,
      exam: { select: { passingPercentage: true } },
      attempts: { select: { status: true, gradedAt: true, score: true } },
    },
  });
  if (!session) return;

  const scores = session.attempts.map((a) =>
    a.status !== 'IN_PROGRESS' && a.gradedAt ? toMicro(a.score) : null,
  );
  const grade = gradeSitting(scores, toMicro(session.maxScore), session.exam.passingPercentage);
  const complete = session.endedAt !== null && grade.complete;

  await prisma.examSession.update({
    where: { id: sessionId },
    data: complete
      ? {
          score: fromMicro(grade.scoreMicro),
          percentage: grade.percentage,
          result: grade.result,
          gradedAt: new Date(),
        }
      : { score: null, percentage: null, result: null, gradedAt: null },
  });
}
