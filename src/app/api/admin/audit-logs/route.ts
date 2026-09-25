import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok } from '@/lib/http';
import { auditListInput, parseOrThrow } from '@/lib/validation';
import { listAuditLogs } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

/** Audit trail (admin only), filterable by action prefix, entity and actor. */
export const GET = handler(async (req: Request): Promise<NextResponse> => {
  await requireAdmin();
  const filter = parseOrThrow(auditListInput, Object.fromEntries(new URL(req.url).searchParams));
  return ok(await listAuditLogs(filter));
});
