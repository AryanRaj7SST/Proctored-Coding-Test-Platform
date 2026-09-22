'use client';

import * as React from 'react';

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/**
 * Debounced autosave (product requirement #19).
 *
 * - Writes at most once per `delay` of quiet typing, never per keystroke.
 * - Serialises requests: a save in flight queues the newest value instead of
 *   racing, so a slow network can never write stale code over fresh code.
 * - Exposes `flush()` for "save now" moments (submit, unload, tab change).
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  { delay = 1500, enabled = true }: { delay?: number; enabled?: boolean } = {},
) {
  const [state, setState] = React.useState<SaveState>('idle');
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = React.useRef(false);
  const queued = React.useRef<T | null>(null);
  const latest = React.useRef(value);
  const saveRef = React.useRef(save);
  const firstRun = React.useRef(true);

  latest.current = value;
  saveRef.current = save;

  const run = React.useCallback(async (payload: T) => {
    if (inFlight.current) {
      queued.current = payload;
      return;
    }
    inFlight.current = true;
    setState('saving');
    try {
      await saveRef.current(payload);
      setSavedAt(new Date());
      setError(null);
      setState('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      setState('error');
    } finally {
      inFlight.current = false;
      const next = queued.current;
      queued.current = null;
      if (next !== null) void run(next);
    }
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    // Do not write the value we just loaded back to the server.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setState('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(latest.current), delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, delay, enabled, run]);

  const flush = React.useCallback(async () => {
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    await run(latest.current);
  }, [enabled, run]);

  return { state, savedAt, error, flush };
}
