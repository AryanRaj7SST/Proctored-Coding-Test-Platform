'use client';

import * as React from 'react';
import { SaveQueue } from '@/lib/save-queue';

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/**
 * Debounced autosave (product requirement #19).
 *
 * - Writes at most once per `delay` of quiet typing, never per keystroke.
 * - Every save is bound to the `key` (attempt id) the edit was made under.
 *   When `key` changes (the student switched question) a pending edit is
 *   flushed under its OWN key, and the newly loaded value is treated as the
 *   baseline rather than written back. See src/lib/save-queue.ts.
 * - Requests are serialised and transient failures retried.
 * - `flush()` resolves only once every pending, queued and in-flight save has
 *   settled -- use it before submit, run, End Test and question switches.
 */
export function useAutosave<T>(
  value: T,
  key: string | null,
  save: (key: string, value: T) => Promise<void>,
  { delay = 1500, enabled = true }: { delay?: number; enabled?: boolean } = {},
) {
  const [state, setState] = React.useState<SaveState>('idle');
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const saveRef = React.useRef(save);
  saveRef.current = save;

  const queueRef = React.useRef<SaveQueue<T> | null>(null);
  if (!queueRef.current) {
    queueRef.current = new SaveQueue<T>((k, v) => saveRef.current(k, v), {
      onEvent: (event) => {
        if (event.type === 'saving') setState('saving');
        if (event.type === 'saved') {
          setSavedAt(new Date());
          setError(null);
          setState('saved');
        }
        if (event.type === 'error') {
          setError(event.error instanceof Error ? event.error.message : 'Could not save.');
          setState('error');
        }
      },
    });
  }

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = React.useRef<{ key: string; value: T } | null>(null);
  const baselineKey = React.useRef<string | null>(key);
  const firstRun = React.useRef(true);

  const sendPending = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const job = pending.current;
    pending.current = null;
    return job ? queueRef.current!.enqueue(job.key, job.value) : queueRef.current!.drain();
  }, []);

  React.useEffect(() => {
    if (key !== baselineKey.current) {
      // Question switch: the old attempt's edit keeps the old attempt's key.
      if (pending.current) void sendPending();
      baselineKey.current = key;
      firstRun.current = false;
      return;
    }
    // Do not write the value we just loaded back to the server.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!enabled || !key) return;
    pending.current = { key, value };
    setState('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void sendPending(), delay);
  }, [value, key, delay, enabled, sendPending]);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** Save anything pending now and wait until every save has settled. */
  const flush = React.useCallback(async () => {
    await sendPending();
  }, [sendPending]);

  return { state, savedAt, error, flush };
}
