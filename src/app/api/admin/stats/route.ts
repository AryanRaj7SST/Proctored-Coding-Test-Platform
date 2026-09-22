import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok } from '@/lib/http';
import { dashboardStats, recentActivity } from '@/server/services/monitor';

export const dynamic = 'force-dynamic';

export const GET = handler(async (): Promise<NextResponse> => {
  await requireAdmin();
  const [stats, activity] = await Promise.all([dashboardStats(), recentActivity()]);
  return ok({ stats, activity: activity.map((a) => ({ ...a, at: a.at.toISOString() })) });
});
