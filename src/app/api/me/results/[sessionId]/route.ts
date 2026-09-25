import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/authz';
import { handler, ok } from '@/lib/http';
import { idSchema, parseOrThrow } from '@/lib/validation';
import { getSittingResultForStudent } from '@/server/services/results';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ sessionId: string }> };

/** The signed-in student's own result, as the test's result visibility allows. */
export const GET = handler(async (_req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireAuth();
  const { sessionId } = await ctx.params;
  return ok(await getSittingResultForStudent(parseOrThrow(idSchema, sessionId), user.id));
});
