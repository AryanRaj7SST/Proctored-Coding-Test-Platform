import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireUser } from '@/lib/authz';
import { created, handler, ok, readJson } from '@/lib/http';
import { examCreateInput, parseOrThrow } from '@/lib/validation';
import { createExam, listStudentExams } from '@/server/services/exams';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

/**
 * Admins list every exam; students list only the exams assigned to them.
 * The role is read from the server session, never from the request.
 */
export const GET = handler(async (): Promise<NextResponse> => {
  const user = await requireUser();
  if (user.role !== 'ADMIN') return ok({ items: await listStudentExams(user.id) });

  const items = await prisma.exam.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { questions: true, assignments: true } } },
  });
  return ok({ items });
});

export const POST = handler(async (req: Request): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const body = parseOrThrow(examCreateInput, await readJson(req));
  const exam = await createExam(body);
  await recordAudit({
    userId: admin.id,
    action: 'exam.created',
    entity: 'Exam',
    entityId: exam.id,
    metadata: { title: exam.title },
  });
  return created(exam);
});
