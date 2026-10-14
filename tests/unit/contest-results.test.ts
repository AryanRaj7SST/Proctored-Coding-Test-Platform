import { describe, it, expect } from 'vitest';
import {
  rankContestStandings,
  contestResultsToCsv,
  type ContestCandidate,
} from '@/server/services/integrity/contest-ranking';

describe('Contest Results Ranking and CSV Export', () => {
  it('ranks students primarily by score descending', () => {
    const candidates: ContestCandidate[] = [
      {
        userId: 'u1',
        sessionId: 's1',
        studentName: 'Alice',
        studentEmail: 'alice@test.com',
        batch: '2026',
        score: 80,
        maxScore: 100,
        percentage: 80,
        solvedCount: 2,
        totalQuestions: 2,
        lastAcceptedSubmissionAt: new Date('2026-10-14T10:30:00Z'),
        violationCount: 0,
        state: 'PASSED',
      },
      {
        userId: 'u2',
        sessionId: 's2',
        studentName: 'Bob',
        studentEmail: 'bob@test.com',
        batch: '2026',
        score: 100,
        maxScore: 100,
        percentage: 100,
        solvedCount: 2,
        totalQuestions: 2,
        lastAcceptedSubmissionAt: new Date('2026-10-14T10:45:00Z'),
        violationCount: 1,
        state: 'PASSED',
      },
    ];

    const ranked = rankContestStandings(candidates);
    expect(ranked[0]?.studentName).toBe('Bob');
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[1]?.studentName).toBe('Alice');
    expect(ranked[1]?.rank).toBe(2);
  });

  it('breaks ties using earliest last-accepted-submission time', () => {
    const candidates: ContestCandidate[] = [
      {
        userId: 'u1',
        sessionId: 's1',
        studentName: 'Late Finisher',
        studentEmail: 'late@test.com',
        batch: '2026',
        score: 100,
        maxScore: 100,
        percentage: 100,
        solvedCount: 2,
        totalQuestions: 2,
        lastAcceptedSubmissionAt: new Date('2026-10-14T10:45:00Z'),
        violationCount: 0,
        state: 'PASSED',
      },
      {
        userId: 'u2',
        sessionId: 's2',
        studentName: 'Early Finisher',
        studentEmail: 'early@test.com',
        batch: '2026',
        score: 100,
        maxScore: 100,
        percentage: 100,
        solvedCount: 2,
        totalQuestions: 2,
        lastAcceptedSubmissionAt: new Date('2026-10-14T10:20:00Z'),
        violationCount: 0,
        state: 'PASSED',
      },
    ];

    const ranked = rankContestStandings(candidates);
    // Early Finisher reached score 100 at 10:20, Late Finisher reached 100 at 10:45:
    expect(ranked[0]?.studentName).toBe('Early Finisher');
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[1]?.studentName).toBe('Late Finisher');
    expect(ranked[1]?.rank).toBe(2);
  });

  it('exports standings to CSV with formula-injection escaping', () => {
    const ranked = rankContestStandings([
      {
        userId: 'u1',
        sessionId: 's1',
        studentName: '=cmd|/c calc', // formula injection attempt
        studentEmail: '+injection@test.com',
        batch: '-2026',
        score: 50,
        maxScore: 100,
        percentage: 50,
        solvedCount: 1,
        totalQuestions: 2,
        lastAcceptedSubmissionAt: new Date('2026-10-14T10:15:00Z'),
        violationCount: 0,
        state: 'PASSED',
      },
    ]);

    const csv = contestResultsToCsv(ranked);
    expect(csv).toContain('rank,student_name,student_email');
    // Notice formula injection prefixes (=, +, -) are safely escaped with single quote '
    expect(csv).toContain("1,'=cmd|/c calc");
    expect(csv).toContain("'+injection@test.com");
    expect(csv).toContain("'-2026");
  });
});
