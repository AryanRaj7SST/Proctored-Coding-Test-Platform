'use client';

import * as React from 'react';
import { apiPost } from '@/lib/api';
import { DEDUPE_WINDOW_MS, type ProctorEventType } from '@/lib/proctor';

interface ProctorOptions {
  examId: string;
  attemptId?: string | null;
  enabled: boolean;
  /** Called when the student returns and a violation was recorded. */
  onViolation?: (info: { type: ProctorEventType; message: string | null; count: number }) => void;
  onCountChange?: (count: number) => void;
}

interface EventResponse {
  recorded: boolean;
  violationCount: number;
  message: string | null;
}

/**
 * Browser-level proctoring.
 *
 * Honest scope (product requirement #21): this observes events the page can
 * see -- visibility, focus, fullscreen, clipboard, unload. It cannot detect a
 * second device, another monitor, a virtual machine, or OS-level activity, and
 * a page cannot pull itself back into focus. The modal therefore appears when
 * the student RETURNS.
 *
 * Deduplication happens twice, on purpose:
 *  1. here, because `visibilitychange` and `blur` fire together for one tab
 *     switch and there is no point sending both;
 *  2. in the API, because the client is untrusted and the database is the only
 *     source of truth for the count (product requirement #22).
 */
export function useProctor({ examId, attemptId, enabled, onViolation, onCountChange }: ProctorOptions) {
  const [violationCount, setViolationCount] = React.useState(0);
  const [awayMessage, setAwayMessage] = React.useState<string | null>(null);

  const lastSentAt = React.useRef(0);
  const leftAt = React.useRef<number | null>(null);
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;

  const send = React.useCallback(
    async (type: ProctorEventType, extra?: { durationMs?: number; metadata?: Record<string, unknown> }) => {
      if (!enabledRef.current) return;
      try {
        const res = await apiPost<EventResponse>('/api/proctor-events', {
          examId,
          attemptId: attemptId ?? undefined,
          type,
          ...extra,
        });
        setViolationCount(res.violationCount);
        onCountChange?.(res.violationCount);
        if (res.recorded && res.message) {
          setAwayMessage(res.message);
          onViolation?.({ type, message: res.message, count: res.violationCount });
        }
      } catch {
        // Never break the exam because telemetry failed; the heartbeat will
        // re-sync the authoritative count on its next tick.
      }
    },
    [examId, attemptId, onViolation, onCountChange],
  );

  const sendLeave = React.useCallback(
    (type: ProctorEventType) => {
      const now = Date.now();
      if (now - lastSentAt.current < DEDUPE_WINDOW_MS) return; // blur + visibilitychange pair
      lastSentAt.current = now;
      leftAt.current = now;
      void send(type);
    },
    [send],
  );

  React.useEffect(() => {
    if (!enabled) return;

    let blurTimer: ReturnType<typeof setTimeout> | null = null;

    const onVisibility = () => {
      if (document.hidden) sendLeave('TAB_HIDDEN');
      else onReturn();
    };

    const onBlur = () => {
      // Browsers fire a window blur event when focus moves inside an <iframe> (such as the live preview).
      // We check if document.activeElement is an IFRAME before recording a window blur violation.
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        const active = document.activeElement;
        const isIframe = active && (active.tagName === 'IFRAME' || active instanceof HTMLIFrameElement);
        if (isIframe) {
          return;
        }
        if (document.hidden) {
          // Handled by visibilitychange event (TAB_HIDDEN)
          return;
        }
        sendLeave('WINDOW_BLUR');
      }, 60);
    };

    const onFocus = () => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
      onReturn();
    };

    const onReturn = () => {
      const away = leftAt.current ? Date.now() - leftAt.current : 0;
      leftAt.current = null;
      if (away > 0) void send('WINDOW_FOCUS', { durationMs: away });
    };

    const onFullscreen = () => {
      if (document.fullscreenElement) void send('FULLSCREEN_ENTER');
      else void send('FULLSCREEN_EXIT');
    };

    const onCopy = () => void send('COPY');
    const onCut = () => void send('CUT');
    const onPaste = () => void send('PASTE');
    const onContextMenu = () => void send('CONTEXT_MENU');
    const onUnload = () => {
      // `sendBeacon` survives the page teardown that would abort a fetch.
      try {
        navigator.sendBeacon?.(
          '/api/proctor-events',
          new Blob([JSON.stringify({ examId, attemptId: attemptId ?? undefined, type: 'PAGE_UNLOAD' })], {
            type: 'application/json',
          }),
        );
      } catch {
        /* best effort only */
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pagehide', onUnload);

    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pagehide', onUnload);
    };
  }, [enabled, examId, attemptId, send, sendLeave]);

  const requestFullscreen = React.useCallback(async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      // Browsers only allow this from a user gesture; failing is not fatal.
    }
  }, []);

  return {
    violationCount,
    setViolationCount,
    awayMessage,
    dismissAway: () => setAwayMessage(null),
    requestFullscreen,
  };
}
