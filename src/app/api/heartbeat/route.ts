import { NextResponse } from 'next/server';
import { requireExamAccess, requireUser } from '@/lib/authz';
import { handler, ok, readJson } from '@/lib/http';
import { heartbeatInput, parseOrThrow } from '@/lib/validation';
import { heartbeat } from '@/server/services/sessions';
import { countViolations } from '@/server/services/proctoring';
import { finalizeExpiredAttempts } from '@/server/services/attempts';

export const dynamic = 'force-dynamic';

/**
 * Liveness ping from the exam page (every HEARTBEAT_INTERVAL_SECONDS).
 *
 * This is also where a sitting that has run out is finalised, so the server
 * enforces the deadline even when the student's countdown has been tampered
 * with or the tab was closed and reopened.
 */
export const POST = handler(async (req: Request): Promise<NextResponse> => {
  const user = await requireUser();
  const body = parseOrThrow(heartbeatInput, await readJson(req, 4096));
  await requireExamAccess(body.examId, user);

  const beat = await heartbeat(body.examId, user.id);
  let expired = false;
  if (beat.msRemaining <= 0 && beat.status !== 'NONE' && beat.status !== 'SUBMITTED') {
    await finalizeExpiredAttempts(body.examId, user.id);
    expired = true;
  }

  return ok({
    status: beat.status,
    msRemaining: beat.msRemaining,
    expired,
    serverTime: new Date().toISOString(),
    violationCount: await countViolations(user.id, body.examId),
  });
});
