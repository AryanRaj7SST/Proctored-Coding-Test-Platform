'use client';

import * as React from 'react';
import { Button, Card, CardBody, CardHeader, Field, Input, Tabs, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { apiPost, ApiError } from '@/lib/api';
import { plural } from '../format';
import { ConfirmAction, Notice } from '../shared';
import type { AssignResult } from '../types';
import { StudentSearch } from './StudentSearch';

type Mode = 'students' | 'emails' | 'batch' | 'all';

const EMAIL_RE = /^[^\s@,;<>"']+@[^\s@,;<>"'.]+(\.[^\s@,;<>"'.]+)+$/;

/** Split pasted text on commas, semicolons, whitespace; lowercase and dedupe. */
export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    (EMAIL_RE.test(email) ? valid : invalid).push(email);
  }
  return { valid, invalid };
}

/** Assign students by account, email list, batch, or everyone. */
export function AssignPanel({
  testId,
  defaultBatch,
  batches,
  studentCount,
  assignedEmails,
  disabled,
  onAssigned,
}: {
  testId: string;
  defaultBatch: string | null;
  batches: string[];
  studentCount: number;
  assignedEmails: Set<string>;
  disabled: boolean;
  onAssigned: () => Promise<void>;
}) {
  const toast = useToast();
  const [mode, setMode] = React.useState<Mode>('students');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<AssignResult | null>(null);
  const [emailText, setEmailText] = React.useState('');
  const [batch, setBatch] = React.useState(defaultBatch ?? '');
  const [confirmAll, setConfirmAll] = React.useState(false);
  const parsed = React.useMemo(() => parseEmails(emailText), [emailText]);

  const assign = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await apiPost<AssignResult>(`/api/exams/${testId}/assignments`, body);
      setResult(res);
      toast.push(
        res.assigned > 0 ? `Assigned ${plural(res.assigned, 'student')}.` : 'No new students were assigned.',
        res.assigned > 0 ? 'success' : 'info',
      );
      await onAssigned();
      return true;
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not assign students.', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Assign students"
        subtitle="Any address can be assigned, even before its first sign-in."
      />
      <CardBody className="space-y-4">
        {disabled ? (
          <Notice tone="neutral">Restore this test before assigning students.</Notice>
        ) : (
          <>
            <Tabs
              tabs={[
                { id: 'students', label: 'Students' },
                { id: 'emails', label: 'Emails' },
                { id: 'batch', label: 'Batch' },
                { id: 'all', label: 'All students' },
              ]}
              active={mode}
              onChange={(id) => setMode(id as Mode)}
              className="border-b border-slate-200"
            />

            {mode === 'students' ? (
              <StudentSearch
                assignedEmails={assignedEmails}
                busy={busy}
                onAssign={(userIds) => assign({ userIds })}
              />
            ) : null}

            {mode === 'emails' ? (
              <div className="space-y-3">
                <Field
                  label="Email addresses"
                  hint="Separate with commas, spaces or new lines. Students who have not signed in yet are linked on their first sign-in."
                  htmlFor="as-emails"
                >
                  <Textarea
                    id="as-emails"
                    rows={6}
                    value={emailText}
                    placeholder={'asha@example.com\nravi@example.com, meera@example.com'}
                    onChange={(e) => setEmailText(e.target.value)}
                    className="font-mono text-xs"
                  />
                </Field>
                {parsed.invalid.length > 0 ? (
                  <Notice
                    tone="bad"
                    title={`${plural(parsed.invalid.length, 'entry is', 'entries are')} not a valid email`}
                  >
                    <span className="break-all font-mono">{parsed.invalid.join(', ')}</span>
                  </Notice>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">
                    {plural(parsed.valid.length, 'valid address', 'valid addresses')}
                  </span>
                  <Button
                    onClick={async () => {
                      if (await assign({ emails: parsed.valid })) setEmailText('');
                    }}
                    disabled={
                      parsed.valid.length === 0 || parsed.invalid.length > 0 || parsed.valid.length > 1000
                    }
                    loading={busy}
                  >
                    Assign {parsed.valid.length > 0 ? plural(parsed.valid.length, 'email') : 'emails'}
                  </Button>
                </div>
              </div>
            ) : null}

            {mode === 'batch' ? (
              <div className="space-y-3">
                <Field
                  label="Batch"
                  hint="Assigns every student in this batch: signed-in students and roster addresses not signed in yet."
                  htmlFor="as-batch"
                >
                  <Input
                    id="as-batch"
                    list="as-batch-options"
                    value={batch}
                    placeholder={batches[0] ? `e.g. ${batches[0]}` : 'Batch name'}
                    onChange={(e) => setBatch(e.target.value)}
                    className="sm:max-w-xs"
                  />
                  <datalist id="as-batch-options">
                    {batches.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </Field>
                {batches.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No batches are set yet (set them on the student roster).
                  </p>
                ) : null}
                <div className="flex justify-end">
                  <Button
                    onClick={() => void assign({ batch: batch.trim() })}
                    disabled={!batch.trim()}
                    loading={busy}
                  >
                    Assign batch
                  </Button>
                </div>
              </div>
            ) : null}

            {mode === 'all' ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  Assign every active student ({studentCount}), including roster addresses that have not
                  signed in yet. Students already assigned are skipped.
                </p>
                <Button onClick={() => setConfirmAll(true)} disabled={studentCount === 0} loading={busy}>
                  Assign all students
                </Button>
              </div>
            ) : null}
          </>
        )}

        {result ? (
          <Notice tone={result.notAssignable.length > 0 ? 'warn' : 'ok'} title="Assignment result">
            <p>
              {plural(result.assigned, 'student')} newly assigned
              {result.alreadyAssigned > 0 ? ` · ${result.alreadyAssigned} already assigned` : ''}
              {result.notAssignable.length > 0 ? ` · ${result.notAssignable.length} skipped` : ''}.
            </p>
            {result.notAssignable.length > 0 ? (
              <>
                <p className="mt-2">
                  These addresses belong to an administrator or a deactivated account and were not assigned:
                </p>
                <p className="mt-1 break-all font-mono">{result.notAssignable.join(', ')}</p>
              </>
            ) : null}
            <button type="button" className="mt-2 underline" onClick={() => setResult(null)}>
              Dismiss
            </button>
          </Notice>
        ) : null}
      </CardBody>

      <ConfirmAction
        open={confirmAll}
        title="Assign all students?"
        confirmLabel="Assign all"
        busy={busy}
        onCancel={() => setConfirmAll(false)}
        onConfirm={async () => {
          await assign({ allStudents: true });
          setConfirmAll(false);
        }}
      >
        <p>
          Every active student ({studentCount}), including roster addresses not signed in yet, will be
          assigned and will see this test once it is published. You can remove students later as long as they
          have not started.
        </p>
      </ConfirmAction>
    </Card>
  );
}
