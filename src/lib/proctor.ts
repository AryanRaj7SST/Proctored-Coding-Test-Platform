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
  | 'HEARTBEAT_LOST'
  | 'EXAM_STARTED'
  | 'EXAM_SUBMITTED';

/** Events that count towards a student's violation total. */
export const VIOLATION_TYPES: ProctorEventType[] = [
  'TAB_HIDDEN',
  'WINDOW_BLUR',
  'FULLSCREEN_EXIT',
  'PASTE',
  'HEARTBEAT_LOST',
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
];

export function isViolation(type: ProctorEventType): boolean {
  return VIOLATION_TYPES.includes(type);
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
      return 'Tab switching is prohibited. This has been recorded.';
    case 'FULLSCREEN_EXIT':
      return 'Leaving fullscreen is prohibited during the exam. This has been recorded.';
    case 'PASTE':
      return 'Pasting code into the editor is not allowed. This has been recorded.';
    case 'HEARTBEAT_LOST':
      return 'Your connection dropped during the exam. This has been recorded.';
    default:
      return 'A proctoring event was recorded.';
  }
}
