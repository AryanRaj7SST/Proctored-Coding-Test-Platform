import { NextResponse } from 'next/server';
import { requireUser, requireExamAccess } from '@/lib/authz';
import { handler, ok, readJson, tooManyRequests } from '@/lib/http';
import { parseOrThrow, proctorEventInput } from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { recordProctorEvent } from '@/server/services/proctoring';

export const dynamic = 'force-dynamic';

/**
 * Record a browser proctoring event.
 *
 * The returned violation count is recomputed from the database on every call,
 * so refreshing the page or editing React state cannot reset it
 * (product requirement #22). Duplicate blur/visibilitychange pairs collapse
 * server-side into a single violation (product requirement #21).
 */
export const POST = handler(async (req: Request): Promise<NextResponse> => {
  const user = await requireUser();

  const limit = rateLimit(`proctor:${user.id}`, env.proctorRateLimitPerMin, 60_000);
  if (!limit.allowed) throw tooManyRequests('Too many proctoring events.');

  const body = parseOrThrow(proctorEventInput, await readJson(req, 16_384));
  await requireExamAccess(body.examId, user);

  const result = await recordProctorEvent({
    userId: user.id,
    examId: body.examId,
    attemptId: body.attemptId ?? null,
    type: body.type,
    durationMs: body.durationMs,
    metadata: body.metadata,
  });

  return ok({
    recorded: result.recorded,
    violationCount: result.violationCount,
    message: result.message,
  });
});
