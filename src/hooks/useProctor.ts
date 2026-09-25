'use client';

import * as React from 'react';
import { apiPost } from '@/lib/api';
import {
  claimReloadReport,
  clipboardShortcut,
  DEDUPE_WINDOW_MS,
  isExamPageReload,
  type ClipboardAction,
  type ProctorEventType,
} from '@/lib/proctor';

interface ProctorOptions {
  examId: string;
  attemptId?: string | null;
  enabled: boolean;
  allowClipboard?: boolean;
  /** Called when the student returns and a violation was recorded. */
  onViolation?: (info: { type: ProctorEventType; message: string | null; count: number }) => void;
  onCountChange?: (count: number) => void;
  /** The server closed the sitting (e.g. the violation limit was reached). */
  onTerminated?: () => void;
  /** A copy, cut, paste or right-click was blocked (for a toast). */
  onClipboardBlocked?: (action: ClipboardAction | 'CONTEXT_MENU') => void;
}

interface EventResponse {
  recorded: boolean;
  violationCount: number;
  message: string | null;
  terminated?: boolean;
}

/** A recorded violation the student must acknowledge when they are back. */
export interface ProctorAlert {
  type: ProctorEventType;
  message: string;
}

/**
 * Violations acknowledged in a modal. Fullscreen exits and a stopped camera
 * are not in this list: while those conditions last, the workspace shows a
 * blocking gate instead (it cannot be dismissed, only fixed).
 */
const ALERT_TYPES: ProctorEventType[] = [
  'TAB_HIDDEN',
  'WINDOW_BLUR',
  'PASTE',
  'PAGE_RELOAD',
  'HEARTBEAT_LOST',
];

/** One report per clipboard action per this window, however often it is tried. */
const CLIPBOARD_REPORT_MS = 1500;

/**
 * Browser-level proctoring: detect, warn, record.
 *
 * Honest scope: this observes what a page can see -- visibility, focus,
 * fullscreen, clipboard, unload. It cannot stop a student switching apps or
 * windows, taking OS screenshots, opening devtools or using a second device,
 * and a page cannot pull itself back into focus: warnings appear when the
 * student RETURNS. Clipboard blocking is as strong as the browser allows
 * inside this page; it does not control the operating-system clipboard.
 *
 * Every event is reported to /api/proctor-events, which records it against
 * the student's current sitting and recounts violations from the database.
 * Deduplication happens twice, on purpose:
 *  1. here, because `visibilitychange` and `blur` fire together for one tab
 *     switch and there is no point sending both;
 *  2. in the API, because the client is untrusted and the database is the
 *     only source of truth for the count.
 */
