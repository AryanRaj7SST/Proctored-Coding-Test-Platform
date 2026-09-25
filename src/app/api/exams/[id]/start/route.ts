import { NextResponse } from 'next/server';
import { requireAuth, requireTestAccess } from '@/lib/authz';
import { handler, ok } from '@/lib/http';
import { openWorkspace } from '@/server/services/workspace';
import { clientIp } from '@/server/services/audit';

export const dynamic = 'force-dynamic';
// Resuming may finalise (and grade) an overdue sitting first.
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Start (or resume) a sitting and return everything the exam workspace needs.
 * The expiry, availability and violation count all come from the database.
 */
export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireAuth();
  const { id: examId } = await ctx.params;
  const exam = await requireTestAccess(examId, user);
  const workspace = await openWorkspace(exam, user, {
    userAgent: req.headers.get('user-agent'),
    ip: clientIp(req),
  });
  return ok(workspace);
});
