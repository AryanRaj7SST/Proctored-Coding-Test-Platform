/**
 * Proctoring rules.
 *
 * Honest scope: this is browser-level deterrence + an audit trail. A web page
 * cannot detect a second monitor, another device, a VM, or OS-level activity,
 * and it cannot force focus back to itself. See docs/security.md.
 */

export type ProctorEventType =
  | 'TAB_HIDDEN'
  | 'WINDOW_BLUR'
  | 'WINDOW_FOCUS'
  | 'FULLSCREEN_EXIT'
  | 'FULLSCREEN_ENTER'
  | 'COPY'
  | 'CUT'
  | 'PASTE'
  | 'CONTEXT_MENU'
  | 'PAGE_UNLOAD'
  | 'PAGE_RELOAD'
  | 'HEARTBEAT_LOST'
  | 'EXAM_STARTED'
  | 'EXAM_SUBMITTED'
  // Camera: only these facts are ever stored -- never an image or a video frame.
  | 'CAMERA_PERMISSION_GRANTED'
  | 'CAMERA_PERMISSION_DENIED'
  | 'CAMERA_UNAVAILABLE'
  | 'CAMERA_STREAM_STOPPED'
  | 'CAMERA_RESTORED';

/** Events that count towards a student's violation total. */
export const VIOLATION_TYPES: ProctorEventType[] = [
  'TAB_HIDDEN',
  'WINDOW_BLUR',
  'FULLSCREEN_EXIT',
  'PASTE',
  'PAGE_RELOAD',
  'HEARTBEAT_LOST',
  'CAMERA_STREAM_STOPPED',
];

/** Informational events: recorded for the timeline, never counted. */
export const INFO_TYPES: ProctorEventType[] = [
  'WINDOW_FOCUS',
  'FULLSCREEN_ENTER',
  'COPY',
  'CUT',
  'CONTEXT_MENU',
  'PAGE_UNLOAD',
  'EXAM_STARTED',
  'EXAM_SUBMITTED',
  // Denied/unavailable happen before a sitting can start (the start is refused),
  // so they are recorded for the timeline but are not violations.
  'CAMERA_PERMISSION_GRANTED',
  'CAMERA_PERMISSION_DENIED',
  'CAMERA_UNAVAILABLE',
  'CAMERA_RESTORED',
];

export const CAMERA_TYPES: ProctorEventType[] = [
  'CAMERA_PERMISSION_GRANTED',
  'CAMERA_PERMISSION_DENIED',
  'CAMERA_UNAVAILABLE',
  'CAMERA_STREAM_STOPPED',
  'CAMERA_RESTORED',
];

export function isViolation(
  type: ProctorEventType,
  options?: { countClipboardViolations?: boolean },
): boolean {
  if (options?.countClipboardViolations && (type === 'COPY' || type === 'CUT' || type === 'CONTEXT_MENU')) {
    return true;
  }
  return VIOLATION_TYPES.includes(type);
}

export const CLIPBOARD_TYPES: ProctorEventType[] = ['COPY', 'CUT', 'PASTE'];

/**
 * The clipboard accommodation (ExamAssignment.allowClipboard) exempts
 * copy/cut/paste and nothing else: tab switches, fullscreen exits, reloads
 * and the exam timing are unaffected.
 */
export function isClipboardExempt(
  type: ProctorEventType,
  accommodation: { allowClipboard: boolean },
): boolean {
  return accommodation.allowClipboard === true && CLIPBOARD_TYPES.includes(type);
}

export type ClipboardAction = 'COPY' | 'CUT' | 'PASTE';

/**
 * The clipboard action a key press would trigger, or null for ordinary typing.
 * Covers Ctrl/Cmd+C/X/V (with or without Shift) and the legacy Windows/Linux
 * bindings Ctrl+Insert (copy), Shift+Insert (paste) and Shift+Delete (cut).
 */
export function clipboardShortcut(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): ClipboardAction | null {
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    if (key === 'c') return 'COPY';
    if (key === 'x') return 'CUT';
    if (key === 'v') return 'PASTE';
    if (key === 'insert' && !e.shiftKey) return 'COPY';
  }
  if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (key === 'insert') return 'PASTE';
    if (key === 'delete') return 'CUT';
  }
  return null;
}

/**
 * Leaving a tab fires BOTH `visibilitychange` and `blur` in most browsers.
 * Collapse anything in the same "leave" family that lands inside this window
 * into a single violation (product requirement #21).
 */
export const DEDUPE_WINDOW_MS = 1500;

const LEAVE_FAMILY: ProctorEventType[] = ['TAB_HIDDEN', 'WINDOW_BLUR'];

export interface DedupeInput {
  type: ProctorEventType;
  occurredAt: Date;
}

export interface DedupeDecision {
  accept: boolean;
  reason?: 'duplicate-leave' | 'duplicate-same-type';
}

/**
 * Decide whether an incoming event should be persisted as a NEW event, given
 * the most recent stored event of the relevant family.
 */
export function shouldRecordEvent(
  incoming: DedupeInput,
  lastSimilar: DedupeInput | null,
  windowMs: number = DEDUPE_WINDOW_MS,
): DedupeDecision {
  if (!lastSimilar) return { accept: true };
  const delta = incoming.occurredAt.getTime() - lastSimilar.occurredAt.getTime();
  if (delta < 0 || delta > windowMs) return { accept: true };

  const bothLeave = LEAVE_FAMILY.includes(incoming.type) && LEAVE_FAMILY.includes(lastSimilar.type);
  if (bothLeave) return { accept: false, reason: 'duplicate-leave' };
  if (incoming.type === lastSimilar.type) return { accept: false, reason: 'duplicate-same-type' };
  return { accept: true };
}

