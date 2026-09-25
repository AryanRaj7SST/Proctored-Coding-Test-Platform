import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok } from '@/lib/http';
import { parseOrThrow, resultsListInput } from '@/lib/validation';
import { listResults } from '@/server/services/results';

export const dynamic = 'force-dynamic';

/** Results per sitting (default: each student's best sitting per test), paginated. */
export const GET = handler(async (req: Request): Promise<NextResponse> => {
  await requireAdmin();
  const filter = parseOrThrow(resultsListInput, Object.fromEntries(new URL(req.url).searchParams));
  return ok(await listResults(filter));
});
