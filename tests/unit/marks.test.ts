import { describe, it, expect } from 'vitest';
import {
  formatMarks,
  fromMicro,
  isPassing,
  percentageOf,
  questionScore,
  questionStatus,
  testCaseShare,
  toMicro,
  totalOf,
} from '@/server/grading/marks';

describe('toMicro / fromMicro', () => {
  it('parses marks exactly, without floating point drift', () => {
    expect(toMicro('7')).toBe(70_000);
    expect(toMicro('2.3333')).toBe(23_333);
    expect(toMicro(0.1 + 0.2)).toBe(3_000);
    expect(toMicro('10.00')).toBe(100_000);
    expect(toMicro({ toFixed: (d: number) => (12.5).toFixed(d) })).toBe(125_000);
  });

  it('renders 4 decimal places', () => {
    expect(fromMicro(23_333)).toBe('2.3333');
    expect(fromMicro(70_000)).toBe('7.0000');
    expect(fromMicro(0)).toBe('0.0000');
  });

  it('rejects negative and non-numeric marks', () => {
    expect(() => toMicro('-1')).toThrow();
    expect(() => toMicro('abc')).toThrow();
  });
});

describe('questionScore: marks x passed / enabled', () => {
  it.each([
    [5, 10],
    [4, 8],
    [3, 6],
    [2, 4],
    [1, 2],
    [0, 0],
  ])('10 marks, 5 tests, %i passed -> %i', (passed, expected) => {
    expect(questionScore(toMicro(10), passed, 5)).toBe(toMicro(expected));
  });

  it('7 marks over 3 tests rounds once per question, half up', () => {
    expect(fromMicro(questionScore(toMicro(7), 0, 3))).toBe('0.0000');
    expect(fromMicro(questionScore(toMicro(7), 1, 3))).toBe('2.3333');
    expect(fromMicro(questionScore(toMicro(7), 2, 3))).toBe('4.6667');
    expect(fromMicro(questionScore(toMicro(7), 3, 3))).toBe('7.0000');
  });

  it('a full pass always earns exactly the question marks', () => {
    for (const marks of ['1', '7', '9.99', '12.5', '100']) {
      for (let tests = 1; tests <= 40; tests += 1) {
        expect(questionScore(toMicro(marks), tests, tests)).toBe(toMicro(marks));
      }
    }
  });

  it('is monotonic and never exceeds the marks', () => {
    for (let passed = 0; passed < 7; passed += 1) {
      expect(questionScore(toMicro(10), passed + 1, 7)).toBeGreaterThan(
        questionScore(toMicro(10), passed, 7),
      );
    }
    expect(questionScore(toMicro(10), 7, 7)).toBe(toMicro(10));
  });

  it('scores 0 when no test case is enabled (such a question cannot be published)', () => {
    expect(questionScore(toMicro(10), 0, 0)).toBe(0);
  });

  it('rejects impossible counts', () => {
    expect(() => questionScore(toMicro(10), 6, 5)).toThrow();
    expect(() => questionScore(toMicro(10), -1, 5)).toThrow();
    expect(() => questionScore(toMicro(10), 1.5, 5)).toThrow();
  });

  it('is deterministic', () => {
    const runs = Array.from({ length: 50 }, () => questionScore(toMicro('9.99'), 5, 7));
    expect(new Set(runs).size).toBe(1);
  });
});

describe('testCaseShare (display only)', () => {
  it('shows the equal share of the marks per test case', () => {
    expect(fromMicro(testCaseShare(toMicro(10), 5))).toBe('2.0000');
    expect(fromMicro(testCaseShare(toMicro(7), 3))).toBe('2.3333');
    expect(testCaseShare(toMicro(7), 0)).toBe(0);
  });
});

describe('questionStatus', () => {
  it('is PASSED only when every enabled test passes', () => {
    expect(questionStatus(5, 5)).toBe('PASSED');
    expect(questionStatus(4, 5)).toBe('PARTIAL');
    expect(questionStatus(1, 5)).toBe('PARTIAL');
    expect(questionStatus(0, 5)).toBe('FAILED');
  });

  it('never calls a question with no enabled tests PASSED', () => {
    expect(questionStatus(0, 0)).toBe('FAILED');
  });
});

describe('test totals', () => {
  it('sums question scores exactly', () => {
    const scores = [
      questionScore(toMicro(7), 1, 3),
      questionScore(toMicro(7), 2, 3),
      questionScore(toMicro(7), 3, 3),
    ];
    expect(fromMicro(totalOf(scores))).toBe('14.0000');
  });

  it('computes a percentage to 4 decimal places', () => {
    expect(percentageOf(toMicro(82), toMicro(100))).toBe('82.0000');
    expect(percentageOf(toMicro(13), toMicro(17))).toBe('76.4706');
    expect(percentageOf(0, 0)).toBe('0.0000');
  });

  it('decides pass/fail exactly at the threshold', () => {
    expect(isPassing(toMicro(40), toMicro(100), '40')).toBe(true);
    expect(isPassing(toMicro(39), toMicro(100), '40')).toBe(false);
    expect(isPassing(toMicro('39.9999'), toMicro(100), '40')).toBe(false);
    // 2/3 of 3 marks is exactly 66.67%? No: 66.666...% -- below a 66.67 pass mark.
    expect(isPassing(toMicro(2), toMicro(3), '66.67')).toBe(false);
    expect(isPassing(toMicro(2), toMicro(3), '66.66')).toBe(true);
    expect(isPassing(0, 0, '40')).toBe(false);
  });
});

describe('formatMarks', () => {
  it('drops trailing zeros for display', () => {
    expect(formatMarks(toMicro(10))).toBe('10');
    expect(formatMarks(toMicro('2.3333'))).toBe('2.3333');
    expect(formatMarks(toMicro('2.5'))).toBe('2.5');
  });
});
