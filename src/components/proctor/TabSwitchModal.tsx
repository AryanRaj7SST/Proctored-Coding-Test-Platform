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

  const title = message?.includes('fullscreen')
    ? 'Fullscreen required'
    : message?.includes('reloading') || message?.includes('Refreshing')
      ? 'Page reload detected'
      : message?.includes('Pasting')
        ? 'Pasting is prohibited'
        : 'Tab switching is prohibited';

  return (
    <Modal
      open={open}
      title={title}
      dismissible={false}
      theme="light"
      footer={
        <button
          type="button"
          onClick={onAcknowledge}
          autoFocus
          className="shadow-xs rounded-[4px] bg-[#0066d6] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#0052b3]"
        >
          Continue in Full Screen
        </button>
      }
    >
      <div className="space-y-3 text-xs sm:text-sm">
        <p className="font-medium text-slate-800">
          {message ?? 'Leaving the exam window has been recorded.'}
        </p>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-slate-700">
            Recorded violations: <span className="font-bold text-rose-600">{violationCount}</span>
            {remaining !== null ? (
              <>
                {' '}
                — your exam is submitted automatically after {maxViolations} ({remaining} remaining).
              </>
            ) : null}
          </p>
        </div>
        <p className="text-xs text-slate-500">
          Every event is stored on the server with a timestamp and reviewed by your mentor.
        </p>
      </div>
    </Modal>
  );
}
