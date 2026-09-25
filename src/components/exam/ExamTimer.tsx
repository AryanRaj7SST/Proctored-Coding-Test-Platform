'use client';

import * as React from 'react';
import { AlertTriangle, Clock, TimerOff } from 'lucide-react';
import { cn, formatClock } from '@/lib/utils';
import { timerAnnouncement, timerPhase, type TimerPhase } from '@/lib/timing';

/**
 * Countdown shown to the student in the exam header.
 *
 * The clock is DISPLAY ONLY. The server owns the deadline: `serverMsRemaining`
 * is re-synced by every heartbeat, and the exam is finalised server-side
 * whether or not this component is running (product requirement #20).
 *
 * Urgency is conveyed by icon + wording + colour (never colour alone), and
 * screen readers get one announcement per threshold instead of every tick.
 * `stoppedLabel` freezes the display once the sitting is being closed.
 */
export function ExamTimer({
  serverMsRemaining,
  syncedAt,
  onExpire,
  stoppedLabel,
}: {
  serverMsRemaining: number;
  syncedAt: number;
  onExpire?: () => void;
  stoppedLabel?: string | null;
}) {
  const [now, setNow] = React.useState(() => Date.now());
  const firedRef = React.useRef(false);
  const stopped = Boolean(stoppedLabel);

  React.useEffect(() => {
    if (stopped) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [stopped]);

  const remaining = Math.max(0, serverMsRemaining - (now - syncedAt));
  const phase: TimerPhase = stopped ? 'expired' : timerPhase(remaining);

  React.useEffect(() => {
    // Fire once per deadline. If the server re-syncs us with time left (our
    // countdown ran ahead), re-arm so the real deadline still fires.
    if (remaining > 1000) firedRef.current = false;
    if (remaining <= 0 && !firedRef.current && !stopped) {
      firedRef.current = true;
      onExpire?.();
    }
  }, [remaining, onExpire, stopped]);

  const [announcement, setAnnouncement] = React.useState('');
  const announcedPhase = React.useRef<TimerPhase>(phase);
  React.useEffect(() => {
    if (phase === announcedPhase.current) return;
    announcedPhase.current = phase;
    const text = timerAnnouncement(phase);
    if (text) setAnnouncement(text);
  }, [phase]);

  const Icon = phase === 'expired' ? TimerOff : phase === 'normal' ? Clock : AlertTriangle;
  const label = stopped
    ? stoppedLabel
    : phase === 'critical'
      ? 'Under 1 min'
      : phase === 'low'
        ? 'Under 5 min'
        : phase === 'expired'
          ? "Time's up"
          : 'Time left';

  return (
    <div className="flex flex-shrink-0 items-center">
      <div
        role="timer"
        aria-live="off"
        aria-label={stopped ? String(stoppedLabel) : `Time remaining ${formatClock(remaining)}`}
        className={cn(
          'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium sm:px-2.5',
          phase === 'normal' && 'border-slate-200 bg-slate-50 text-slate-700',
          phase === 'low' && 'border-amber-300 bg-amber-50 text-amber-800',
          phase === 'critical' && 'border-rose-300 bg-rose-50 text-rose-700 motion-safe:animate-pulse',
          phase === 'expired' && 'border-slate-300 bg-slate-100 text-slate-600',
        )}
      >
        <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">{label}</span>
        {stopped ? null : (
          <span className="font-mono text-[13px] font-semibold tabular-nums">{formatClock(remaining)}</span>
        )}
      </div>
      <span className="sr-only" aria-live="assertive" aria-atomic="true">
        {announcement}
      </span>
    </div>
  );
}
