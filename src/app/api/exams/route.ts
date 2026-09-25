import { NextResponse } from 'next/server';
import { requireAdmin, requireAuth } from '@/lib/authz';
import { created, handler, ok, readJson } from '@/lib/http';
import { examCreateInput, examListInput, parseOrThrow } from '@/lib/validation';
import { createExam, listExamsForAdmin, listStudentExams } from '@/server/services/exams';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

/**
 * Admins list every test (filterable by phase); students list the tests open
 * to them. The role is read from the server session, never from the request.
 */
export const GET = handler(async (req: Request): Promise<NextResponse> => {
  const user = await requireAuth();
  if (user.role !== 'ADMIN') return ok({ items: await listStudentExams(user.id) });
  const filter = parseOrThrow(examListInput, Object.fromEntries(new URL(req.url).searchParams));
  return ok(await listExamsForAdmin(filter));
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
    metadata: { title: exam.title, questions: body.questions.length, accessMode: exam.accessMode },
  });
  return created(exam);
});
