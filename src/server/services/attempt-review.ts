import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { conflict, notFound } from '@/lib/errors';
import type { SessionUser } from '@/lib/authz';
import { eventTimeline } from './proctoring';
import { recordAudit } from './audit';

/**
 * Administrator review of one attempt. Scores are never edited here: they come
 * only from the grading formula (fix a wrong grade by regrading). Reviewers
 * can leave written feedback for the student.
 */

export interface AttemptFeedback {
  feedback: string;
  reviewedAt: string;
  reviewerId: string;
  reviewerName: string;
}

/** Everything an admin needs to review one attempt. */
export async function getAttemptReview(attemptId: string) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      user: { select: { id: true, name: true, email: true, batch: true } },
      exam: { select: { id: true, title: true, durationMinutes: true } },
      question: {
        select: {
          id: true,
          title: true,
          slug: true,
          starterHtml: true,
          starterCss: true,
          starterJs: true,
          referenceHtml: true,
          referenceCss: true,
          referenceJs: true,
        },
      },
      testResults: { orderBy: [{ final: 'desc' }, { createdAt: 'asc' }] },
      testRuns: { orderBy: { startedAt: 'desc' }, take: 25 },
    },
  });
  if (!attempt) throw notFound('Attempt not found.');

  const [session, timeline, reviewer] = await Promise.all([
    prisma.examSession.findUnique({ where: { id: attempt.sessionId } }),
    eventTimeline(attempt.userId, attempt.examId, { sessionId: attempt.sessionId }),
    attempt.reviewedById
      ? prisma.user.findUnique({ where: { id: attempt.reviewedById }, select: { name: true, email: true } })
      : null,
  ]);

  const snapshot = snapshotRecord(attempt.snapshot);
  return {
    attempt: {
      id: attempt.id,
      status: attempt.status,
      html: attempt.html,
      css: attempt.css,
      js: attempt.js,
      score: attempt.score,
      maxScore: attempt.maxScore,
      questionVersion: attempt.questionVersion,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      updatedAt: attempt.updatedAt.toISOString(),
      feedback: feedbackOf(attempt, reviewer),
      starterHtml: (snapshot.starterHtml as string) ?? attempt.question.starterHtml,
      starterCss: (snapshot.starterCss as string) ?? attempt.question.starterCss,
      starterJs: (snapshot.starterJs as string) ?? attempt.question.starterJs,
    },
    user: attempt.user,
    exam: attempt.exam,
    question: attempt.question,
    results: attempt.testResults,
    testRuns: attempt.testRuns,
    session: session
      ? {
          startedAt: session.startedAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
          lastHeartbeat: session.lastHeartbeat.toISOString(),
          endedAt: session.endedAt?.toISOString() ?? null,
          status: session.status,
          violationCount: session.violationCount,
        }
      : null,
    timeline: timeline.map((e) => ({ ...e, occurredAt: e.occurredAt.toISOString() })),
  };
}

function snapshotRecord(snapshot: Prisma.JsonValue): Record<string, unknown> {
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? (snapshot as Record<string, unknown>)
    : {};
}

/** The reviewer feedback stored with an attempt, if any. */
export function feedbackOf(
  attempt: { reviewFeedback: string | null; reviewedAt: Date | null; reviewedById: string | null },
  reviewer?: { name: string | null; email: string } | null,
): AttemptFeedback | null {
  if (!attempt.reviewFeedback) return null;
  return {
    feedback: attempt.reviewFeedback,
    reviewedAt: attempt.reviewedAt?.toISOString() ?? '',
    reviewerId: attempt.reviewedById ?? '',
    reviewerName: reviewer ? (reviewer.name ?? reviewer.email) : '',
  };
}

/** Save (or clear, with an empty string) reviewer feedback on a submitted attempt. */
export async function saveAttemptFeedback(
  attemptId: string,
  reviewer: SessionUser,
  feedback: string,
): Promise<AttemptFeedback | null> {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId }, select: { status: true } });
  if (!attempt) throw notFound('Attempt not found.');
  if (attempt.status === 'IN_PROGRESS')
    throw conflict('Feedback can be added once the attempt is submitted.');

  const text = feedback.trim();
  const updated = await prisma.attempt.update({
    where: { id: attemptId },
    data: text
      ? { reviewFeedback: text, reviewedAt: new Date(), reviewedById: reviewer.id }
      : { reviewFeedback: null, reviewedAt: null, reviewedById: null },
    select: { reviewFeedback: true, reviewedAt: true, reviewedById: true },
  });
  await recordAudit({
    userId: reviewer.id,
    action: 'attempt.feedback_saved',
    entity: 'Attempt',
    entityId: attemptId,
    metadata: { length: text.length },
  });
  return feedbackOf(updated, reviewer);
}
