import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok } from '@/lib/http';
import { dashboardStats, recentActivity, recentSubmissions } from '@/server/services/dashboard';

export const dynamic = 'force-dynamic';

export const GET = handler(async (): Promise<NextResponse> => {
  await requireAdmin();
  const [stats, submissions, activity] = await Promise.all([
    dashboardStats(),
    recentSubmissions(),
    recentActivity(),
  ]);
  return ok({ stats, submissions, activity });
});
