import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/authz';
import { handler, ok, readJson, tooManyRequests } from '@/lib/http';
import { parseOrThrow, runInput } from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { executePracticeTests } from '@/server/services/practice';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ attemptId: string }> };

/**
 * Run test cases in practice mode.
 *
 * This endpoint:
 *  - Enforces ownership & completed attempt status.
 *  - Never updates the Attempt row (no code overwrite, no score change).
 *  - Executes tests against the runner as an unlinked validation run.
 *  - Returns safe student outcome projections.
 */
export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireUser();
  const { attemptId } = await ctx.params;

  const limit = await rateLimit(`practice-run:${user.id}`, env.runRateLimitPerMin, 60_000);
  if (!limit.allowed) {
    throw tooManyRequests(`Too many test runs. Try again in ${Math.ceil(limit.resetInMs / 1000)}s.`);
  }

  const body = parseOrThrow(runInput, await readJson(req, env.maxCodeBytes * 3 + 4096));

  const outcome = await executePracticeTests({
    attemptId,
    user,
    code: body,
  });

  return ok(outcome);
});
