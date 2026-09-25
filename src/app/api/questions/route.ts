import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { created, handler, ok, readJson } from '@/lib/http';
import { parseOrThrow, questionCreateInput, questionListInput } from '@/lib/validation';
import { createQuestion, getQuestionForAdmin, listQuestions } from '@/server/services/questions';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

/** Question bank, filterable by status, difficulty, category, tag and text. */
export const GET = handler(async (req: Request): Promise<NextResponse> => {
  await requireAdmin();
  const filter = parseOrThrow(questionListInput, Object.fromEntries(new URL(req.url).searchParams));
  return ok(await listQuestions(filter));
});

export const POST = handler(async (req: Request): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const body = parseOrThrow(questionCreateInput, await readJson(req));
  const question = await createQuestion(body, admin.id);
  await recordAudit({
    userId: admin.id,
    action: 'question.created',
    entity: 'Question',
    entityId: question.id,
    metadata: { title: question.title, marks: body.marks, tests: question.tests.length },
  });
  return created(await getQuestionForAdmin(question.id));
});
