import { describe, it, expect } from 'vitest';
import { toMicro, fromMicro } from '@/server/grading/marks';
import { gradeQuestion } from '@/server/grading/evaluate';
import type { TestVerdict } from '@/server/grading/runner-result';

describe('regrade with all-time highest marks policy', () => {
  const tests = [
    { id: 't1', name: 'Test 1' },
    { id: 't2', name: 'Test 2' },
    { id: 't3', name: 'Test 3' },
  ];

  it('selects the submission candidate that yields the highest score', () => {
    // Candidate 1: passes t1, t2 (6.6667 / 10)
    // Candidate 2: passes t1 only (3.3333 / 10)
    // Candidate 3: passes t1, t2, t3 (10.0000 / 10)
    const candidates = [
      new Map<string, TestVerdict>([
        ['t1', { passed: true, durationMs: 10 }],
        ['t2', { passed: true, durationMs: 15 }],
        ['t3', { passed: false, durationMs: 20 }],
      ]),
      new Map<string, TestVerdict>([
        ['t1', { passed: true, durationMs: 5 }],
        ['t2', { passed: false, durationMs: 12 }],
        ['t3', { passed: false, durationMs: 8 }],
      ]),
      new Map<string, TestVerdict>([
        ['t1', { passed: true, durationMs: 10 }],
        ['t2', { passed: true, durationMs: 12 }],
        ['t3', { passed: true, durationMs: 14 }],
      ]),
    ];

    let bestScoreMicro = -1;
    let bestIndex = -1;

    candidates.forEach((cand, index) => {
      const grade = gradeQuestion(toMicro(10), tests, cand);
      if (grade.scoreMicro > bestScoreMicro) {
        bestScoreMicro = grade.scoreMicro;
        bestIndex = index;
      }
    });

    expect(bestIndex).toBe(2);
    expect(fromMicro(bestScoreMicro)).toBe('10.0000');
  });

  it('preserves historical high score even if student later submitted broken code', () => {
    // Earlier historical submission passed all tests
    const historicalVerdict = new Map<string, TestVerdict>([
      ['t1', { passed: true, durationMs: 10 }],
      ['t2', { passed: true, durationMs: 10 }],
      ['t3', { passed: true, durationMs: 10 }],
    ]);

    // Later current attempt code failed all tests
    const latestVerdict = new Map<string, TestVerdict>([
      ['t1', { passed: false, durationMs: 5 }],
      ['t2', { passed: false, durationMs: 5 }],
      ['t3', { passed: false, durationMs: 5 }],
    ]);

    const candidates = [latestVerdict, historicalVerdict];

    let bestScoreMicro = -1;
    let winningCandidate = candidates[0];

    for (const cand of candidates) {
      const grade = gradeQuestion(toMicro(10), tests, cand);
      if (grade.scoreMicro > bestScoreMicro) {
        bestScoreMicro = grade.scoreMicro;
        winningCandidate = cand;
      }
    }

    expect(winningCandidate).toBe(historicalVerdict);
    expect(fromMicro(bestScoreMicro)).toBe('10.0000');
  });
});
