'use client';

import * as React from 'react';
import { Modal } from '@/components/ui';
import type { ProctorAlert } from '@/hooks/useProctor';

const TITLES: Partial<Record<ProctorAlert['type'], string>> = {
  TAB_HIDDEN: '⚠ Test Window Left',
  WINDOW_BLUR: '⚠ Test Window Left',
  PASTE: '⚠ Copy/Paste Blocked',
  PAGE_RELOAD: '⚠ Page Reload Detected',
  HEARTBEAT_LOST: '⚠ Connection Lost',
};

/**
 * Shown when the student comes BACK after a recorded violation (leaving the
 * window, pasting, reloading). A web page cannot pull itself back into focus,
 * so this is a "that was recorded" notice rather than a block. The count shown
 * is the server's count.
 */
export function TabSwitchModal({
  alert,
  violationCount,
  maxViolations,
  onAcknowledge,
}: {
  alert: ProctorAlert | null;
  violationCount: number;
  maxViolations: number;
  onAcknowledge: () => void;
}) {
  const remaining = maxViolations > 0 ? Math.max(0, maxViolations - violationCount) : null;

  return (
    <Modal
      open={Boolean(alert)}
      title={(alert && TITLES[alert.type]) ?? '⚠ Proctoring Warning'}
      dismissible={false}
      theme="light"
      footer={
        <button
          type="button"
          onClick={onAcknowledge}
          autoFocus
          className="shadow-xs rounded-[4px] bg-[#0066d6] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#0052b3]"
        >
          Return to the test
        </button>
      }
    >
      <div className="space-y-3 text-xs sm:text-sm">
        <p className="font-medium text-slate-800">{alert?.message ?? 'This event has been recorded.'}</p>
        {alert?.type === 'PASTE' ? (
          <p className="text-slate-700">Copying and pasting are disabled during this test.</p>
        ) : null}
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-slate-700">
            Recorded violations: <span className="font-bold text-rose-600">{violationCount}</span>
            {remaining !== null ? (
              <>
                {' '}
                — your test is submitted automatically after {maxViolations} ({remaining} remaining).
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
