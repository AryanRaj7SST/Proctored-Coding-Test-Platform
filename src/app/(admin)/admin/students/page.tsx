import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, Td, Th } from '@/components/ui';
import { formatDateTime, percentage } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Registered people — anyone who has actually signed in at least once.
 * Invitations that have never been used live on the allowlist page instead.
 */
export default async function StudentsPage() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { email: 'asc' }],
    include: { _count: { select: { assignments: true, attempts: true } } },
  });

  const scores = await prisma.attempt.groupBy({
    by: ['userId'],
    where: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } },
    _sum: { score: true, maxScore: true },
  });

  const violations = await prisma.proctorEvent.groupBy({
    by: ['userId'],
    where: { violation: true },
    _count: { _all: true },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">Students</h1>
        <p className="mt-1 text-sm text-slate-400">
          People who have signed in. To invite someone new, add their address to the{' '}
          <Link href="/admin/allowed-emails" className="text-brand-300 hover:underline">
            allowlist
          </Link>
          .
        </p>
      </div>

      <Card>
        <CardHeader title="Registered accounts" subtitle={`${users.length} total`} />
        <CardBody className="p-0">
          {users.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="Nobody has signed in yet"
                description="Accounts are created the first time an allowlisted address signs in with Google."
              />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Person</Th>
                  <Th>Role</Th>
                  <Th>Batch</Th>
                  <Th>Assigned</Th>
                  <Th>Attempts</Th>
                  <Th>Overall</Th>
                  <Th>Violations</Th>
                  <Th>Last sign-in</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const score = scores.find((s) => s.userId === u.id);
                  const sum = score?._sum.score ?? 0;
                  const max = score?._sum.maxScore ?? 0;
                  const v = violations.find((x) => x.userId === u.id)?._count._all ?? 0;
                  return (
                    <tr key={u.id}>
                      <Td>
                        <p className="font-medium text-slate-100">{u.name ?? u.email}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </Td>
                      <Td>
                        <Badge tone={u.role === 'ADMIN' ? 'info' : 'neutral'}>{u.role.toLowerCase()}</Badge>
                      </Td>
                      <Td className="text-slate-400">{u.batch ?? '—'}</Td>
                      <Td className="text-slate-400">{u._count.assignments}</Td>
                      <Td className="text-slate-400">{u._count.attempts}</Td>
                      <Td className="text-slate-300">{max > 0 ? `${sum}/${max} (${percentage(sum, max)}%)` : '—'}</Td>
                      <Td>
                        <Badge tone={v > 0 ? 'bad' : 'neutral'}>{v}</Badge>
                      </Td>
                      <Td className="text-xs text-slate-500">{formatDateTime(u.lastLogin)}</Td>
                      <Td>
                        {u._count.attempts > 0 ? (
                          <Link
                            href={`/admin/attempts?userId=${u.id}`}
                            className="text-xs text-brand-300 hover:underline"
                          >
                            Review ({u._count.attempts})
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
