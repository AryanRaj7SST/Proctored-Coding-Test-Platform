import { NextResponse } from 'next/server';
import { requireOwnedAttempt, requireUser } from '@/lib/authz';
import { forbidden, handler, ok, readJson, tooManyRequests } from '@/lib/http';
import { parseOrThrow, runInput } from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { executeTests, saveAttemptCode, toStudentOutcome } from '@/server/services/attempts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * "Run Test Cases".
 *
 * The request body carries ONLY the student's code. The spec is chosen by the
 * server from the attempt's frozen snapshot, so a student cannot point the
 * runner at another question's tests (product requirement #15).
 *
 * The response is the student-safe projection: no hidden test source, no
 * expected values, no runner internals.
 */
export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const limit = await rateLimit(`run:${user.id}`, env.runRateLimitPerMin, 60_000);
  if (!limit.allowed) {
    throw tooManyRequests(`Too many test runs. Try again in ${Math.ceil(limit.resetInMs / 1000)}s.`);
  }

  const attempt = await requireOwnedAttempt(id, user);
  if (user.role === 'ADMIN' && attempt.userId !== user.id) {
    throw forbidden('Administrators cannot run tests on a student attempt.');
  }

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
