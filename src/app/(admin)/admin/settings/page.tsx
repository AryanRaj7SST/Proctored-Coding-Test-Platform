import { requireAdmin } from '@/lib/authz';
import { env } from '@/lib/env';
import { runnerHealth } from '@/lib/runner-client';
import { prisma } from '@/lib/prisma';
import { Badge, Card, CardBody, CardHeader, Table, Td, Th } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Operational settings are environment variables, not database rows, so this
 * page is read-only on purpose: an admin should not be able to widen a security
 * limit from inside the app.
 */
export default async function SettingsPage() {
  await requireAdmin();

  const [runner, dbOk, audits] = await Promise.all([
    runnerHealth().catch(() => ({ ok: false, detail: 'unreachable' })),
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { user: { select: { email: true } } },
    }),
  ]);

  const rows: { label: string; value: string; note?: string }[] = [
    { label: 'Runner URL', value: env.runnerUrl || '(not set)', note: 'Where graded executions are sent' },
    { label: 'Runner timeout', value: `${env.runnerTimeoutMs} ms` },
    { label: 'Max code size', value: `${Math.round(env.maxCodeBytes / 1000)} KB per file` },
    { label: 'Run rate limit', value: `${env.runRateLimitPerMin}/min per student` },
    { label: 'Submit rate limit', value: `${env.submitRateLimitPerMin}/min per student` },
    { label: 'Proctor event limit', value: `${env.proctorRateLimitPerMin}/min per student` },
    { label: 'Heartbeat interval', value: `${env.heartbeatIntervalSeconds}s` },
    { label: 'Session considered stale after', value: `${env.sessionStaleSeconds}s without a heartbeat` },
    {
      label: 'Test log retention',
      value: `${env.testLogRetentionDays} days`,
      note: 'Applied by the scheduled maintenance job',
    },
    {
      label: 'Scheduled maintenance',
      value: env.cronSecret ? 'Enabled (/api/cron/maintenance)' : 'Disabled: set CRON_SECRET',
      note: 'Grades abandoned sittings, retries stalled grading, applies log retention',
    },
    { label: 'Log level', value: env.logLevel },
    { label: 'Environment', value: env.isProduction ? 'production' : 'development' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Read-only. These come from environment variables — change them in <code>.env</code> and restart.
        </p>
      </div>

      <div className="flex gap-2">
        <Badge tone={dbOk ? 'ok' : 'bad'}>Database {dbOk ? 'connected' : 'unreachable'}</Badge>
        <Badge tone={runner.ok ? 'ok' : 'bad'}>Runner {runner.ok ? 'online' : 'offline'}</Badge>
      </div>

      <Card>
        <CardHeader title="Configuration" />
        <CardBody className="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Setting</Th>
                <Th>Value</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <Td className="text-slate-300">{r.label}</Td>
                  <Td className="font-mono text-xs text-slate-200">{r.value}</Td>
                  <Td className="text-xs text-slate-500">{r.note ?? ''}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Audit log" subtitle="Last 25 administrative actions" />
        <CardBody className="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>By</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => (
                <tr key={a.id}>
                  <Td className="text-slate-300">{a.action}</Td>
                  <Td className="text-xs text-slate-500">
                    {a.entity}
                    {a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ''}
                  </Td>
                  <Td className="text-xs text-slate-400">{a.user?.email ?? 'system'}</Td>
                  <Td className="text-xs text-slate-500">{formatDateTime(a.createdAt)}</Td>
                </tr>
              ))}
              {audits.length === 0 ? (
                <tr>
                  <Td className="text-xs text-slate-500">Nothing recorded yet.</Td>
                  <Td />
                  <Td />
                  <Td />
                </tr>
              ) : null}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
