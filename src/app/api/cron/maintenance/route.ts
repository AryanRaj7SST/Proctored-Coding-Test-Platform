import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { handler, ok } from '@/lib/http';
import { notFound, unauthorized } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { runMaintenance } from '@/server/services/maintenance';

export const dynamic = 'force-dynamic';
// Finalising abandoned sittings grades their answers after the response.
export const maxDuration = 300;

function bearerMatches(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scheduled housekeeping (see vercel.json "crons"). Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET configured the
 * endpoint does not exist (404); with a wrong token it is a 401.
 */
export const GET = handler(async (req: Request): Promise<NextResponse> => {
  if (!env.cronSecret) throw notFound();
  if (!bearerMatches(req.headers.get('authorization'), env.cronSecret)) throw unauthorized();
  const report = await runMaintenance();
  logger.info('maintenance.completed', { ...report });
  return ok(report);
});
