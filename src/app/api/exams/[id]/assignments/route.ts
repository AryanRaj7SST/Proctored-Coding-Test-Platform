import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { badRequest, handler, noContent, ok, readJson } from '@/lib/http';
import { examAssignInput, idSchema, parseOrThrow } from '@/lib/validation';
import { assignStudents, unassignStudent } from '@/server/services/exams';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = parseOrThrow(examAssignInput, await readJson(req));
  const result = await assignStudents(id, body);
  await recordAudit({
    userId: admin.id,
    action: 'exam.assigned',
    entity: 'Exam',
    entityId: id,
    metadata: { assigned: result.assigned },
  });
  return ok(result);
});

export const DELETE = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId) throw badRequest('userId is required.');
  parseOrThrow(idSchema, userId);
  await unassignStudent(id, userId);
  await recordAudit({
    userId: admin.id,
    action: 'exam.unassigned',
    entity: 'Exam',
    entityId: id,
    metadata: { student: userId },
  });
  return noContent();
});
