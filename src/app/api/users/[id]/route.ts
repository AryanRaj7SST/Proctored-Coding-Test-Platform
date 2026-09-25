import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok, readJson } from '@/lib/http';
import { parseOrThrow, userAccessInput } from '@/lib/validation';
import { recordAudit } from '@/server/services/audit';
import { updateUserAccess } from '@/server/services/users';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Change an account's role or active state. Administrators only: a student
 * gets 403 before the body is read, so nobody can promote themselves.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = parseOrThrow(userAccessInput, await readJson(req, 4096));
  const { before, after } = await updateUserAccess(id, body, admin);

  if (before.role !== after.role) {
    await recordAudit({
      userId: admin.id,
      action: 'user.role_changed',
      entity: 'User',
      entityId: id,
      metadata: { email: after.email, role: { from: before.role, to: after.role } },
    });
  }
  if (before.active !== after.active) {
    await recordAudit({
      userId: admin.id,
      action: after.active ? 'user.reactivated' : 'user.deactivated',
      entity: 'User',
      entityId: id,
      metadata: { email: after.email },
    });
  }
  return ok(after);
});
