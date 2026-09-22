import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { conflict, handler, noContent, notFound, ok, readJson } from '@/lib/http';
import { examUpdateInput, parseOrThrow } from '@/lib/validation';
import { updateExam } from '@/server/services/exams';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: {
          question: {
            select: { id: true, title: true, slug: true, points: true, difficulty: true, validation: true },
          },
        },
      },
      assignments: {
        include: { user: { select: { id: true, name: true, email: true, batch: true } } },
        orderBy: { assignedAt: 'desc' },
      },
    },
  });
  if (!exam) throw notFound('Exam not found.');
  return ok(exam);
});

export const PATCH = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = parseOrThrow(examUpdateInput, await readJson(req));
  const exam = await updateExam(id, body);
  await recordAudit({
    userId: admin.id,
    action: 'exam.updated',
    entity: 'Exam',
    entityId: id,
    metadata: { status: exam.status },
  });
  return ok(exam);
});

/** Exams with attempts are archived rather than deleted so results survive. */
export const DELETE = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const attempts = await prisma.attempt.count({ where: { examId: id } });
  if (attempts > 0) {
    throw conflict('Students have attempted this exam. Archive it instead so results stay intact.');
  }
  await prisma.exam.delete({ where: { id } });
  await recordAudit({ userId: admin.id, action: 'exam.deleted', entity: 'Exam', entityId: id });
  return noContent();
});
