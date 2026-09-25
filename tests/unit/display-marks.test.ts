import { describe, it, expect } from 'vitest';
import { displayMarks } from '@/lib/utils';

/** Display rounding only: stored scores keep 4 decimals. */
describe('displayMarks', () => {
  it('shows at most 2 decimals and drops trailing zeros', () => {
    expect(displayMarks(2.3333)).toBe('2.33');
    expect(displayMarks(4.6667)).toBe('4.67');
    expect(displayMarks(8)).toBe('8');
    expect(displayMarks(16.5)).toBe('16.5');
    expect(displayMarks(82.5)).toBe('82.5');
    expect(displayMarks(0)).toBe('0');
  });

  it('shows a dash when there is no value (never a fake 0)', () => {
    expect(displayMarks(null)).toBe('—');
    expect(displayMarks(undefined)).toBe('—');
    expect(displayMarks(Number.NaN)).toBe('—');
  });
});
