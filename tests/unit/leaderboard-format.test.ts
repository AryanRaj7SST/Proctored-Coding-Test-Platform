import { describe, it, expect } from 'vitest';
import { formatEffectiveDuration, formatSolveDuration, getAvatarInitial } from '@/lib/leaderboard-format';

describe('leaderboard-format utilities', () => {
  describe('formatEffectiveDuration', () => {
    it('formats seconds into HH:MM:SS string', () => {
      // 0 seconds
      expect(formatEffectiveDuration(0)).toBe('00H:00M:00S');

      // 65 seconds -> 1m 5s
      expect(formatEffectiveDuration(65)).toBe('00H:01M:05S');

      // 3661 seconds -> 1h 1m 1s
      expect(formatEffectiveDuration(3661)).toBe('01H:01M:01S');

      // Hours exceeding 24 (e.g. Scaler contest reference: 31H:28M:16S)
      // 31 * 3600 + 28 * 60 + 16 = 111600 + 1680 + 16 = 113296
      expect(formatEffectiveDuration(113296)).toBe('31H:28M:16S');
    });

    it('handles negative or invalid values gracefully', () => {
      expect(formatEffectiveDuration(-5)).toBe('00H:00M:00S');
      expect(formatEffectiveDuration(NaN)).toBe('00H:00M:00S');
      expect(formatEffectiveDuration(Infinity)).toBe('00H:00M:00S');
    });
  });

  describe('formatSolveDuration', () => {
    it('formats solve duration in minutes and seconds', () => {
      // 35 minutes 32 seconds = 35 * 60 + 32 = 2132
      expect(formatSolveDuration(2132)).toBe('35 m 32 sec');

      // 45 seconds
      expect(formatSolveDuration(45)).toBe('0 m 45 sec');

      // 0 seconds
      expect(formatSolveDuration(0)).toBe('0 m 0 sec');
    });

    it('formats solve duration including hours when > 1 hour', () => {
      // 1 hour 15 mins 20 secs = 3600 + 900 + 20 = 4520
      expect(formatSolveDuration(4520)).toBe('1 h 15 m 20 sec');
    });

    it('handles negative or invalid values gracefully', () => {
      expect(formatSolveDuration(-10)).toBe('0 m 0 sec');
      expect(formatSolveDuration(NaN)).toBe('0 m 0 sec');
    });
  });

  describe('getAvatarInitial', () => {
    it('returns uppercase first character of name or handle', () => {
      expect(getAvatarInitial('aryan_raj')).toBe('A');
      expect(getAvatarInitial('Bob')).toBe('B');
      expect(getAvatarInitial('1337coder')).toBe('1');
    });

    it('skips non-alphanumeric leading symbols', () => {
      expect(getAvatarInitial('__cool_coder__')).toBe('C');
      expect(getAvatarInitial('@alice')).toBe('A');
    });

    it('falls back to ? for missing or empty names', () => {
      expect(getAvatarInitial(null)).toBe('?');
      expect(getAvatarInitial('')).toBe('?');
      expect(getAvatarInitial('   ')).toBe('?');
    });
  });
});
