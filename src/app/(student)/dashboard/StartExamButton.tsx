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
}: {
  examId: string;
  title: string;
  durationMinutes: number;
  questionCount: number;
  resuming: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const go = async () => {
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
        {resuming ? 'Resume exam' : 'Start exam'}
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
            The countdown is kept on the server. It keeps running if you close the tab, lose your connection or reload
            the page{resuming ? ' — resuming does not give you more time' : ''}.
          </li>
          <li>
            Leaving the exam window is recorded. Tab switches, focus loss, fullscreen exits and clipboard use are all
            logged with timestamps and shown to your mentor.
          </li>
          <li>Your work is saved automatically as you type, and graded against hidden test cases when you submit.</li>
          <li>When the time runs out, whatever you have written is submitted and graded automatically.</li>
        </ul>
      </Modal>
    </>
  );
}
