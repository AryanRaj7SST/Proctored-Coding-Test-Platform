'use client';

import * as React from 'react';
import { formatClock } from '@/lib/utils';
import { cn } from '@/lib/utils';

/**
 * Countdown display.
 *
 * The clock is DISPLAY ONLY. The server owns the deadline: `serverMsRemaining`
 * is re-synced by every heartbeat, and the exam is finalised server-side
 * whether or not this component is running (product requirement #20).
 */
export function ExamTimer({
  serverMsRemaining,
  syncedAt,
  onExpire,
}: {
  serverMsRemaining: number;
  syncedAt: number;
  onExpire?: () => void;
}) {
  const [now, setNow] = React.useState(() => Date.now());
  const firedRef = React.useRef(false);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    firedRef.current = false;
  }, [syncedAt]);

  const remaining = Math.max(0, serverMsRemaining - (now - syncedAt));

  React.useEffect(() => {
    if (remaining <= 0 && !firedRef.current) {
      firedRef.current = true;
      onExpire?.();
    }
  }, [remaining, onExpire]);

  const critical = remaining <= 60_000;
  const low = remaining <= 5 * 60_000;

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={`Time remaining ${formatClock(remaining)}`}
      className={cn(
        'rounded-md px-3 py-1 font-mono text-sm tabular-nums ring-1 ring-inset',
        critical
          ? 'bg-bad/15 text-rose-300 ring-bad/40'
          : low
            ? 'bg-warn/15 text-amber-200 ring-warn/40'
            : 'bg-ink-800 text-slate-200 ring-ink-600',
      )}
    >
      {formatClock(remaining)}
    </div>
  );
}
