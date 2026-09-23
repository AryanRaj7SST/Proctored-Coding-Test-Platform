import { describe, it, expect } from 'vitest';
import { normalizeEmail, isValidEmail, maskEmail } from '@/lib/email';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Student@Example.COM ')).toBe('student@example.com');
  });

  it('returns an empty string for non-strings', () => {
    expect(normalizeEmail(undefined)).toBe('');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(42)).toBe('');
  });

  it('does NOT strip plus-addressing', () => {
    // Deliberate: a+b@gmail.com and a@gmail.com are different allowlist entries.
    expect(normalizeEmail('a+exam@gmail.com')).toBe('a+exam@gmail.com');
  });
});

describe('isValidEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(isValidEmail('student@example.com')).toBe(true);
    expect(isValidEmail('first.last+tag@sub.example.co.in')).toBe(true);
  });

  it('rejects malformed or injection-shaped values', () => {
    for (const bad of [
      '',
      'nope',
      'a@b',
      'a b@c.com',
      'a@b..com',
      '<a@b.com>',
      'a@b.com,c@d.com',
      'a@b.com;x',
    ]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});

describe('maskEmail', () => {
  it('keeps logs useful without storing the full address', () => {
    const masked = maskEmail('student@example.com');
    expect(masked).not.toBe('student@example.com');
    expect(masked).toContain('@example.com');
  });

  it('handles short local parts without throwing', () => {
    expect(() => maskEmail('a@b.com')).not.toThrow();
  });
});
