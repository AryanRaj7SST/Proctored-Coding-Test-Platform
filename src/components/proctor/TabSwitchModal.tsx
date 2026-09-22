'use client';

import * as React from 'react';
import { Button, Modal } from '@/components/ui';

/**
 * Shown when the student RETURNS to the exam tab.
 *
 * A web page cannot pull itself back into focus, so this is deliberately a
 * "welcome back, that was recorded" notice rather than a block
 * (product requirement #21). The count shown is the server's count.
 */
export function TabSwitchModal({
  open,
  message,
  violationCount,
  maxViolations,
  onAcknowledge,
}: {
  open: boolean;
  message: string | null;
  violationCount: number;
  maxViolations: number;
  onAcknowledge: () => void;
}) {
  const remaining = maxViolations > 0 ? Math.max(0, maxViolations - violationCount) : null;

  return (
    <Modal
      open={open}
      title="Tab switching is prohibited"
      dismissible={false}
      footer={
        <Button onClick={onAcknowledge} autoFocus>
          I understand
        </Button>
      }
    >
      <p>{message ?? 'Leaving the exam window has been recorded.'}</p>
      <p className="mt-3 text-slate-400">
        Recorded violations: <span className="font-semibold text-slate-200">{violationCount}</span>
        {remaining !== null ? (
          <>
            {' '}
            — your exam is submitted automatically after {maxViolations} ({remaining} remaining).
          </>
        ) : null}
      </p>
      <p className="mt-3 text-xs text-slate-500">
        Every event is stored on the server with a timestamp and reviewed by your mentor.
      </p>
    </Modal>
  );
}
