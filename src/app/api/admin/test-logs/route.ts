import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { handler, ok } from '@/lib/http';
import { paginationInput, parseOrThrow } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Runner execution log index (product requirement #17).
 *
 * `logs` holds sanitized console output captured inside the sandbox and is
 * truncated at write time; no secrets and no environment ever reach this table. See TEST_LOG_RETENTION_DAYS in docs/security.md for
 * the retention policy.
 */
export const GET = handler(async (req: Request): Promise<NextResponse> => {
  await requireAdmin();
  const url = new URL(req.url);
  const { page, pageSize } = parseOrThrow(paginationInput, Object.fromEntries(url.searchParams));
  const status = url.searchParams.get('status');
  const kind = url.searchParams.get('kind');
  const attemptId = url.searchParams.get('attemptId');

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(kind ? { kind: kind as never } : {}),
    ...(attemptId ? { attemptId } : {}),
  };

  const [total, runs] = await Promise.all([
    prisma.testRun.count({ where }),
    prisma.testRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        attempt: {
          select: {
            id: true,
            examId: true,
            user: { select: { name: true, email: true } },
            question: { select: { title: true } },
            exam: { select: { title: true } },
          },
        },
      },
    }),
  ]);

  // VALIDATION runs have no attempt; resolve their question title separately.
  const orphanQuestionIds = [
    ...new Set(runs.filter((r) => !r.attempt && r.questionId).map((r) => r.questionId as string)),
  ];
  const orphanQuestions = orphanQuestionIds.length
    ? await prisma.question.findMany({
        where: { id: { in: orphanQuestionIds } },
        select: { id: true, title: true },
      })
    : [];

  const items = runs.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    passedCount: r.passedCount,
    failedCount: r.failedCount,
    totalCount: r.totalCount,
    score: r.score,
    maxScore: r.maxScore,
    durationMs: r.durationMs,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    logs: r.logs,
    error: r.error,
    attemptId: r.attemptId,
    examTitle: r.attempt?.exam.title ?? null,
    studentName: r.attempt?.user.name ?? r.attempt?.user.email ?? null,
    studentEmail: r.attempt?.user.email ?? null,
    questionTitle:
      r.attempt?.question.title ?? orphanQuestions.find((q) => q.id === r.questionId)?.title ?? null,
  }));

  return ok({ items, total, page, pageSize });
});
