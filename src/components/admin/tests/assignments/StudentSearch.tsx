'use client';

import * as React from 'react';
import { Badge, Button, Input, Skeleton } from '@/components/ui';
import { apiGet, ApiError } from '@/lib/api';
import { useDebounced } from '../shared';
import type { UserOption } from '../types';

/** Search signed-in student accounts and pick several to assign. */
export function StudentSearch({
  assignedEmails,
  busy,
  onAssign,
}: {
  assignedEmails: Set<string>;
  busy: boolean;
  onAssign: (userIds: string[]) => Promise<boolean>;
}) {
  const [q, setQ] = React.useState('');
  const query = useDebounced(q.trim(), 300);
  const [users, setUsers] = React.useState<UserOption[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Map<string, UserOption>>(new Map());

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ role: 'STUDENT', pageSize: '25', page: '1' });
    if (query) params.set('q', query);
    setError(null);
    apiGet<{ items: UserOption[]; total: number }>(`/api/users?${params.toString()}`)
      .then((res) => {
        if (controller.signal.aborted) return;
        setUsers(res.items);
        setTotal(res.total);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setError(err instanceof ApiError ? err.message : 'Could not load students.');
      });
    return () => controller.abort();
  }, [query]);

  const toggle = (u: UserOption, on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(u.id, u);
      else next.delete(u.id);
      return next;
    });

  const submit = async () => {
    const ok = await onAssign([...selected.keys()]);
    if (ok) setSelected(new Map());
  };

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="as-student-search" className="sr-only">
          Search students by name or email
        </label>
        <Input
          id="as-student-search"
          type="search"
          value={q}
          placeholder="Search students by name or email…"
          onChange={(e) => setQ(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">
          Lists students who have signed in at least once. Use “Emails” for students who have not signed in
          yet.
        </p>
      </div>

      {error ? (
        <p className="text-xs text-bad" role="alert">
          {error}
        </p>
      ) : users === null ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : users.length === 0 ? (
        <p className="text-xs text-slate-500">No students match.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-ink-800 overflow-auto rounded-md ring-1 ring-ink-700">
          {users.map((u) => {
            const assigned = assignedEmails.has(u.email);
            const id = `as-user-${u.id}`;
            return (
              <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                <input
                  id={id}
                  type="checkbox"
                  checked={assigned || selected.has(u.id)}
                  disabled={assigned || !u.active}
                  onChange={(e) => toggle(u, e.target.checked)}
                  className="h-4 w-4 accent-brand-500"
                />
                <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block truncate text-sm text-slate-100">{u.name ?? u.email}</span>
                  {u.name ? <span className="block truncate text-xs text-slate-500">{u.email}</span> : null}
                </label>
                {u.batch ? <Badge>{u.batch}</Badge> : null}
                {assigned ? <Badge tone="ok">assigned</Badge> : null}
                {!u.active ? <Badge tone="bad">inactive</Badge> : null}
              </li>
            );
          })}
        </ul>
      )}
      {users && total > users.length ? (
        <p className="text-xs text-slate-500">
          Showing {users.length} of {total}. Refine the search to find others.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={selected.size === 0} loading={busy}>
          Assign {selected.size > 0 ? selected.size : ''} selected
        </Button>
      </div>
    </div>
  );
}
