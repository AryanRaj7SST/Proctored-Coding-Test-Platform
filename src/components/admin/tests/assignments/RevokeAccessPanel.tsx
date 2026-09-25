'use client';

import * as React from 'react';
import { Button, Card, CardBody, CardHeader, Field, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { apiPatch, ApiError } from '@/lib/api';
import { ConfirmAction } from '../shared';

const EMAIL_RE = /^[^\s@,;<>"']+@[^\s@,;<>"'.]+(\.[^\s@,;<>"'.]+)+$/;

/**
 * Take one student's access to this test away, by email, whether or not they
 * have signed in yet. Their account is untouched; the Access column of the
 * table below restores it.
 */
export function RevokeAccessPanel({
  testId,
  disabled,
  onChanged,
}: {
  testId: string;
  disabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [email, setEmail] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const normalized = email.trim().toLowerCase();
  const valid = EMAIL_RE.test(normalized);

  const revoke = async () => {
    setBusy(true);
    try {
      const res = await apiPatch<{ closedSitting: boolean }>(`/api/exams/${testId}/assignments`, {
        email: normalized,
        revoked: true,
      });
      toast.push(
        `${normalized} can no longer open this test${res.closedSitting ? '; their sitting in progress was submitted' : ''}.`,
        'success',
      );
      setEmail('');
      await onChanged();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not revoke access.', 'error');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Revoke a student's access"
        subtitle="Only this test. The student can still sign in and take other tests."
      />
      <CardBody>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setConfirming(true);
          }}
        >
          <Field label="Student email" htmlFor="revoke-email">
            <Input
              id="revoke-email"
              type="email"
              value={email}
              placeholder="student@example.com"
              onChange={(e) => setEmail(e.target.value)}
              className="sm:w-80"
              disabled={disabled}
            />
          </Field>
          <Button type="submit" variant="danger" disabled={disabled || !valid}>
            Revoke access
          </Button>
        </form>
      </CardBody>

      <ConfirmAction
        open={confirming}
        title="Revoke access to this test?"
        confirmLabel="Revoke access"
        variant="danger"
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void revoke()}
      >
        <p>
          <strong className="text-slate-100">{normalized}</strong> will no longer see or be able to open this
          test. A sitting in progress is submitted and graded now. You can restore access from the table
          below.
        </p>
      </ConfirmAction>
    </Card>
  );
}
