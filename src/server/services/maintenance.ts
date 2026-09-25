import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { finalizeOverdueSittings } from './finalization';
import { sweepStaleSessions } from './sessions';

export interface MaintenanceReport {
  staleSessionsMarked: number;
  sittingsFinalized: number;
  practiceRunsDeleted: number;
  runLogsCleared: number;
}

/**
 * Housekeeping that must happen even when nobody has a page open -- on a
 * serverless deployment nothing runs between requests. Pages still trigger
 * the same sweeps opportunistically; this is the scheduled safety net
 * (Vercel Cron -> /api/cron/maintenance).
 *
 *  - sittings abandoned by their student are finalised and graded, and
 *    grading that stalled (runner outage) is retried;
 *  - the test-log retention promised in the admin UI is applied. Graded
 *    evidence is never deleted: SUBMISSION and VALIDATION runs keep their
 *    results and code; only their console logs and error text are cleared.
 *    Practice runs ("Run Tests") past retention are removed outright.
 */
export async function runMaintenance(
  opts: { now?: Date; retentionDays?: number } = {},
): Promise<MaintenanceReport> {
  const now = opts.now ?? new Date();
  const retentionDays = opts.retentionDays ?? env.testLogRetentionDays;

  const staleSessionsMarked = await sweepStaleSessions();
  const sittingsFinalized = await finalizeOverdueSittings({ limit: 200, force: true });

  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const practice = await prisma.testRun.deleteMany({
    where: { kind: 'PRACTICE', startedAt: { lt: cutoff } },
  });
  const logs = await prisma.testRun.updateMany({
    where: { startedAt: { lt: cutoff }, OR: [{ logs: { not: null } }, { error: { not: null } }] },
    data: { logs: null, error: null },
  });

  return {
    staleSessionsMarked,
    sittingsFinalized,
    practiceRunsDeleted: practice.count,
    runLogsCleared: logs.count,
  };
}
