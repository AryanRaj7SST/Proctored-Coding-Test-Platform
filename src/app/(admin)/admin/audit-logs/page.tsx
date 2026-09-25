import Link from 'next/link';
import { requireAdmin } from '@/lib/authz';
import { auditListInput } from '@/lib/validation';
import { listAuditLogs } from '@/server/services/audit';
import { Badge, Card, CardBody, EmptyState, Table, Td, Th } from '@/components/ui';
import { Pagination } from '@/components/admin/shared/Pagination';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const ACTION_FILTERS = [
  { value: '', label: 'All actions' },
  { value: 'question.', label: 'Questions' },
  { value: 'exam.', label: 'Tests & sittings' },
  { value: 'attempt.', label: 'Attempts & grading' },
  { value: 'user.', label: 'Accounts & roles' },
  { value: 'allowlist.', label: 'Student roster' },
];

const ENTITY_LINK: Record<string, (id: string) => string> = {
  Question: (id) => `/admin/questions/${id}/edit`,
  Exam: (id) => `/admin/exams/${id}`,
  Attempt: (id) => `/admin/attempts/${id}`,
};

function toneFor(action: string): 'ok' | 'bad' | 'warn' | 'info' | 'neutral' {
  if (/(published|created|assigned|regraded)$/.test(action)) return 'ok';
  if (/(deleted|archived|terminated_violations|grading_failed|removed)$/.test(action)) return 'bad';
  if (/(unpublished|closed|schedule_changed|auto_submitted)$/.test(action)) return 'warn';
  return 'neutral';
}

/** Metadata is sanitised when written; show it compactly, never code or secrets. */
function MetadataSummary({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object') return <span className="text-slate-600">—</span>;
  const text = JSON.stringify(value);
  return (
    <code className="block max-w-md truncate text-xs text-slate-400" title={text}>
      {text}
    </code>
  );
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const raw = await searchParams;
  const parsed = auditListInput.safeParse({ ...raw, pageSize: raw.pageSize ?? '50' });
  const filter = parsed.success ? parsed.data : auditListInput.parse({ pageSize: '50' });
  const { items, total, page, pageSize } = await listAuditLogs(filter);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">Audit logs</h1>
        <p className="mt-1 text-sm text-slate-400">
          Every administrative change and grading event, newest first. Code and secrets are never recorded.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2" aria-label="Filter audit logs">
        <label className="text-xs text-slate-400">
          Action
          <select
            name="action"
            defaultValue={filter.action ?? ''}
            className="mt-1 block rounded-md bg-ink-900 px-3 py-2 text-sm text-slate-100 ring-1 ring-inset ring-ink-700"
          >
            {ACTION_FILTERS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Actor (name or email)
          <input
            name="q"
            defaultValue={filter.q ?? ''}
            className="mt-1 block rounded-md bg-ink-900 px-3 py-2 text-sm text-slate-100 ring-1 ring-inset ring-ink-700"
          />
        </label>
        {filter.entityId ? <input type="hidden" name="entityId" value={filter.entityId} /> : null}
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          Filter
        </button>
        {filter.action || filter.q || filter.entityId ? (
          <Link href="/admin/audit-logs" className="px-2 py-2 text-sm text-slate-400 hover:text-white">
            Clear
          </Link>
        ) : null}
      </form>

      <Card>
        <CardBody className="p-0">
          {items.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No matching entries" description="Try a different filter." />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Subject</Th>
                  <Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const link = row.entityId && ENTITY_LINK[row.entity]?.(row.entityId);
                  return (
                    <tr key={row.id}>
                      <Td className="whitespace-nowrap text-xs text-slate-400">
                        {formatDateTime(row.createdAt)}
                      </Td>
                      <Td>
                        {row.actor ? (
                          <>
                            <p className="text-sm text-slate-100">{row.actor.name ?? row.actor.email}</p>
                            <p className="text-xs text-slate-500">{row.actor.role.toLowerCase()}</p>
                          </>
                        ) : (
                          <span className="text-slate-500">System</span>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={toneFor(row.action)}>{row.action}</Badge>
                      </Td>
                      <Td className="text-xs text-slate-400">
                        {link ? (
                          <Link href={link} className="text-brand-300 hover:underline">
                            {row.entity}
                          </Link>
                        ) : (
                          row.entity
                        )}
                      </Td>
                      <Td>
                        <MetadataSummary value={row.metadata} />
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
        basePath="/admin/audit-logs"
        params={{ action: filter.action, q: filter.q, entityId: filter.entityId, pageSize: String(pageSize) }}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </div>
  );
}
