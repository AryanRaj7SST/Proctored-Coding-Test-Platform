import { NextResponse } from 'next/server';
import { requireAttemptAccess, requireAuth } from '@/lib/authz';
import { handler, ok, readJson, tooManyRequests } from '@/lib/http';
import { parseOrThrow, runInput } from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { toStudentOutcome } from '@/lib/outcome';
import { executeTests } from '@/server/grading/run-tests';
import { saveAttemptCode } from '@/server/services/attempts';

export const dynamic = 'force-dynamic';
// A run waits up to RUNNER_TIMEOUT_MS + RUNNER_TEST_TIMEOUT_MS per test case (lib/runner-client),
// about 270 s for a 40-test question: Vercel must not cut it off first.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/**
 * "Run Test Cases".
 *
 * The request body carries ONLY the student's code. The spec is chosen by the
 * server from the attempt's frozen snapshot, so a student cannot point the
 * runner at another question's tests (product requirement #15).
 *
 * The response is the student-safe projection (lib/outcome.ts): per-test
 * results from the test definitions and the page, never runner internals.
 */
export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireAuth();
  const { id } = await ctx.params;

  const limit = await rateLimit(`run:${user.id}`, env.runRateLimitPerMin, 60_000);
  if (!limit.allowed) {
    throw tooManyRequests(`Too many test runs. Try again in ${Math.ceil(limit.resetInMs / 1000)}s.`);
  }

  const attempt = await requireAttemptAccess(id, user, 'write');

  const body = parseOrThrow(runInput, await readJson(req, env.maxCodeBytes * 3 + 4096));

  // Persisting first means a crash mid-run never loses the student's work.
  await saveAttemptCode(id, user.id, body);

  const outcome = await executeTests({
    attempt,
    code: body,
    kind: 'PRACTICE',
    final: false,
    userId: user.id,
  });
  return ok(toStudentOutcome(outcome));
});
