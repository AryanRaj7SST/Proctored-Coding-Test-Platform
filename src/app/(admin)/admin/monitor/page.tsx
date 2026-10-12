import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { monitorSnapshot } from '@/server/services/monitor';
import { MonitorTable } from '@/components/admin/MonitorTable';

export const dynamic = 'force-dynamic';

export default async function MonitorPage() {
  await requireAdmin();
  const [rows, exams] = await Promise.all([
    monitorSnapshot(),
    prisma.exam.findMany({
      where: { status: { in: ['PUBLISHED', 'ENDED'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Live monitor</h1>
        <p className="mt-1 text-sm text-slate-500">
          Updates every few seconds over a server-sent event stream. Reconnects automatically.
        </p>
      </div>
      <MonitorTable exams={exams} initial={{ rows, at: new Date().toISOString() }} />
    </div>
  );
}
