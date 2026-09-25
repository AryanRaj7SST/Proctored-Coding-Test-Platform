/**
 * Equal-split marks, for display only.
 *
 * A question's marks are divided equally between its ENABLED test cases; the
 * admin never edits per-test marks and the server does the real arithmetic
 * (exact integers, see server/grading/marks.ts). Mirrors the server rule
 * `marks: 0.01 to 1000, at most 2 decimal places` for instant feedback.
 */

const MARKS_PATTERN = /^\d{1,4}(\.\d{1,2})?$/;

export const MARKS_RULE = 'Marks must be between 0.01 and 1000, with at most 2 decimal places.';

/** Parsed marks, or null when the input would be rejected by the server. */
export function parseMarks(input: string | number): number | null {
  const text = String(input).trim();
  if (!MARKS_PATTERN.test(text)) return null;
  const value = Number(text);
  return value > 0 && value <= 1000 ? value : null;
}

/** "10", "2.5", "2.33": at most 2 decimals, no trailing zeroes. */
export function formatMarks(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
}

export function marksWord(value: number): string {
  return value === 1 ? 'mark' : 'marks';
}

export interface MarksShare {
  /** Each enabled test's share, rounded to 2 decimals. */
  share: number;
  /** True when the split is exact at 2 decimals (so no "(7 ÷ 3)" hint is needed). */
  exact: boolean;
}

export function equalShare(marks: number, enabledCount: number): MarksShare {
  if (enabledCount <= 0) return { share: 0, exact: true };
  const cents = Math.round(marks * 100);
  return { share: Math.round(cents / enabledCount) / 100, exact: cents % enabledCount === 0 };
}

/** "each 2 marks" / "each 2.33 marks (7 ÷ 3)". */
export function shareLabel(marks: number, enabledCount: number): string {
  const { share, exact } = equalShare(marks, enabledCount);
  const base = `${formatMarks(share)} ${marksWord(share)}`;
  return exact ? base : `${base} (${formatMarks(marks)} ÷ ${enabledCount})`;
}

/**
 * The one-line summary shown next to the marks field and above the test list:
 * "Question: 10 marks · 5 enabled test cases · each 2 marks".
 */
export function splitSummary(marksInput: string | number, enabledCount: number): string {
  const marks = parseMarks(marksInput);
  if (marks === null) return 'Enter valid marks to see how they are split between test cases.';
  const head = `Question: ${formatMarks(marks)} ${marksWord(marks)}`;
  if (enabledCount === 0) return `${head} · no enabled test cases yet`;
  if (enabledCount === 1) return `${head} · 1 enabled test case · worth all ${formatMarks(marks)}`;
  return `${head} · ${enabledCount} enabled test cases · each ${shareLabel(marks, enabledCount)}`;
}
