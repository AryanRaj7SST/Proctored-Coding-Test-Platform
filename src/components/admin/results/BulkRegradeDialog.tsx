'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, ConfirmDialog, Field, Modal, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { apiPost, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ExamRegradeResponse } from './types';

type Mode = 'pending' | 'incomplete' | 'all';

const MODES: { value: Mode; label: string; hint: string }[] = [
  {
    value: 'pending',
    label: 'Grading pending only',
    hint: 'Answers the runner could not grade yet.',
  },
  {
    value: 'incomplete',
    label: 'Pending, partial and failed',
    hint: 'Everything below full marks, plus pending answers.',
  },
  {
    value: 'all',
    label: 'Every submitted answer',
    hint: 'Full-mark answers are only re-run when Force is ticked.',
  },
];

/** The server caps one bulk regrade at this many answers. */
const PER_CALL_CAP = 100;

type Step = 'closed' | 'form' | 'confirm' | 'done';

/**
 * Bulk regrade for one test: choose which answers, give a reason (audited),
 * confirm, then read the server's summary. Each answer is regraded against
 * its own frozen snapshot, and a runner failure never wipes an existing grade.
 */
export function BulkRegradeDialog({ examId, examTitle }: { examId: string; examTitle: string }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = React.useState<Step>('closed');
  const [mode, setMode] = React.useState<Mode>('pending');
  const [reason, setReason] = React.useState('');
  const [force, setForce] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [summary, setSummary] = React.useState<{
    mode: Mode;
    force: boolean;
    reason: string;
    result: ExamRegradeResponse;
  } | null>(null);

  const trimmed = reason.trim();
  const reasonValid = trimmed.length >= 3 && trimmed.length <= 300;
  const modeLabel = MODES.find((m) => m.value === mode)?.label.toLowerCase() ?? mode;

  const open = () => {
    setError(null);
    setSummary(null);
    setStep('form');
  };

  const run = async (next?: { mode: Mode; force: boolean; reason: string; after: string }) => {
    setBusy(true);
    const request = next ?? { mode, force, reason: trimmed };
    try {
      const res = await apiPost<ExamRegradeResponse>(`/api/admin/exams/${examId}/regrade`, request);
      setSummary({ mode: request.mode, force: request.force, reason: request.reason, result: res });
      setStep('done');
      setReason('');
      setForce(false);
      router.refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not start the regrade.';
      setError(message);
      toast.push(message, 'error');
      setStep('form');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="secondary" size="md" onClick={open}>
        Regrade…
      </Button>

      <Modal
        open={step === 'form'}
        title={`Regrade “${examTitle}”`}
        onClose={() => setStep('closed')}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setStep('closed')}>
              Cancel
            </Button>
            <Button size="sm" disabled={!reasonValid} onClick={() => setStep('confirm')}>
              Continue
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Re-runs the tests of submitted answers against each answer&apos;s own frozen snapshot. Every
            regrade is audited with your reason, and a runner failure keeps the existing grade. Up to{' '}
            {PER_CALL_CAP} answers are processed per run.
          </p>

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
              Which answers
            </legend>
            {MODES.map((m) => (
              <label
                key={m.value}
                className={cn(
                  'shadow-xs flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition',
                  mode === m.value
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                    : 'border-slate-200 bg-white hover:bg-slate-50',
                )}
              >
                <input
                  type="radio"
                  name="bulk-regrade-mode"
                  value={m.value}
                  checked={mode === m.value}
                  onChange={() => setMode(m.value)}
                  className="mt-0.5 accent-blue-600"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{m.label}</span>
                  <span className="block text-xs text-slate-500">{m.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <Field
            label="Reason"
            htmlFor="bulk-regrade-reason"
            required
            error={error ?? undefined}
            hint={`${trimmed.length}/300 · at least 3 characters · recorded in the audit log`}
          >
            <Textarea
              id="bulk-regrade-reason"
              rows={3}
              maxLength={300}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Runner outage during the 10:00 slot"
            />
          </Field>

          <label className="flex items-start gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="mt-0.5 accent-blue-600"
            />
            <span>
              Force
              <span className="block text-xs font-normal text-slate-500">
                Also re-run answers that already have full marks.
              </span>
            </span>
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={step === 'confirm'}
        theme="dark"
        title="Confirm regrade"
        message={`Regrade ${modeLabel}${force ? ' (forced, including full-mark answers)' : ''} for “${examTitle}”? This re-runs the tests and can take a few minutes. Scores can go up or down.`}
        confirmLabel="Regrade"
        busy={busy}
        onConfirm={() => void run()}
        onCancel={() => {
          if (!busy) setStep('form');
        }}
      />

      <Modal
        open={step === 'done'}
        title="Regrade finished"
        onClose={() => setStep('closed')}
        footer={
          <>
            {summary?.result.nextCursor ? (
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                onClick={() =>
                  void run({
                    mode: summary.mode,
                    force: summary.force,
                    reason: summary.reason,
                    after: summary.result.nextCursor!,
                  })
                }
              >
                Continue with the next batch
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setStep('closed')}>
              Close
            </Button>
          </>
        }
      >
        {summary ? <RegradeSummary summary={summary.result} /> : null}
      </Modal>
    </>
  );
}

function RegradeSummary({ summary }: { summary: ExamRegradeResponse }) {
  if (summary.attempted === 0) {
    return <p className="text-sm text-slate-300">No submitted answers matched. Nothing was regraded.</p>;
  }
  const items: { label: string; value: number; tone: string }[] = [
    { label: 'Regraded', value: summary.graded, tone: 'text-ok' },
    { label: 'Skipped (full marks)', value: summary.skipped, tone: 'text-slate-300' },
    {
      label: 'Failed (grade kept)',
      value: summary.failed,
      tone: summary.failed ? 'text-bad' : 'text-slate-300',
    },
    { label: 'Busy (try again)', value: summary.busy, tone: summary.busy ? 'text-warn' : 'text-slate-300' },
  ];
  return (
    <div className="space-y-3" role="status">
      <p className="text-sm font-medium text-slate-700">
        Processed {summary.attempted} answer{summary.attempted === 1 ? '' : 's'}.
      </p>
      <dl className="grid grid-cols-2 gap-2">
        {items.map((i) => (
          <div
            key={i.label}
            className="shadow-xs rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5"
          >
            <dt className="text-xs text-slate-500">{i.label}</dt>
            <dd className={cn('mt-0.5 text-lg font-bold', i.tone)}>{i.value}</dd>
          </div>
        ))}
      </dl>
      {summary.nextCursor ? (
        <p className="text-xs text-warn">
          Reached the limit of {PER_CALL_CAP} answers for one run. Continue with the next batch to process the
          rest.
        </p>
      ) : null}
      {summary.failed > 0 ? (
        <p className="text-xs text-slate-400">
          Failed answers keep their previous grade (or stay &ldquo;grading pending&rdquo;). Check the runner,
          then regrade again.
        </p>
      ) : null}
    </div>
  );
}
