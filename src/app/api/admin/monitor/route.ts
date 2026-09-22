import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok } from '@/lib/http';
import { monitorSnapshot } from '@/server/services/monitor';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request): Promise<NextResponse> => {
  await requireAdmin();
  const examId = new URL(req.url).searchParams.get('examId') ?? undefined;
  return ok({ rows: await monitorSnapshot(examId), at: new Date().toISOString() });
});
