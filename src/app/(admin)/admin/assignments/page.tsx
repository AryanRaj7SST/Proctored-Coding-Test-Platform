import Link from 'next/link';
import { requireAdmin } from '@/lib/authz';
import { testPhase } from '@/lib/timing';
import { assignmentOverview } from '@/server/services/assignments';
import { Badge, Card, CardBody, EmptyState, Table, Td, Th } from '@/components/ui';
import { formatDateTimeInZone } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PHASE_TONE = {
  DRAFT: 'neutral',
  UPCOMING: 'info',
  ACTIVE: 'ok',
  ENDED: 'neutral',
  ARCHIVED: 'neutral',
} as const;

/**
 * Who each test is assigned to, at a glance. Assignments matter for tests
 * restricted to assigned students; open tests only use them for
 * accommodations. Manage a test's list from its assignments page.
 */
export default async function AssignmentsOverviewPage() {
  await requireAdmin();
  const rows = await assignmentOverview();
  const restricted = rows.filter((r) => r.accessMode === 'ASSIGNED_USERS_ONLY');
  const open = rows.filter((r) => r.accessMode === 'ANY_AUTHENTICATED_USER');

  const table = (items: typeof rows) => (
    <Table>
      <thead>
        <tr>
          <Th>Test</Th>
          <Th>Phase</Th>
          <Th>Opens</Th>
          <Th className="text-right">Assigned</Th>
          <Th className="text-right">Signed in</Th>
          <Th className="text-right">Started</Th>
          <Th>
            <span className="sr-only">Manage</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {items.map((r) => {
          const phase = testPhase(r);
          return (
            <tr key={r.id}>
              <Td className="font-medium text-slate-100">{r.title}</Td>
              <Td>
                <Badge tone={PHASE_TONE[phase]}>{phase.toLowerCase()}</Badge>
              </Td>
              <Td className="text-xs text-slate-400">
                {r.startTime ? formatDateTimeInZone(r.startTime, r.timezone) : 'Any time'}
              </Td>
              <Td className="text-right font-mono">{r.assigned}</Td>
              <Td className="text-right font-mono text-slate-400">{r.signedIn}</Td>
              <Td className="text-right font-mono text-slate-400">{r.started}</Td>
              <Td className="text-right">
                <Link
                  href={`/admin/exams/${r.id}/assignments`}
                  className="text-xs text-brand-300 hover:underline"
                >
                  Manage
                </Link>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">Assignments</h1>
        <p className="mt-1 text-sm text-slate-400">
          Students can be assigned by account, email (even before their first sign-in), batch, or all at once.
        </p>
      </div>

      <Card>
        <CardBody className="p-0">
          <p className="border-b border-ink-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Restricted to assigned students
          </p>
          {restricted.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No restricted tests"
                description="Tests open to every student appear below."
              />
            </div>
          ) : (
            table(restricted)
          )}
        </CardBody>
      </Card>

      {open.length > 0 ? (
        <Card>
          <CardBody className="p-0">
            <p className="border-b border-ink-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Open to every signed-in student (assignments only needed for accommodations)
            </p>
            {table(open)}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
