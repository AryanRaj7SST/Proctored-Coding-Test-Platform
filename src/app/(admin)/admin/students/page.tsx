import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { marksToNumber } from '@/server/grading/marks';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Table, Td, Th } from '@/components/ui';
import { Pagination } from '@/components/admin/shared/Pagination';
import { UserAccessControls } from '@/components/admin/UserAccessControls';
import { formatDateTime, percentage } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

/**
 * Registered people — anyone who has signed in with Google at least once.
 * This is where roles and account access are managed; the roster only holds
 * batches for people who have not signed in yet.
 */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; q?: string }>;
}) {
  const admin = await requireAdmin();
  const params = searchParams ? await searchParams : {};
  const page = Math.max(1, parseInt(typeof params.page === 'string' ? params.page : '1', 10) || 1);
  const q = typeof params.q === 'string' ? params.q.trim() : '';

  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { batch: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { email: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { assignments: true, attempts: true } } },
    }),
  ]);

  const userIds = users.map((u) => u.id);

  const [scores, violations] = await Promise.all([
    userIds.length > 0
      ? prisma.attempt.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds }, status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } },
          _sum: { score: true, maxScore: true },
        })
      : [],
    userIds.length > 0
      ? prisma.proctorEvent.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds }, violation: true },
          _count: { _all: true },
        })
      : [],
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">Students</h1>
        <p className="mt-1 text-sm text-slate-400">
          Everyone who has signed in with Google. New accounts are students; only an administrator can change
          a role or deactivate an account. To give someone a batch before they sign in, add them to the{' '}
          <Link href="/admin/allowed-emails" className="text-brand-300 hover:underline">
            student roster
          </Link>
          .
        </p>
      </div>

      <Card>
        <CardHeader
          title="Registered accounts"
          subtitle={
            q
              ? `${total} matching "${q}" · showing ${users.length}${
                  total > PAGE_SIZE
                    ? ` (page ${page} of ${Math.max(1, Math.ceil(total / PAGE_SIZE))})`
                    : ''
                }`
              : total > PAGE_SIZE
                ? `${total} total · showing ${users.length} (page ${page} of ${Math.max(1, Math.ceil(total / PAGE_SIZE))})`
                : `${total} total`
          }
          action={
            <form method="GET" action="/admin/students" className="flex items-center gap-2">
              <Input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search name, email, batch..."
                className="h-8 w-44 text-xs sm:w-64"
              />
              <Button type="submit" variant="secondary" size="sm">
                Search
              </Button>
              {q ? (
                <Link
                  href="/admin/students"
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Clear
                </Link>
              ) : null}
            </form>
          }
        />
        <CardBody className="p-0">
          {users.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={q ? 'No matching accounts found' : 'Nobody has signed in yet'}
                description={
                  q
                    ? `No registered accounts match "${q}". Try clearing the search or searching a different term.`
                    : 'An account is created, as a student, the first time someone signs in with Google.'
                }
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
                  <Th>Status</Th>
                  <Th>Access</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const score = scores.find((s) => s.userId === u.id);
                  const sum = marksToNumber(score?._sum.score ?? 0);
                  const max = marksToNumber(score?._sum.maxScore ?? 0);
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
                      <Td className="text-slate-300">
                        {max > 0 ? `${sum}/${max} (${percentage(sum, max)}%)` : '—'}
                      </Td>
                      <Td>
                        <Badge tone={v > 0 ? 'bad' : 'neutral'}>{v}</Badge>
                      </Td>
                      <Td className="text-xs text-slate-500">{formatDateTime(u.lastLogin)}</Td>
                      <Td>
                        <Badge tone={u.active ? 'ok' : 'bad'}>{u.active ? 'active' : 'deactivated'}</Badge>
                      </Td>
                      <Td>
                        <UserAccessControls
                          user={{ id: u.id, email: u.email, role: u.role, active: u.active }}
                          isSelf={u.id === admin.id}
                        />
                      </Td>
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

      <Pagination
        basePath="/admin/students"
        params={{ ...(q ? { q } : {}) }}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
      />
    </div>
  );
}
