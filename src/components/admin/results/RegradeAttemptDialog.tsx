'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Modal, Textarea } from '@/components/ui';
import { apiPost, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatScore, resultStatusLabel } from './format';
import type { AttemptRegradeResponse } from './types';

/**
 * Regrade one answer against its own frozen snapshot, with a reason (audited).
 * Shows the server's before/after; a runner failure keeps the current grade.
 */
export function RegradeAttemptDialog({
  attemptId,
  questionLabel,
  maxScore,
  fullMarks,
  disabled,
}: {
  attemptId: string;
  questionLabel: string;
  maxScore: number;
  /** Already graded PASSED: the server skips it unless forced. */
  fullMarks: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [force, setForce] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<AttemptRegradeResponse | null>(null);

  const trimmed = reason.trim();
  const reasonId = `regrade-reason-${attemptId}`;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setOutcome(null);
    setError(null);
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<AttemptRegradeResponse>(`/api/admin/attempts/${attemptId}/regrade`, {
        reason: trimmed,
        force,
      });
      setOutcome(res);
      setReason('');
      setForce(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the regrade.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={disabled ? 'Only submitted answers can be regraded.' : undefined}
      >
        Regrade
      </Button>

      <Modal
        open={open}
        title={`Regrade ${questionLabel}`}
        onClose={close}
        dismissible={!busy}
        footer={
          outcome ? (
            <Button size="sm" onClick={close}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button
                size="sm"
                loading={busy}
                disabled={trimmed.length === 0 || (fullMarks && !force)}
                onClick={() => void run()}
              >
                {busy ? 'Regrading…' : 'Regrade'}
              </Button>
            </>
          )
        }
      >
        {outcome ? (
          <RegradeOutcome outcome={outcome} maxScore={maxScore} />
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">
              Re-runs this answer&apos;s tests against the attempt&apos;s own frozen snapshot. The regrade is
              audited with your reason. If the runner fails, the current grade is kept.
            </p>
            <Field
              label="Reason"
              htmlFor={reasonId}
              required
              error={error ?? undefined}
              hint={`${trimmed.length}/300 · recorded in the audit log`}
            >
              <Textarea
                id={reasonId}
                rows={3}
                maxLength={300}
                value={reason}
                disabled={busy}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. Runner timed out during submission"
              />
            </Field>
            {fullMarks ? (
              <label className="flex items-start gap-2 rounded-md bg-warn/10 px-3 py-2 text-sm text-slate-200 ring-1 ring-inset ring-warn/30">
                <input
                  type="checkbox"
                  checked={force}
                  disabled={busy}
                  onChange={(e) => setForce(e.target.checked)}
                  className="mt-0.5 accent-brand-500"
                />
                <span>
                  Force regrade
                  <span className="block text-xs text-slate-400">
                    This answer already has full marks, so it is skipped unless forced. A forced regrade can
                    lower the score.
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        )}
      </Modal>
    </>
  );
}

function RegradeOutcome({ outcome, maxScore }: { outcome: AttemptRegradeResponse; maxScore: number }) {
  const describe = (s: { score: number | null; status: string }) =>
    s.score === null
      ? 'Grading pending'
      : `${formatScore(s.score, maxScore)} · ${resultStatusLabel(s.status)}`;

  const headline = outcome.graded
    ? { text: 'Regraded.', tone: 'text-ok' }
    : outcome.skipped
      ? { text: 'Skipped: this answer already has full marks.', tone: 'text-slate-200' }
      : outcome.busy
        ? { text: 'This answer is already being graded. Try again in a moment.', tone: 'text-warn' }
        : { text: 'Grading could not finish. The previous grade was kept.', tone: 'text-bad' };

  return (
    <div className="space-y-3" role="status">
      <p className={cn('text-sm font-medium', headline.tone)}>{headline.text}</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md bg-ink-900 px-3 py-2 ring-1 ring-ink-700">
          <dt className="text-xs text-slate-400">Before</dt>
          <dd className="mt-0.5 font-mono text-sm text-slate-200">{describe(outcome.before)}</dd>
        </div>
        <div className="rounded-md bg-ink-900 px-3 py-2 ring-1 ring-ink-700">
          <dt className="text-xs text-slate-400">After</dt>
          <dd className="mt-0.5 font-mono text-sm text-slate-100">{describe(outcome.after)}</dd>
        </div>
      </dl>
      {outcome.error ? (
        <p className="rounded bg-bad/10 px-3 py-2 font-mono text-xs text-rose-200 ring-1 ring-bad/30">
          {outcome.error}
        </p>
      ) : null}
    </div>
  );
}
