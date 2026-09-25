import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/authz';
import { forbidden, handler, notFound, ok, tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { endExam } from '@/server/services/attempts';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireUser();
  const { id: examId } = await ctx.params;

  const limit = await rateLimit(`end-exam:${user.id}`, 5, 60_000);
  if (!limit.allowed) throw tooManyRequests('Please wait a moment before trying again.');

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, active: true },
  });
  if (!exam) throw notFound('Exam not found.');

  if (user.role !== 'ADMIN') {
    const assignment = await prisma.examAssignment.findUnique({
      where: { examId_userId: { examId, userId: user.id } },
    });
    if (!assignment) throw forbidden('You are not assigned to this exam.');
  }

  const result = await endExam(examId, user.id);
  return ok({ ok: true, ...result });
});
