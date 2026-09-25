/*
 * Test ("exam") window timestamps
 * -------------------------------
 * A test's start/end are stored as UTC INSTANTS and travel as ISO-8601 UTC
 * strings (or ''/null), exactly as the database has them. Nothing converts
 * them on the server, so the server's time zone can never leak into the form.
 *
 * The <input type="datetime-local"> shows wall-clock time in an EXPLICIT time
 * zone -- the test's own `timezone` (IANA, default Asia/Kolkata), displayed
 * next to the fields. Conversion happens only in the browser, only through the
 * functions below, and only when the admin edits a field: an untouched field
 * is sent back as the original ISO instant, byte for byte, so repeated saves
 * (or a change of the test's zone) never move it.
 */

const LOCAL_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** The default zone for new tests (matches the server default). */
export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

function zonedParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    y: get('year'),
    mo: get('month'),
    d: get('day'),
    h: get('hour'),
    mi: get('minute'),
    s: get('second'),
  };
}

/** Offset (ms) of `timeZone` from UTC at instant `ms`. */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** ISO instant -> `YYYY-MM-DDTHH:mm` wall-clock time in `timeZone`. */
export function isoToZonedInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const p = zonedParts(ms, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

/** `YYYY-MM-DDTHH:mm` wall-clock time in `timeZone` -> ISO instant ('' if empty/invalid). */
export function zonedInputToIso(local: string, timeZone: string): string {
  const m = LOCAL_INPUT_RE.exec(local);
  if (!m) return '';
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Resolve the zone offset at the target instant (twice, to settle DST edges).
  let ms = wall - zoneOffsetMs(wall, timeZone);
  ms = wall - zoneOffsetMs(ms, timeZone);
  return new Date(ms).toISOString();
}

/** "UTC+05:30" -- the zone's offset at instant `at`. */
export function utcOffsetLabel(timeZone: string, at: number = Date.now()): string {
  const offset = Math.round(zoneOffsetMs(at, timeZone) / 60_000);
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** "Asia/Kolkata (UTC+05:30)" -- shown next to the fields so the zone is explicit. */
export function describeTimeZone(timeZone: string, at: number = Date.now()): string {
  return `${timeZone} (${utcOffsetLabel(timeZone, at)})`;
}

/**
 * The value to send for a window field: the untouched original instant when
 * the admin did not change the input, otherwise the edited wall time
 * interpreted in `timeZone`.
 */
export function windowFieldPayload(
  originalIso: string,
  editedLocal: string | null,
  timeZone: string,
): string | null {
  if (editedLocal === null) return originalIso || null; // untouched: never reinterpret
  return zonedInputToIso(editedLocal, timeZone) || null;
}

/**
 * What a window input shows: the admin's own typing when edited (kept as
 * wall-clock text, so switching the zone re-interprets it), otherwise the
 * stored instant rendered in `timeZone` (so switching the zone re-renders it
 * without moving the instant).
 */
export function windowInputValue(originalIso: string, editedLocal: string | null, timeZone: string): string {
  return editedLocal ?? isoToZonedInput(originalIso, timeZone);
}

/**
 * Normalise a test's stored window to ISO strings ('' when unset) without any
 * zone conversion. The result is identical whatever zone the server runs in.
 */
export function examValuesFrom<T extends { startTime: Date | string | null; endTime: Date | string | null }>(
  exam: T,
): Omit<T, 'startTime' | 'endTime'> & { startTime: string; endTime: string } {
  return {
    ...exam,
    // Stored instants, untouched. Converted for display in the browser only.
    startTime: exam.startTime ? new Date(exam.startTime).toISOString() : '',
    endTime: exam.endTime ? new Date(exam.endTime).toISOString() : '',
  };
}

/* ------------------------------------------------------------- display */

function displayParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('day')} ${get('month')} ${get('year')}`,
    time: `${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`,
  };
}

/**
 * "25 Sep 2026, 10:00 AM" in `timeZone` (never the machine's zone). Built
 * from parts so server and browser render the same text.
 */
export function formatInZone(
  iso: string | Date | null | undefined,
  timeZone: string,
  mode: 'datetime' | 'date' | 'time' = 'datetime',
): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const { date, time } = displayParts(ms, timeZone);
  if (mode === 'date') return date;
  if (mode === 'time') return time;
  return `${date}, ${time}`;
}

/** Do two instants fall on the same calendar day in `timeZone`? */
export function sameDayInZone(a: string, b: string, timeZone: string): boolean {
  const da = isoToZonedInput(a, timeZone).slice(0, 10);
  return da !== '' && da === isoToZonedInput(b, timeZone).slice(0, 10);
}

/**
 * IANA zones for the zone picker: Asia/Kolkata and UTC first, then every zone
 * this runtime knows (when `Intl.supportedValuesOf` exists), plus `current`
 * so an unusual stored zone is never dropped.
 */
export function timeZoneChoices(current?: string): string[] {
  let all: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: 'timeZone') => string[] };
    all = intl.supportedValuesOf?.('timeZone') ?? [];
  } catch {
    all = [];
  }
  return [...new Set([DEFAULT_TIME_ZONE, 'UTC', ...(current ? [current] : []), ...all])];
}
