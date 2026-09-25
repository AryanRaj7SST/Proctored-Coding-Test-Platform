import { NextResponse } from 'next/server';
import { requireAuth, requireTestAccess } from '@/lib/authz';
import { handler, ok, readJson, tooManyRequests } from '@/lib/http';
import { parseOrThrow, proctorEventInput } from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { reportProctorEvent } from '@/server/services/workspace';

export const dynamic = 'force-dynamic';
// Reaching the violation limit grades the open attempts inside this request.
export const maxDuration = 60;

/**
 * Record a browser proctoring event.
 *
 * The returned violation count is recomputed from the database on every call,
 * so refreshing the page or editing React state cannot reset it
 * (product requirement #22). Duplicate blur/visibilitychange pairs collapse
 * server-side into a single violation (product requirement #21).
 */
export const POST = handler(async (req: Request): Promise<NextResponse> => {
  const user = await requireAuth();

  const limit = rateLimit(`proctor:${user.id}`, env.proctorRateLimitPerMin, 60_000);
  if (!limit.allowed) throw tooManyRequests('Too many proctoring events.');

  const body = parseOrThrow(proctorEventInput, await readJson(req, 16_384));
  const exam = await requireTestAccess(body.examId, user);
  const result = await reportProctorEvent(exam, user, {
    type: body.type,
    attemptId: body.attemptId ?? null,
    durationMs: body.durationMs,
    metadata: body.metadata,
  });
  return ok(result);
});
