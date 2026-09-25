import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/authz';
import { badRequest, handler, noContent, ok, readJson } from '@/lib/http';
import { emailSchema, examAssignInput, parseOrThrow } from '@/lib/validation';
import { assignToExam, listAssignments, setAccommodation, unassign } from '@/server/services/assignments';
import { recordAudit } from '@/server/services/audit';
import { setTestAccess } from '@/server/services/test-access';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** The assignment table: assignees with their attempt state and best result. */
export const GET = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  await requireAdmin();
  const { id } = await ctx.params;
  return ok({ items: await listAssignments(id) });
});

/** Assign by account, email (even before first sign-in), batch, or all students. */
export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = parseOrThrow(examAssignInput, await readJson(req));
  const result = await assignToExam(id, body, admin.id);
  await recordAudit({
    userId: admin.id,
    action: 'exam.assigned',
    entity: 'Exam',
    entityId: id,
    metadata: {
      assigned: result.assigned,
      by: body.allStudents ? 'all' : body.batch ? 'batch' : body.emails?.length ? 'email' : 'user',
      ...(body.batch ? { batch: body.batch } : {}),
    },
  });
  return ok(result);
});

const assignmentPatchInput = z.union([
  z.object({ email: emailSchema, allowClipboard: z.boolean() }).strict(),
  z.object({ email: emailSchema, revoked: z.boolean() }).strict(),
]);

/**
 * Per-student settings for this test, set explicitly by an administrator and
 * audited:
 *  - `{ email, allowClipboard }` the accommodation that exempts one student from clipboard blocking;
 *  - `{ email, revoked }`        revoke (or restore) one student's access to this test only.
 *    Revoking ends a sitting in progress (its work is submitted); the account is untouched.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = parseOrThrow(assignmentPatchInput, await readJson(req, 4096));

  if ('revoked' in body) {
    const change = await setTestAccess(id, body.email, body.revoked, admin.id);
    await recordAudit({
      userId: admin.id,
      action: change.revoked ? 'exam.access_revoked' : 'exam.access_restored',
      entity: 'Exam',
      entityId: id,
      metadata: { email: change.email, ...(change.closedSitting ? { closedSitting: true } : {}) },
    });
    return ok(change);
  }

  await setAccommodation(id, body.email, body.allowClipboard);
  await recordAudit({
    userId: admin.id,
    action: 'exam.accommodation_updated',
    entity: 'Exam',
    entityId: id,
    metadata: { email: body.email, allowClipboard: body.allowClipboard },
  });
  return ok(body);
});

export const DELETE = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const raw = new URL(req.url).searchParams.get('email');
  if (!raw) throw badRequest('email is required.');
  const email = parseOrThrow(emailSchema, raw);
  await unassign(id, email);
  await recordAudit({
    userId: admin.id,
    action: 'exam.unassigned',
    entity: 'Exam',
    entityId: id,
    metadata: { email },
  });
  return noContent();
});
