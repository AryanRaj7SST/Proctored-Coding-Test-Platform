import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, noContent, ok, readJson } from '@/lib/http';
import { allowedEmailUpdateInput, parseOrThrow } from '@/lib/validation';
import { removeAllowedEmail, updateAllowedEmail } from '@/server/services/allowed-emails';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = parseOrThrow(allowedEmailUpdateInput, await readJson(req, 8192));
  const entry = await updateAllowedEmail(id, body);
  await recordAudit({
    userId: admin.id,
    action: 'allowlist.updated',
    entity: 'AllowedEmail',
    entityId: id,
    metadata: { active: entry.active, role: entry.role },
  });
  return ok(entry);
});

export const DELETE = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  await removeAllowedEmail(id);
  await recordAudit({ userId: admin.id, action: 'allowlist.removed', entity: 'AllowedEmail', entityId: id });
  return noContent();
});