export function useProctor({
  examId,
  attemptId,
  enabled,
  allowClipboard = false,
  onViolation,
  onCountChange,
  onTerminated,
  onClipboardBlocked,
}: ProctorOptions) {
  const [violationCount, setViolationCount] = React.useState(0);
  const [alert, setAlert] = React.useState<ProctorAlert | null>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(
    () => typeof document !== 'undefined' && Boolean(document.fullscreenElement),
  );

  const lastSentAt = React.useRef(0);
  const leftAt = React.useRef<number | null>(null);
  const lastClipboardReport = React.useRef<Record<string, number>>({});
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;
  const clipboardBlockedRef = React.useRef(onClipboardBlocked);
  clipboardBlockedRef.current = onClipboardBlocked;

  const send = React.useCallback(
    async (
      type: ProctorEventType,
      extra?: { durationMs?: number; metadata?: Record<string, string | number | boolean> },
    ): Promise<EventResponse | null> => {
      if (!enabledRef.current) return null;
      try {
        const res = await apiPost<EventResponse>('/api/proctor-events', {
          examId,
          attemptId: attemptId ?? undefined,
          type,
          ...extra,
        });
        setViolationCount(res.violationCount);
        onCountChange?.(res.violationCount);
        // Only say "this has been recorded" when the server actually recorded it.
        if (res.recorded && res.message) {
          if (ALERT_TYPES.includes(type)) setAlert({ type, message: res.message });
          onViolation?.({ type, message: res.message, count: res.violationCount });
        }
        if (res.terminated) onTerminated?.();
        return res;
      } catch (err) {
        // Never break the test because telemetry failed; the heartbeat will
        // re-sync the authoritative count on its next tick. But do not hide
        // it either: a rejected event is a bug worth seeing in the console.
        console.warn(`[proctor] ${type} event was not recorded`, err);
        return null;
      }
    },
    [examId, attemptId, onViolation, onCountChange, onTerminated],
  );

  const sendRef = React.useRef(send);
  sendRef.current = send;

  // Page reload: detected once per document, in its own effect. It must NOT
  // live in the listener effect below, which re-runs on every question switch
  // (attemptId changes) -- the navigation entry keeps saying "reload" for the
  // life of the document, so re-checking it there re-warned on every switch.
  React.useEffect(() => {
    if (!enabled) return;
    let isReload = false;
    try {
      const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const legacy = (performance as unknown as { navigation?: { type?: number } })?.navigation?.type;
      isReload = isExamPageReload(entry, window.location.href, legacy);
    } catch {
      /* ignore */
    }
    if (!isReload || !claimReloadReport(examId)) return;
    void sendRef.current('PAGE_RELOAD').then((res) => {
      // The server's own message ("...has been recorded") is shown on
      // success; if recording failed, warn without claiming it was logged.
      if (!res?.recorded) {
        setAlert(
          (prev) =>
            prev ?? {
              type: 'PAGE_RELOAD',
              message: 'Refreshing or reloading the test page is not allowed during the test.',
            },
        );
      }
    });
  }, [enabled, examId]);

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

  // Visibility, focus, fullscreen and unload.
  React.useEffect(() => {
    if (!enabled) return;

    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    setIsFullscreen(Boolean(document.fullscreenElement));

    const onVisibility = () => {
      if (document.hidden) sendLeave('TAB_HIDDEN');
      else onReturn();
    };

    const onBlur = () => {
      // Focus moving into an <iframe> (the live preview) also blurs the window;
      // that is not leaving the test.
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        const active = document.activeElement;
        const isIframe = active && (active.tagName === 'IFRAME' || active instanceof HTMLIFrameElement);
        if (isIframe) return;
        if (document.hidden) return; // the visibilitychange already reported it (TAB_HIDDEN)
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
      const on = Boolean(document.fullscreenElement);
      setIsFullscreen(on);
      void send(on ? 'FULLSCREEN_ENTER' : 'FULLSCREEN_EXIT');
    };

    const onUnload = () => {
      // `sendBeacon` survives the page teardown that would abort a fetch. The
      // body is this small JSON event and nothing else.
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
    window.addEventListener('pagehide', onUnload);

    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('pagehide', onUnload);
    };
  }, [enabled, examId, attemptId, send, sendLeave]);

  // Clipboard: blocked for everyone without the (admin-set, audited) accommodation.
  // Listeners run in the CAPTURE phase on the document, so they act before the
  // code editor or any input sees the event, and stop it there.
  React.useEffect(() => {
    if (!enabled || allowClipboard) return;

    const report = (action: ClipboardAction | 'CONTEXT_MENU', via: string) => {
      const now = Date.now();
      if (now - (lastClipboardReport.current[action] ?? 0) < CLIPBOARD_REPORT_MS) return;
      lastClipboardReport.current[action] = now;
      void sendRef.current(action, { metadata: { via } });
      clipboardBlockedRef.current?.(action);
    };
    const block = (e: Event, action: ClipboardAction | 'CONTEXT_MENU', via: string) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      report(action, via);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const action = clipboardShortcut(e);
      if (action) block(e, action, 'keyboard');
    };
    const onCopy = (e: ClipboardEvent) => block(e, 'COPY', 'clipboard');
    const onCut = (e: ClipboardEvent) => block(e, 'CUT', 'clipboard');
    const onPaste = (e: ClipboardEvent) => block(e, 'PASTE', 'clipboard');
    // Dropping dragged text into an editor is a paste; dragging text out is a copy.
    const onDrop = (e: DragEvent) => block(e, 'PASTE', 'drop');
    const onDragStart = (e: DragEvent) => block(e, 'COPY', 'drag');
    // The context menu offers Copy/Paste; it is closed for the whole test.
    const onContextMenu = (e: MouseEvent) => block(e, 'CONTEXT_MENU', 'right-click');

    const opts = { capture: true } as const;
    document.addEventListener('keydown', onKeyDown, opts);
    document.addEventListener('copy', onCopy, opts);
    document.addEventListener('cut', onCut, opts);
    document.addEventListener('paste', onPaste, opts);
    document.addEventListener('drop', onDrop, opts);
    document.addEventListener('dragstart', onDragStart, opts);
    document.addEventListener('contextmenu', onContextMenu, opts);
    return () => {
      document.removeEventListener('keydown', onKeyDown, opts);
      document.removeEventListener('copy', onCopy, opts);
      document.removeEventListener('cut', onCut, opts);
      document.removeEventListener('paste', onPaste, opts);
      document.removeEventListener('drop', onDrop, opts);
      document.removeEventListener('dragstart', onDragStart, opts);
      document.removeEventListener('contextmenu', onContextMenu, opts);
    };
  }, [enabled, allowClipboard]);

  /** Must run inside a user gesture (a click); browsers refuse otherwise. */
  const requestFullscreen = React.useCallback(async (): Promise<boolean> => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      /* refused: the gate stays up and says what to do */
    }
    const on = Boolean(document.fullscreenElement);
    setIsFullscreen(on);
    return on;
  }, []);

  return {
    violationCount,
    setViolationCount,
    alert,
    dismissAlert: () => setAlert(null),
    isFullscreen,
    requestFullscreen,
    /** Report an event the page itself detected (camera state changes). */
    report: send,
  };
}
