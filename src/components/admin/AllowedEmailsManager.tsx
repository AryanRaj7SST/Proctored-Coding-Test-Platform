'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { apiDelete, apiPatch, apiPost, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

export interface AllowedEmailRowDto {
  id: string;
  email: string;
  role: 'STUDENT' | 'ADMIN';
  batch: string | null;
  active: boolean;
  note: string | null;
  createdAt: string;
  hasAccount: boolean;
}

interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: { line: number; message: string }[];
  duplicatesInFile: string[];
}

/**
 * Allowlist management (product requirement #7).
 *
 * The allowlist is the only door into the platform: sign-in requires an EXACT
 * match on a normalised address. There is deliberately no domain-wildcard
 * option here, because "@gmail.com" would let the entire internet in.
 */
export function AllowedEmailsManager({ rows, batches }: { rows: AllowedEmailRowDto[]; batches: string[] }) {
  const router = useRouter();
  const toast = useToast();

  const [query, setQuery] = React.useState('');
  const [batchFilter, setBatchFilter] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({
    email: '',
    role: 'STUDENT' as 'STUDENT' | 'ADMIN',
    batch: '',
    note: '',
  });
  const [importOpen, setImportOpen] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [importSummary, setImportSummary] = React.useState<ImportSummary | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<AllowedEmailRowDto | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const filtered = rows.filter(
    (r) => (!query || r.email.includes(query.toLowerCase())) && (!batchFilter || r.batch === batchFilter),
  );

  const add = async () => {
    setAdding(true);
    try {
      await apiPost('/api/allowed-emails', {
        email: draft.email,
        role: draft.role,
        batch: draft.batch || null,
        note: draft.note || null,
      });
      toast.push(`${draft.email.trim().toLowerCase()} can now sign in.`, 'success');
      setDraft({ email: '', role: 'STUDENT', batch: '', note: '' });
      setAddOpen(false);
      router.refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not add that address.', 'error');
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (row: AllowedEmailRowDto) => {
    try {
      await apiPatch(`/api/allowed-emails/${row.id}`, { active: !row.active });
      toast.push(
        row.active
          ? `${row.email} can no longer sign in. Any live session ends at its next refresh.`
          : `${row.email} can sign in again.`,
        'success',
      );
      router.refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not update that entry.', 'error');
    }
  };

  const changeRole = async (row: AllowedEmailRowDto, role: 'STUDENT' | 'ADMIN') => {
    try {
      await apiPatch(`/api/allowed-emails/${row.id}`, { role });
      toast.push(`${row.email} is now ${role.toLowerCase()}.`, 'success');
      router.refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not change the role.', 'error');
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/allowed-emails/${pendingDelete.id}`);
      toast.push(`${pendingDelete.email} removed from the allowlist.`, 'success');
      setPendingDelete(null);
      router.refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not remove that entry.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const importCsv = async (file: File) => {
    setImporting(true);
    setImportSummary(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const summary = await api_importCsv(form);
      setImportSummary(summary);
      toast.push(
        `Imported: ${summary.created} added, ${summary.updated} updated, ${summary.skipped} skipped.`,
        'success',
      );
      router.refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Import failed.', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Allowed email addresses"
          subtitle={`${rows.length} entries · exact-match only, no domain wildcards`}
          action={
            <div className="flex gap-2">
              <a
                href="/api/allowed-emails?format=csv"
                download
                className="rounded-md px-3 py-1.5 text-xs text-slate-300 ring-1 ring-inset ring-ink-600 hover:bg-ink-800"
              >
                Export CSV
              </a>
              <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
                Import CSV
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                Add address
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              placeholder="Search address"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search allowlist"
            />
            <Select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              aria-label="Filter by batch"
            >
              <option value="">All batches</option>
              {batches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No matching addresses"
              description="Add the exact Google address each mentee signs in with."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Batch</Th>
                  <Th>Account</Th>
                  <Th>Status</Th>
                  <Th>Added</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <Td className="font-medium text-slate-100">{row.email}</Td>
                    <Td>
                      <Select
                        value={row.role}
                        onChange={(e) => void changeRole(row, e.target.value as 'STUDENT' | 'ADMIN')}
                        className="h-7 w-28 text-xs"
                        aria-label={`Role for ${row.email}`}
                      >
                        <option value="STUDENT">Student</option>
                        <option value="ADMIN">Admin</option>
                      </Select>
                    </Td>
                    <Td className="text-slate-400">{row.batch ?? '—'}</Td>
                    <Td>
                      <Badge tone={row.hasAccount ? 'ok' : 'neutral'}>
                        {row.hasAccount ? 'signed in' : 'never signed in'}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={row.active ? 'ok' : 'bad'}>{row.active ? 'active' : 'revoked'}</Badge>
                    </Td>
                    <Td className="text-xs text-slate-500">{formatDateTime(row.createdAt)}</Td>
                    <Td>
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => void toggleActive(row)}
                          className="text-brand-300 hover:underline"
                        >
                          {row.active ? 'Revoke' : 'Restore'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(row)}
                          className="text-rose-400 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={addOpen}
        title="Add an allowed address"
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={() => void add()} loading={adding} disabled={!draft.email.trim()}>
              Add
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Google email address" required htmlFor="ae-email">
            <Input
              id="ae-email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              placeholder="mentee@gmail.com"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role" htmlFor="ae-role">
              <Select
                id="ae-role"
                value={draft.role}
                onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as 'STUDENT' | 'ADMIN' }))}
              >
                <option value="STUDENT">Student</option>
                <option value="ADMIN">Admin</option>
              </Select>
            </Field>
            <Field label="Batch" hint="Optional grouping" htmlFor="ae-batch">
              <Input
                id="ae-batch"
                value={draft.batch}
                onChange={(e) => setDraft((d) => ({ ...d, batch: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Note" htmlFor="ae-note">
            <Input
              id="ae-note"
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            />
          </Field>
          <p className="text-xs text-slate-500">
            The address must match exactly what Google reports, lowercased. Aliases such as
            <code className="mx-1">name+tag@gmail.com</code> are different addresses.
          </p>
        </div>
      </Modal>

      <Modal open={importOpen} title="Import a CSV" onClose={() => setImportOpen(false)}>
        <div className="space-y-3">
          <p>
            The file needs a header row with <code>email</code>, and may include <code>role</code> and{' '}
            <code>batch</code> columns. Existing addresses are updated rather than duplicated.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={importing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importCsv(file);
            }}
            className="block w-full text-xs text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-xs file:text-white"
          />
          {importSummary ? (
            <div className="rounded-md bg-ink-900 p-3 text-xs ring-1 ring-ink-700">
              <p className="text-slate-200">
                {importSummary.created} added · {importSummary.updated} updated · {importSummary.skipped}{' '}
                skipped
              </p>
              {importSummary.errors.length > 0 ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-rose-300">
                  {importSummary.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>
                      line {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              {importSummary.duplicatesInFile.length > 0 ? (
                <p className="mt-2 text-amber-300">
                  Duplicated inside the file: {importSummary.duplicatesInFile.slice(0, 5).join(', ')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove from the allowlist?"
        message={`${pendingDelete?.email ?? ''} will lose access immediately. Their past results are kept.`}
        confirmLabel="Remove"
        danger
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

/** FormData upload cannot go through the JSON helper. */
async function api_importCsv(form: FormData): Promise<ImportSummary> {
  const res = await fetch('/api/allowed-emails/import', {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  });
  const payload = (await res.json().catch(() => null)) as (ImportSummary & { error?: string }) | null;
  if (!res.ok) throw new ApiError(res.status, payload?.error ?? 'Import failed.');
  return payload as ImportSummary;
}
