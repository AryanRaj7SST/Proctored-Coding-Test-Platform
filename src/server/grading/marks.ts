/**
 * Marks arithmetic -- the fixed grading model, in exact integers.
 *
 *   questionScore = marks x passed / enabled      (equal split per test case)
 *   testScore     = sum(questionScores)
 *   percentage    = testScore / totalMarks x 100
 *   PASS          <=> testScore x 100 >= passingPercentage x totalMarks
 *
 * Amounts are integer "micro-marks" (1/10,000 of a mark), matching the
 * Decimal(12,4) score columns. A question score is rounded ONCE (half up) to
 * 4 decimal places; per-test shares are display-only and never summed, so a
 * full pass always earns exactly the question's marks and every score is
 * reproducible. Dependency-free: no Prisma, no React, no browser APIs.
 */

export const SCALE = 10_000;
const SCALE_DIGITS = 4;

/** Anything that can print itself as a decimal: number, numeric string, Prisma.Decimal. */
export type DecimalLike = number | string | { toFixed(digits: number): string };

/** Parse marks into integer micro-marks, exactly (no binary floating point). */
export function toMicro(value: DecimalLike): number {
  const text = typeof value === 'string' ? value.trim() : value.toFixed(SCALE_DIGITS);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new RangeError(`Invalid marks value: ${text}`);
  const whole = Number(match[1]);
  const fraction = (match[2] ?? '').padEnd(SCALE_DIGITS + 1, '0');
  // Round half up on the fifth decimal digit, if one was supplied.
  const micro =
    whole * SCALE + Number(fraction.slice(0, SCALE_DIGITS)) + (Number(fraction[SCALE_DIGITS]) >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(micro)) throw new RangeError(`Marks value out of range: ${text}`);
  return micro;
}

/** Micro-marks as a 4-decimal string, ready for a Decimal column. */
export function fromMicro(micro: number): string {
  const sign = micro < 0 ? '-' : '';
  const abs = Math.abs(micro);
  return `${sign}${Math.floor(abs / SCALE)}.${String(abs % SCALE).padStart(SCALE_DIGITS, '0')}`;
}

/** Micro-marks for display: "10", "2.5", "2.3333". */
export function formatMarks(micro: number): string {
  return fromMicro(micro).replace(/\.?0+$/, '');
}

/** A stored Decimal (or number) as a JS number of marks, for display and JSON only. */
export function marksToNumber(value: DecimalLike): number {
  if (typeof value === 'number') return value;
  return Number(typeof value === 'string' ? value : value.toFixed(SCALE_DIGITS));
}

/** Micro-marks as a JS number of marks (display / JSON only; never for arithmetic). */
export function microToNumber(micro: number): number {
  return micro / SCALE;
}

/** round(numerator / denominator), half up, for non-negative integers. */
function divideHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

function assertCounts(passed: number, enabled: number): void {
  if (
    !Number.isInteger(passed) ||
    !Number.isInteger(enabled) ||
    passed < 0 ||
    enabled < 0 ||
    passed > enabled
  ) {
    throw new RangeError(`Invalid test counts: ${passed} passed of ${enabled}.`);
  }
}

/**
 * marks x passed / enabled, rounded once, half up. A question with no enabled
 * test case scores 0 (it cannot be validated or published in the first place).
 */
export function questionScore(marksMicro: number, passed: number, enabled: number): number {
  assertCounts(passed, enabled);
  if (enabled === 0) return 0;
  if (passed === enabled) return marksMicro;
  return divideHalfUp(marksMicro * passed, enabled);
}

/** Each test case's equal share of the marks. Display only: never summed into a score. */
export function testCaseShare(marksMicro: number, enabled: number): number {
  return enabled > 0 ? divideHalfUp(marksMicro, enabled) : 0;
}

export type QuestionOutcome = 'PASSED' | 'PARTIAL' | 'FAILED';

/** PASSED only when every enabled test case passed. */
export function questionStatus(passed: number, enabled: number): QuestionOutcome {
  assertCounts(passed, enabled);
  if (enabled > 0 && passed === enabled) return 'PASSED';
  return passed > 0 ? 'PARTIAL' : 'FAILED';
}

export function totalOf(micros: number[]): number {
  return micros.reduce((sum, m) => sum + m, 0);
}

/** score / max x 100, to 4 decimal places (half up), as a Decimal string. */
export function percentageOf(scoreMicro: number, maxMicro: number): string {
  if (maxMicro <= 0) return fromMicro(0);
  return fromMicro(divideHalfUp(scoreMicro * 100 * SCALE, maxMicro));
}

/** Exact threshold check: score x 100 >= passing% x max. No rounding is involved. */
export function isPassing(scoreMicro: number, maxMicro: number, passingPercentage: DecimalLike): boolean {
  if (maxMicro <= 0) return false;
  return BigInt(scoreMicro) * 100n * BigInt(SCALE) >= BigInt(toMicro(passingPercentage)) * BigInt(maxMicro);
}