/** Which stored types are "similar" to the incoming type for dedupe lookup. */
export function dedupeFamily(type: ProctorEventType): ProctorEventType[] {
  return LEAVE_FAMILY.includes(type) ? LEAVE_FAMILY : [type];
}

/** Count violations from a list of persisted events -- DB is the source of truth. */
export function countViolations(events: { type: ProctorEventType }[]): number {
  return events.reduce((n, e) => n + (isViolation(e.type) ? 1 : 0), 0);
}

export type SessionStatus = 'ACTIVE' | 'AWAY' | 'DISCONNECTED' | 'SUBMITTED' | 'EXPIRED';

export interface SessionSnapshot {
  lastHeartbeat: Date;
  expiresAt: Date;
  endedAt: Date | null;
  lastEventType?: ProctorEventType | null;
}

/** Derive the live monitor status from persisted state only. */
export function deriveSessionStatus(
  s: SessionSnapshot,
  now: Date = new Date(),
  staleSeconds = 45,
): SessionStatus {
  if (s.endedAt) return 'SUBMITTED';
  if (now.getTime() >= s.expiresAt.getTime()) return 'EXPIRED';
  const silentMs = now.getTime() - s.lastHeartbeat.getTime();
  if (silentMs > staleSeconds * 1000) return 'DISCONNECTED';
  if (s.lastEventType === 'TAB_HIDDEN' || s.lastEventType === 'WINDOW_BLUR') return 'AWAY';
  return 'ACTIVE';
}

/** Student-facing warning copy, kept in one place. */
export function violationMessage(type: ProctorEventType): string {
  switch (type) {
    case 'TAB_HIDDEN':
    case 'WINDOW_BLUR':
      return 'You left the test window. This event has been recorded. Please remain on the test screen.';
    case 'FULLSCREEN_EXIT':
      return 'Leaving fullscreen is prohibited during the test. This has been recorded.';
    case 'PASTE':
      return 'Pasting code into the editor is not allowed. This has been recorded.';
    case 'COPY':
      return 'Copying code from the test is prohibited. This has been recorded.';
    case 'CUT':
      return 'Cutting code from the test is prohibited. This has been recorded.';
    case 'CONTEXT_MENU':
      return 'Opening the context menu is prohibited. This has been recorded.';
    case 'PAGE_RELOAD':
      return 'Refreshing or reloading the test page is prohibited. This has been recorded.';
    case 'HEARTBEAT_LOST':
      return 'Your connection dropped during the test. This has been recorded.';
    case 'CAMERA_STREAM_STOPPED':
      return 'Camera access is required while taking this test. This has been recorded.';
    default:
      return 'A proctoring event was recorded.';
  }
}

/** Administrator-facing label for the proctoring timeline and the live monitor. */
const EVENT_LABELS: Record<ProctorEventType, string> = {
  TAB_HIDDEN: 'Left the test tab',
  WINDOW_BLUR: 'Window focus lost',
  WINDOW_FOCUS: 'Returned to the test',
  FULLSCREEN_EXIT: 'Fullscreen exited',
  FULLSCREEN_ENTER: 'Fullscreen entered',
  COPY: 'Copy blocked',
  CUT: 'Cut blocked',
  PASTE: 'Paste blocked',
  CONTEXT_MENU: 'Right-click menu blocked',
  PAGE_UNLOAD: 'Page closed',
  PAGE_RELOAD: 'Page reloaded',
  HEARTBEAT_LOST: 'Connection lost',
  EXAM_STARTED: 'Test started',
  EXAM_SUBMITTED: 'Test submitted',
  CAMERA_PERMISSION_GRANTED: 'Camera enabled',
  CAMERA_PERMISSION_DENIED: 'Camera permission denied',
  CAMERA_UNAVAILABLE: 'No camera available',
  CAMERA_STREAM_STOPPED: 'Camera stopped',
  CAMERA_RESTORED: 'Camera restored',
};

export function eventLabel(type: string): string {
  return EVENT_LABELS[type as ProctorEventType] ?? type.replace(/_/g, ' ').toLowerCase();
}

/**
 * The camera state a sitting's events describe, for the live monitor: the
 * newest camera event decides. A client report, shown to administrators --
 * never used to authorise, time or grade anything.
 */
export function cameraStateFromEvents(newestFirst: { type: string }[]): 'ON' | 'OFF' | null {
  const last = newestFirst.find((e) => (CAMERA_TYPES as string[]).includes(e.type));
  if (!last) return null;
  return last.type === 'CAMERA_PERMISSION_GRANTED' || last.type === 'CAMERA_RESTORED' ? 'ON' : 'OFF';
}

/* ------------------------------------------------------------ page reload */

/**
 * Was THIS exam page reloaded? The Navigation Timing entry describes how the
 * current DOCUMENT was loaded and never changes afterwards, so it must be
 * read once per document -- and it only counts if the document that was
 * reloaded is the exam page itself (a reload of the dashboard followed by a
 * client-side navigation into the exam is not an exam reload).
 */
export function isExamPageReload(
  entry: { type?: string; name?: string } | undefined,
  currentUrl: string,
  legacyNavigationType?: number,
): boolean {
  if (entry) {
    if (entry.type !== 'reload') return false;
    try {
      return new URL(entry.name ?? '', currentUrl).pathname === new URL(currentUrl).pathname;
    } catch {
      return false;
    }
  }
  return legacyNavigationType === 1; // performance.navigation.TYPE_RELOAD
}

const reportedReloads = new Set<string>();

/** True exactly once per exam per document, however often effects re-run. */
export function claimReloadReport(examId: string): boolean {
  if (reportedReloads.has(examId)) return false;
  reportedReloads.add(examId);
  return true;
}
