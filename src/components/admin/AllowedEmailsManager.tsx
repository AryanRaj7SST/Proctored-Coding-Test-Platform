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
import { api, apiDelete, apiPost, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

export interface AllowedEmailRowDto {
  id: string;
  email: string;
  batch: string | null;
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
 * Student roster management.
 *
 * The roster pre-registers addresses with a batch so tests can be assigned by
 * batch before those students first sign in. It does not control sign-in (any
 * Google account may sign in) and never sets a role: roles and account access
 * are managed on the Students page.
 */
export function AllowedEmailsManager({ rows, batches }: { rows: AllowedEmailRowDto[]; batches: string[] }) {
  const router = useRouter();
  const toast = useToast();

  const [query, setQuery] = React.useState('');
  const [batchFilter, setBatchFilter] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({ email: '', batch: '', note: '' });
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
        batch: draft.batch || null,
        note: draft.note || null,
      });
      toast.push(`${draft.email.trim().toLowerCase()} added to the roster.`, 'success');
      setDraft({ email: '', batch: '', note: '' });
      setAddOpen(false);
      router.refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not add that address.', 'error');
    } finally {
      setAdding(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/allowed-emails/${pendingDelete.id}`);
      toast.push(`${pendingDelete.email} removed from the roster.`, 'success');
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
          title="Roster"
          subtitle={`${rows.length} ${rows.length === 1 ? 'address' : 'addresses'} · matched exactly, lowercased`}
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
              aria-label="Search roster"
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
              description="Add a student's Google address to give them a batch before their first sign-in."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Batch</Th>
                  <Th>Account</Th>
                  <Th>Note</Th>
                  <Th>Added</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <Td className="font-medium text-slate-100">{row.email}</Td>
                    <Td className="text-slate-400">{row.batch ?? '—'}</Td>
                    <Td>
                      <Badge tone={row.hasAccount ? 'ok' : 'neutral'}>
                        {row.hasAccount ? 'signed in' : 'never signed in'}
                      </Badge>
                    </Td>
                    <Td className="max-w-[16rem] truncate text-xs text-slate-400">{row.note ?? '—'}</Td>
                    <Td className="text-xs text-slate-500">{formatDateTime(row.createdAt)}</Td>
                    <Td>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(row)}
                        className="text-xs text-rose-400 hover:underline"
                      >
                        Remove
                      </button>
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
        title="Add to the roster"
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
          <Field label="Batch" hint="Used to assign tests by batch" htmlFor="ae-batch">
            <Input
              id="ae-batch"
              value={draft.batch}
              onChange={(e) => setDraft((d) => ({ ...d, batch: e.target.value }))}
            />
          </Field>
          <Field label="Note" htmlFor="ae-note">
            <Input
              id="ae-note"
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            />
          </Field>
          <p className="text-xs text-slate-500">
            The address must match exactly what Google reports, lowercased. Aliases such as
            <code className="mx-1">name+tag@gmail.com</code> are different addresses. Nobody needs to be on
            the roster to sign in.
          </p>
        </div>
      </Modal>

      <Modal open={importOpen} title="Import a CSV" onClose={() => setImportOpen(false)}>
        <div className="space-y-3">
          <p>
            The file needs a header row with <code>email</code> and may include a <code>batch</code> column.
            Existing addresses are updated rather than duplicated. The roster never grants a role: rows asking
            for <code>ADMIN</code> are reported and skipped.
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
        title="Remove from the roster?"
        message={`${pendingDelete?.email ?? ''} is taken off the roster. Their account, assignments and results are not affected.`}
        confirmLabel="Remove"
        danger
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

/** CSV upload: `api` leaves the multipart Content-Type to the browser for FormData bodies. */
function api_importCsv(form: FormData): Promise<ImportSummary> {
  return api<ImportSummary>('/api/allowed-emails/import', { method: 'POST', body: form });
}
