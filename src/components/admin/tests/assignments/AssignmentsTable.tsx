'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge, Card, CardBody, CardHeader, EmptyState, Input, Select, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { apiDelete, apiPatch, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatInZone } from '../../exam-types';
import { ATTEMPT_STATE_LABEL, formatMarks, plural } from '../format';
import { ConfirmAction } from '../shared';
import type { AssignmentRow, AssignmentsTestInfo, AttemptState } from '../types';

function ClipboardToggle({
  row,
  disabled,
  onChange,
}: {
  row: AssignmentRow;
  disabled: boolean;
  onChange: (row: AssignmentRow, allow: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const on = row.allowClipboard;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Clipboard accommodation for ${row.email}`}
      title="Accommodation: allow copy/paste for this student in this test (audited)"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        await onChange(row, !on);
        setBusy(false);
      }}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full ring-1 ring-inset transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        on ? 'bg-warn/70 ring-warn' : 'bg-ink-700 ring-ink-600',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition',
          on ? 'translate-x-[1.125rem]' : 'translate-x-1',
        )}
      />
    </button>
  );
}

/** Everyone assigned, with their attempt state, best result and accommodations. */
export function AssignmentsTable({
  test,
  rows,
  readOnly,
  onChanged,
}: {
  test: AssignmentsTestInfo;
  rows: AssignmentRow[];
  readOnly: boolean;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [q, setQ] = React.useState('');
  const [state, setState] = React.useState<'' | AttemptState | 'NOT_SIGNED_IN'>('');
  const [removing, setRemoving] = React.useState<AssignmentRow | null>(null);
  const [accessChange, setAccessChange] = React.useState<AssignmentRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  const needle = q.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (!needle || r.email.includes(needle) || (r.name ?? '').toLowerCase().includes(needle)) &&
      (!state || (state === 'NOT_SIGNED_IN' ? !r.signedIn : r.attemptState === state)),
  );
  const started = rows.filter((r) => r.attemptsUsed > 0).length;
  const accommodations = rows.filter((r) => r.allowClipboard).length;
  const revokedCount = rows.filter((r) => r.revoked).length;

  const changeAccess = async () => {
    if (!accessChange) return;
    const revoked = !accessChange.revoked;
    setBusy(true);
    try {
      const res = await apiPatch<{ closedSitting: boolean }>(`/api/exams/${test.id}/assignments`, {
        email: accessChange.email,
        revoked,
      });
      toast.push(
        revoked
          ? `${accessChange.email} can no longer open this test${res.closedSitting ? '; their sitting in progress was submitted' : ''}.`
          : `${accessChange.email} can open this test again.`,
        'success',
      );
      await onChanged();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not change access.', 'error');
    } finally {
      setBusy(false);
      setAccessChange(null);
    }
  };

  const setClipboard = async (row: AssignmentRow, allowClipboard: boolean) => {
    try {
      await apiPatch(`/api/exams/${test.id}/assignments`, { email: row.email, allowClipboard });
      toast.push(
        allowClipboard
          ? `Clipboard allowed for ${row.email}.`
          : `Clipboard accommodation removed for ${row.email}.`,
        'success',
      );
      await onChanged();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not update the accommodation.', 'error');
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await apiDelete(`/api/exams/${test.id}/assignments?email=${encodeURIComponent(removing.email)}`);
      toast.push(`${removing.email} is no longer assigned.`, 'success');
      await onChanged();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not remove the assignment.', 'error');
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Assigned students"
        subtitle={`${plural(rows.length, 'student')} · ${started} started · ${plural(accommodations, 'clipboard accommodation')} · ${revokedCount} access revoked`}
        action={
          rows.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <label htmlFor="as-filter" className="sr-only">
                Filter by name or email
              </label>
              <Input
                id="as-filter"
                type="search"
                value={q}
                placeholder="Filter…"
                onChange={(e) => setQ(e.target.value)}
                className="h-8 w-44"
              />
              <label htmlFor="as-state" className="sr-only">
                Filter by attempt status
              </label>
              <Select
                id="as-state"
                value={state}
                onChange={(e) => setState(e.target.value as typeof state)}
                className="h-8 w-40"
              >
                <option value="">All statuses</option>
                <option value="NOT_SIGNED_IN">Not signed in yet</option>
                {(Object.keys(ATTEMPT_STATE_LABEL) as AttemptState[]).map((s) => (
                  <option key={s} value={s}>
                    {ATTEMPT_STATE_LABEL[s].label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null
        }
      />
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nobody is assigned yet"
              description={
                test.accessMode === 'ASSIGNED_USERS_ONLY'
                  ? 'Only assigned students can take this test. Assign students above.'
                  : 'Any signed-in student can take this test; assign someone only to grant an accommodation.'
              }
            />
          </div>
        ) : visible.length === 0 ? (
          <p className="p-4 text-xs text-slate-500">No assigned students match the filter.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Email</Th>
                <Th>Assignment</Th>
                <Th>Attempt</Th>
                <Th>Attempts used</Th>
                <Th>Submitted</Th>
                <Th>Score</Th>
                <Th>Clipboard</Th>
                <Th>Access</Th>
                <Th>
                  <span className="sr-only">Remove</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const attempt = ATTEMPT_STATE_LABEL[r.attemptState];
                const hasStarted = r.attemptsUsed > 0 || r.attemptState !== 'NOT_STARTED';
                return (
                  <tr key={r.id}>
                    <Td>
                      <span className="block text-slate-100">{r.name ?? '—'}</span>
                      {r.batch ? <span className="block text-xs text-slate-500">{r.batch}</span> : null}
                    </Td>
                    <Td className="text-xs text-slate-300">{r.email}</Td>
                    <Td>
                      {r.signedIn ? (
                        <Badge tone="neutral">{r.assignmentStatus.replace(/_/g, ' ').toLowerCase()}</Badge>
                      ) : (
                        <Badge tone="warn">Not signed in yet</Badge>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={attempt.tone}>{attempt.label}</Badge>
                    </Td>
                    <Td className="tabular-nums text-slate-400">
                      {r.attemptsUsed} / {test.maxAttempts}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-slate-400">
                      {r.submittedAt ? formatInZone(r.submittedAt, test.timezone) : '—'}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {r.score !== null && r.maxScore !== null ? (
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/attempts?examId=${test.id}${r.userId ? `&userId=${r.userId}` : ''}`}
                            className="tabular-nums text-slate-100 hover:underline"
                            title="View this student's attempts"
                          >
                            {formatMarks(r.score)}/{formatMarks(r.maxScore)}
                          </Link>
                          {r.percentage !== null ? (
                            <span className="text-xs tabular-nums text-slate-500">
                              {formatMarks(r.percentage)}%
                            </span>
                          ) : null}
                          {r.result ? (
                            <Badge tone={r.result === 'PASSED' ? 'ok' : 'bad'}>
                              {r.result === 'PASSED' ? 'PASS' : 'FAIL'}
                            </Badge>
                          ) : null}
                        </div>
                      ) : r.attemptState === 'GRADING_PENDING' ? (
                        <span className="text-xs text-amber-300">Grading…</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </Td>
                    <Td>
                      <ClipboardToggle row={r} disabled={readOnly} onChange={setClipboard} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <Badge tone={r.revoked ? 'bad' : 'ok'}>{r.revoked ? 'Revoked' : 'Allowed'}</Badge>
                        <button
                          type="button"
                          onClick={() => setAccessChange(r)}
                          disabled={readOnly}
                          className={cn(
                            'text-xs hover:underline disabled:cursor-not-allowed disabled:text-slate-600 disabled:no-underline',
                            r.revoked ? 'text-brand-300' : 'text-rose-400',
                          )}
                        >
                          {r.revoked ? 'Restore access' : 'Revoke access'}
                        </button>
                      </div>
                    </Td>
                    <Td>
                      <button
                        type="button"
                        onClick={() => setRemoving(r)}
                        disabled={readOnly || hasStarted || r.revoked}
                        title={
                          r.revoked
                            ? "Restore this student's access before removing them."
                            : hasStarted
                              ? 'This student has started, so the assignment is kept.'
                              : undefined
                        }
                        className="text-xs text-rose-400 hover:underline disabled:cursor-not-allowed disabled:text-slate-600 disabled:no-underline"
                      >
                        Remove
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </CardBody>

      <ConfirmAction
        open={accessChange !== null}
        title={accessChange?.revoked ? 'Restore access to this test?' : 'Revoke access to this test?'}
        confirmLabel={accessChange?.revoked ? 'Restore access' : 'Revoke access'}
        variant={accessChange?.revoked ? 'primary' : 'danger'}
        busy={busy}
        onCancel={() => setAccessChange(null)}
        onConfirm={() => void changeAccess()}
      >
        <p>
          <strong className="text-slate-100">{accessChange?.email}</strong>{' '}
          {accessChange?.revoked
            ? 'will be able to open and start this test again (attempt limits still apply).'
            : 'will no longer see or be able to open this test. Their account is not affected: they can still sign in and take other tests. A sitting in progress is submitted and graded now.'}
        </p>
      </ConfirmAction>

      <ConfirmAction
        open={removing !== null}
        title="Remove this assignment?"
        confirmLabel="Remove"
        variant="danger"
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={() => void remove()}
      >
        <p>
          <strong className="text-slate-100">{removing?.email}</strong>{' '}
          {test.accessMode === 'ASSIGNED_USERS_ONLY'
            ? 'will no longer see or be able to start this test.'
            : 'loses any accommodation on this test (they can still take it, since any signed-in student can).'}
        </p>
      </ConfirmAction>
    </Card>
  );
}
