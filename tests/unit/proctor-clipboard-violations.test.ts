import { describe, it, expect } from 'vitest';
import { isViolation, violationMessage, type ProctorEventType } from '@/lib/proctor';

describe('per-exam clipboard & context menu violations', () => {
  it('by default, COPY, CUT, and CONTEXT_MENU are informational, not violations', () => {
    expect(isViolation('COPY')).toBe(false);
    expect(isViolation('CUT')).toBe(false);
    expect(isViolation('CONTEXT_MENU')).toBe(false);

    expect(isViolation('COPY', { countClipboardViolations: false })).toBe(false);
    expect(isViolation('CUT', { countClipboardViolations: false })).toBe(false);
    expect(isViolation('CONTEXT_MENU', { countClipboardViolations: false })).toBe(false);
  });

  it('when countClipboardViolations is true, COPY, CUT, and CONTEXT_MENU count as violations', () => {
    expect(isViolation('COPY', { countClipboardViolations: true })).toBe(true);
    expect(isViolation('CUT', { countClipboardViolations: true })).toBe(true);
    expect(isViolation('CONTEXT_MENU', { countClipboardViolations: true })).toBe(true);
  });

  it('standard violations remain violations regardless of the flag', () => {
    expect(isViolation('TAB_HIDDEN', { countClipboardViolations: true })).toBe(true);
    expect(isViolation('TAB_HIDDEN', { countClipboardViolations: false })).toBe(true);
    expect(isViolation('PASTE', { countClipboardViolations: true })).toBe(true);
    expect(isViolation('PASTE', { countClipboardViolations: false })).toBe(true);
  });

  it('provides student-facing warning messages for COPY, CUT, and CONTEXT_MENU', () => {
    expect(violationMessage('COPY')).toMatch(/copying/i);
    expect(violationMessage('CUT')).toMatch(/cutting/i);
    expect(violationMessage('CONTEXT_MENU')).toMatch(/context menu|right-click/i);
  });
});
