import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { badRequest, handler, notFound, ok } from '@/lib/http';
import { eventTimeline } from '@/server/services/proctoring';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const updateManualGradingSchema = z.object({
  score: z.number().int().min(0),
  feedback: z.string().max(5000).optional().nullable(),
  testResults: z
    .array(
      z.object({
        id: z.string(),
        pointsAwarded: z.number().int().min(0),
        passed: z.boolean(),
      }),
    )
    .optional(),
});

/**
 * Everything an admin needs to review one attempt: the student's code, the
 * graded results, every test run, and the proctoring timeline for that sitting.
 */
export const GET = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;

  const attempt = await prisma.attempt.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, batch: true } },
      exam: { select: { id: true, title: true, durationMinutes: true } },
      question: { select: { id: true, title: true, slug: true, starterHtml: true, starterCss: true, starterJs: true, referenceHtml: true, referenceCss: true, referenceJs: true } },
      testResults: { orderBy: [{ final: 'desc' }, { createdAt: 'asc' }] },
      testRuns: { orderBy: { startedAt: 'desc' }, take: 25 },
    },
  });
  if (!attempt) throw notFound('Attempt not found.');

  const [session, timeline] = await Promise.all([
    prisma.examSession.findUnique({ where: { userId_examId: { userId: attempt.userId, examId: attempt.examId } } }),
    eventTimeline(attempt.userId, attempt.examId),
  ]);

  const snapshot = (attempt.snapshot && typeof attempt.snapshot === 'object') ? (attempt.snapshot as Record<string, unknown>) : {};
  const manualReview = snapshot.manualReview ?? null;

  return ok({
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
      manualReview,
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
  });
});

/**
 * Manual grading / score adjustment and instructor feedback.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const attempt = await prisma.attempt.findUnique({
    where: { id },
    include: { testResults: true },
  });
  if (!attempt) throw notFound('Attempt not found.');

  const body = await req.json();
  const parsed = updateManualGradingSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(parsed.error.errors.map((e) => e.message).join('; '));
  }

  const { score, feedback, testResults } = parsed.data;
  if (score > attempt.maxScore) {
    throw badRequest(`Score cannot exceed maximum possible score of ${attempt.maxScore}.`);
  }

  // Update specific test results if provided
  if (testResults && testResults.length > 0) {
    for (const tr of testResults) {
      await prisma.testResult.updateMany({
        where: { id: tr.id, attemptId: attempt.id },
        data: {
          pointsAwarded: tr.pointsAwarded,
          passed: tr.passed,
        },
      });
    }
  }

  const currentSnapshot = (attempt.snapshot && typeof attempt.snapshot === 'object')
    ? (attempt.snapshot as Record<string, unknown>)
    : {};

  const existingReview = (currentSnapshot.manualReview && typeof currentSnapshot.manualReview === 'object')
    ? (currentSnapshot.manualReview as Record<string, unknown>)
    : null;

  const manualReview = {
    feedback: feedback ?? '',
    reviewedAt: new Date().toISOString(),
    reviewerId: admin.id,
    reviewerEmail: admin.email,
    reviewerName: admin.name ?? admin.email,
    previousScore: existingReview?.previousScore ?? attempt.score,
  };

  const updated = await prisma.attempt.update({
    where: { id },
    data: {
      score,
      gradedAt: new Date(),
      snapshot: {
        ...currentSnapshot,
        manualReview,
      } as object,
    },
    include: {
      testResults: { where: { final: true }, orderBy: { createdAt: 'asc' } },
    },
  });

  await recordAudit({
    userId: admin.id,
    action: 'attempt.manual_grade',
    entity: 'Attempt',
    entityId: attempt.id,
    metadata: {
      oldScore: attempt.score,
      newScore: score,
      maxScore: attempt.maxScore,
      feedback,
    },
  });

  return ok({
    score: updated.score,
    maxScore: updated.maxScore,
    manualReview,
    testResults: updated.testResults,
  });
});

