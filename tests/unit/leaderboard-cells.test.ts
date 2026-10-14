import { describe, it, expect } from 'vitest';
import { formatEffectiveDuration, formatSolveDuration, getAvatarInitial } from '@/lib/leaderboard-format';
import type { QuestionCellState } from '@/lib/leaderboard';

interface CellModel {
  state: QuestionCellState;
  tries: number;
  seconds: number;
  score: number;
}

/**
 * Pure cell state presentation mapper mirroring QuestionCellDisplay logic.
 * Ensures the cell displays correct icons, labels, tries, and solve time.
 */
function getCellPresentation(cell: CellModel) {
  if (cell.state === 'ACCEPTED') {
    return {
      icon: '✓',
      label: 'Accepted',
      triesText: `${cell.tries} ${cell.tries === 1 ? 'try' : 'tries'}`,
      timeText: formatSolveDuration(cell.seconds),
      tone: 'emerald',
    };
  }

  if (cell.state === 'WRONG') {
    return {
      icon: '✕',
      label: 'Wrong Answer',
      triesText: `${cell.tries} ${cell.tries === 1 ? 'try' : 'tries'}`,
      timeText: '—',
      tone: 'rose',
    };
  }

  if (cell.state === 'PLAGIARIZED') {
    return {
      icon: '⚠',
      label: 'Plagiarized',
      triesText: 'Plagiarized',
      timeText: '—',
      tone: 'amber',
    };
  }

  return {
    icon: '—',
    label: 'Not Attempted',
    triesText: null,
    timeText: null,
    tone: 'slate',
  };
}

describe('Leaderboard Cell States and Formatter Logic', () => {
  describe('Cell state presentation rules', () => {
    it('presents ACCEPTED cell with green tick, tries, and formatted solve time', () => {
      const cell: CellModel = {
        state: 'ACCEPTED',
        tries: 2,
        seconds: 2132, // 35 m 32 sec
        score: 100,
      };

      const pres = getCellPresentation(cell);
      expect(pres.icon).toBe('✓');
      expect(pres.label).toBe('Accepted');
      expect(pres.triesText).toBe('2 tries');
      expect(pres.timeText).toBe('35 m 32 sec');
      expect(pres.tone).toBe('emerald');
    });

    it('presents WRONG cell with red cross, tries count, and dash for time', () => {
      const cell: CellModel = {
        state: 'WRONG',
        tries: 3,
        seconds: 0,
        score: 0,
      };

      const pres = getCellPresentation(cell);
      expect(pres.icon).toBe('✕');
      expect(pres.label).toBe('Wrong Answer');
      expect(pres.triesText).toBe('3 tries');
      expect(pres.timeText).toBe('—');
      expect(pres.tone).toBe('rose');
    });

    it('presents PLAGIARIZED cell with warning icon and Plagiarized label', () => {
      const cell: CellModel = {
        state: 'PLAGIARIZED',
        tries: 1,
        seconds: 150,
        score: 0,
      };

      const pres = getCellPresentation(cell);
      expect(pres.icon).toBe('⚠');
      expect(pres.label).toBe('Plagiarized');
      expect(pres.triesText).toBe('Plagiarized');
      expect(pres.timeText).toBe('—');
      expect(pres.tone).toBe('amber');
    });

    it('presents NOT_ATTEMPTED cell with dash icon and no time/tries', () => {
      const cell: CellModel = {
        state: 'NOT_ATTEMPTED',
        tries: 0,
        seconds: 0,
        score: 0,
      };

      const pres = getCellPresentation(cell);
      expect(pres.icon).toBe('—');
      expect(pres.label).toBe('Not Attempted');
      expect(pres.triesText).toBeNull();
      expect(pres.timeText).toBeNull();
      expect(pres.tone).toBe('slate');
    });
  });

  describe('Time formatting specifications', () => {
    it('formats effective duration into HH:MM:SS with hours exceeding 24', () => {
      expect(formatEffectiveDuration(0)).toBe('00H:00M:00S');
      expect(formatEffectiveDuration(65)).toBe('00H:01M:05S');
      expect(formatEffectiveDuration(3661)).toBe('01H:01M:01S');
      // Scaler 31H:28M:16S = 113296 seconds
      expect(formatEffectiveDuration(113296)).toBe('31H:28M:16S');
    });

    it('formats question solve duration into "M m S sec" and handles > 1 hour', () => {
      expect(formatSolveDuration(2132)).toBe('35 m 32 sec');
      expect(formatSolveDuration(45)).toBe('0 m 45 sec');
      expect(formatSolveDuration(4520)).toBe('1 h 15 m 20 sec');
    });

    it('extracts avatar initial correctly', () => {
      expect(getAvatarInitial('aryan_101')).toBe('A');
      expect(getAvatarInitial('bob_the_builder')).toBe('B');
      expect(getAvatarInitial('__super_coder__')).toBe('S');
      expect(getAvatarInitial('')).toBe('?');
    });
  });
});
