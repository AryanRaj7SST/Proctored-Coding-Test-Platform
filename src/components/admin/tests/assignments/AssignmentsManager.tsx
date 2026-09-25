'use client';

import * as React from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';
import { apiGet, ApiError } from '@/lib/api';
import { ACCESS_LABEL } from '../format';
import { Notice, PhaseBadge } from '../shared';
import type { AssignmentRow, AssignmentsTestInfo } from '../types';
import { AssignPanel } from './AssignPanel';
import { AssignmentsTable } from './AssignmentsTable';
import { RevokeAccessPanel } from './RevokeAccessPanel';

/** /admin/exams/[id]/assignments: who may take a test, per-student access and accommodations, and progress. */
export function AssignmentsManager({
  test,
  initialRows,
  batches,
  studentCount,
}: {
  test: AssignmentsTestInfo;
  initialRows: AssignmentRow[];
  batches: string[];
  studentCount: number;
}) {
  const toast = useToast();
  const [rows, setRows] = React.useState(initialRows);
  const archived = test.status === 'ARCHIVED';
  const assignedEmails = React.useMemo(() => new Set(rows.map((r) => r.email)), [rows]);

  const reload = React.useCallback(async () => {
    try {
      const res = await apiGet<{ items: AssignmentRow[] }>(`/api/exams/${test.id}/assignments`);
      setRows(res.items);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not refresh the assignments.', 'error');
    }
  }, [test.id, toast]);

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/admin/exams/${test.id}`} className="text-xs text-slate-400 hover:text-slate-200">
          ← Back to the test builder
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-50">Assignments · {test.title}</h1>
          <PhaseBadge phase={test.phase} />
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Access: {ACCESS_LABEL[test.accessMode]}.{' '}
          <Link href={`/admin/exams/${test.id}?step=access`} className="text-brand-300 hover:underline">
            Change
          </Link>
        </p>
      </div>

      {test.accessMode === 'ANY_AUTHENTICATED_USER' ? (
        <Notice tone="info" title="Open to every signed-in student">
          Any signed-in student can take this test. Assign a student only to grant a per-student accommodation
          such as clipboard access, and revoke access below for anyone who should not take it.
        </Notice>
      ) : rows.length === 0 && !archived ? (
        <Notice tone="warn" title="Nobody can take this test yet">
          Only assigned students can start it. Assign students individually, by email, by batch, or all at
          once.
        </Notice>
      ) : null}

      <AssignPanel
        testId={test.id}
        defaultBatch={test.batch}
        batches={batches}
        studentCount={studentCount}
        assignedEmails={assignedEmails}
        disabled={archived}
        onAssigned={reload}
      />

      <RevokeAccessPanel testId={test.id} disabled={archived} onChanged={reload} />

      <AssignmentsTable test={test} rows={rows} readOnly={archived} onChanged={reload} />
    </div>
  );
}
