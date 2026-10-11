'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal } from '@/components/ui';

/**
 * Pre-flight modal.
 *
 * It exists for two reasons: the student must see the proctoring rules before
 * the clock starts, and entering fullscreen requires a user gesture — this
 * click is that gesture.
 */
export function StartExamButton({
  examId,
  title,
  durationMinutes,
  questionCount,
  resuming,
  label,
}: {
  examId: string;
  title: string;
  durationMinutes: number;
  questionCount: number;
  resuming: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // Fullscreen is a nicety, not a gate.
    }
    router.push(`/exam/${examId}`);
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {label ?? (resuming ? 'Resume test' : 'Start test')}
      </Button>

      <Modal
        open={open}
        title={resuming ? `Resume “${title}”` : `Before you start “${title}”`}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void go()} loading={busy}>
              {resuming ? 'Resume now' : 'Start the timer'}
            </Button>
          </>
        }
      >
        <ul className="space-y-2 text-sm text-slate-300">
          <li>
            You have <strong className="text-slate-100">{durationMinutes} minutes</strong> for{' '}
            <strong className="text-slate-100">{questionCount}</strong> question
            {questionCount === 1 ? '' : 's'}.
          </li>
          <li>
            The countdown is kept on the server. It keeps running if you close the tab, lose your connection
            or reload the page{resuming ? ' — resuming does not give you more time' : ''}.
          </li>
          <li>
            The test runs in fullscreen with your camera on. The camera picture is shown only on your screen:
            it is never recorded, uploaded or stored, and it turns off when the test ends.
          </li>
          <li>
            Leaving the test window is recorded. Tab switches, focus loss, fullscreen exits and clipboard use
            are all logged with timestamps and shown to your mentor. Copy and paste are disabled.
          </li>
          <li>
            Your work is saved automatically as you type. Every question lists the test cases it is graded on;
            each question&apos;s marks are shared equally between its test cases.
          </li>
          <li>When the time runs out, whatever you have written is submitted and graded automatically.</li>
        </ul>
      </Modal>
    </>
  );
}
