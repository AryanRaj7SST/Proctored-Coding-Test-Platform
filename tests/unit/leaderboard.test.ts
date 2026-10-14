import { describe, expect, it } from 'vitest';
import {
  computeLeaderboard,
  deriveDefaultHandle,
  resolveDisplayHandle,
  type ComputeLeaderboardInput,
  type LeaderboardParticipantRecord,
  type LeaderboardQuestionConfig,
} from '@/lib/leaderboard';

describe('deriveDefaultHandle & resolveDisplayHandle', () => {
  it('derives a safe handle from name and userId hash, never from email', () => {
    const handle = deriveDefaultHandle('Aryan Raj', 'user_123456');
    expect(handle).toMatch(/^aryan_raj_[a-f0-9]{6}$/);
    expect(handle).not.toContain('@');
    expect(handle).not.toContain('email');
  });

  it('uses default student base when name is missing or empty', () => {
    const handleNull = deriveDefaultHandle(null, 'user_abcdef');
    expect(handleNull).toMatch(/^student_[a-f0-9]{6}$/);

    const handleEmpty = deriveDefaultHandle('   ', 'user_abcdef');
    expect(handleEmpty).toMatch(/^student_[a-f0-9]{6}$/);
  });

  it('uses explicit displayHandle when present on user', () => {
    const resolved = resolveDisplayHandle({
      id: 'u1',
      name: 'John Doe',
      displayHandle: 'cool_coder_99',
    });
    expect(resolved).toBe('cool_coder_99');
  });

  it('falls back to deriveDefaultHandle when displayHandle is absent', () => {
    const resolved = resolveDisplayHandle({
      id: 'u1',
      name: 'John Doe',
      displayHandle: null,
    });
    expect(resolved).toMatch(/^john_doe_[a-f0-9]{6}$/);
  });
});

describe('computeLeaderboard', () => {
  const baseStart = new Date('2026-10-14T10:00:00.000Z');
  const baseEnd = new Date('2026-10-14T12:00:00.000Z');

  const questions: LeaderboardQuestionConfig[] = [
    { id: 'q1', order: 1, marks: 10, title: 'Two Sum' },
    { id: 'q2', order: 2, marks: 20, title: 'Reverse String' },
  ];

  it('handles 0 participants smoothly without error', () => {
    const res = computeLeaderboard({
      questions,
      participants: [],
      contestStartTime: baseStart,
      contestEndTime: baseEnd,
    });
    expect(res).toEqual([]);
  });

  it('calculates score and effective time for clean one-shot accepted solutions', () => {
    const participants: LeaderboardParticipantRecord[] = [
      {
        userId: 'u1',
        sessionId: 's1',
        name: 'Alice',
        displayHandle: 'alice',
        sittingStartedAt: baseStart,
        submissions: [
          // Solved Q1 at 10:10 (600s after start)
          {
            id: 'sub1',
            questionId: 'q1',
            submittedAt: new Date(baseStart.getTime() + 600 * 1000),
            score: 10,
            maxScore: 10,
            passed: true,
            kind: 'SUBMISSION',
          },
          // Solved Q2 at 10:30 (1800s after start)
          {
            id: 'sub2',
            questionId: 'q2',
            submittedAt: new Date(baseStart.getTime() + 1800 * 1000),
            score: 20,
            maxScore: 20,
            passed: true,
            kind: 'SUBMISSION',
          },
        ],
      },
    ];

    const rows = computeLeaderboard({
      questions,
      participants,
      contestStartTime: baseStart,
      contestEndTime: baseEnd,
    });

    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.rank).toBe(1);
    expect(r.score).toBe(30);
    expect(r.attemptsCount).toBe(2);
    // Effective seconds = 600 + 1800 = 2400s
    expect(r.effectiveSeconds).toBe(2400);
    expect(r.questions.q1?.state).toBe('ACCEPTED');
    expect(r.questions.q1?.tries).toBe(1);
    expect(r.questions.q1?.seconds).toBe(600);
    expect(r.questions.q2?.state).toBe('ACCEPTED');
    expect(r.questions.q2?.tries).toBe(1);
    expect(r.questions.q2?.seconds).toBe(1800);
  });

  it('applies penalty for wrong-then-accepted and ignores tries after acceptance', () => {
    const participants: LeaderboardParticipantRecord[] = [
      {
        userId: 'u1',
        sessionId: 's1',
        name: 'Bob',
        displayHandle: 'bob',
        sittingStartedAt: baseStart,
        submissions: [
          // 2 wrong tries on Q1
          {
            id: 'sub1',
            questionId: 'q1',
            submittedAt: new Date(baseStart.getTime() + 200 * 1000),
            score: 0,
            maxScore: 10,
            passed: false,
            kind: 'SUBMISSION',
          },
          {
            id: 'sub2',
            questionId: 'q1',
            submittedAt: new Date(baseStart.getTime() + 400 * 1000),
            score: 0,
            maxScore: 10,
            passed: false,
            kind: 'SUBMISSION',
          },
          // 3rd try on Q1 is accepted at 600s
          {
            id: 'sub3',
            questionId: 'q1',
            submittedAt: new Date(baseStart.getTime() + 600 * 1000),
            score: 10,
            maxScore: 10,
            passed: true,
            kind: 'SUBMISSION',
          },
          // 4th try on Q1 AFTER already accepted (should NOT add penalty or change solve time)
          {
            id: 'sub4',
            questionId: 'q1',
            submittedAt: new Date(baseStart.getTime() + 800 * 1000),
            score: 10,
            maxScore: 10,
            passed: true,
            kind: 'SUBMISSION',
          },
        ],
      },
    ];

    const rows = computeLeaderboard({
      questions,
      participants,
      contestStartTime: baseStart,
      contestEndTime: baseEnd,
      wrongTryPenaltySeconds: 300, // 5 min penalty
    });

    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.score).toBe(10);
    expect(r.attemptsCount).toBe(4);
    // Effective time = solveTime (600s) + 2 wrong tries * 300s = 600 + 600 = 1200s
    expect(r.effectiveSeconds).toBe(1200);
    expect(r.questions.q1?.state).toBe('ACCEPTED');
    expect(r.questions.q1?.tries).toBe(3); // count up to acceptance
    expect(r.questions.q1?.seconds).toBe(600);
    expect(r.questions.q2?.state).toBe('NOT_ATTEMPTED');
  });

  it('does NOT add penalties or time for never accepted questions', () => {
    const participants: LeaderboardParticipantRecord[] = [
      {
        userId: 'u1',
        sessionId: 's1',
        name: 'Charlie',
        displayHandle: 'charlie',
        sittingStartedAt: baseStart,
        submissions: [
          // 5 wrong tries on Q1
          {
            id: 'sub1',
            questionId: 'q1',
            submittedAt: new Date(baseStart.getTime() + 100 * 1000),
            score: 0,
            maxScore: 10,
            passed: false,
            kind: 'SUBMISSION',
          },
          {
            id: 'sub2',
            questionId: 'q1',
            submittedAt: new Date(baseStart.getTime() + 300 * 1000),
            score: 0,
            maxScore: 10,
            passed: false,
            kind: 'SUBMISSION',
          },
        ],
      },
    ];

    const rows = computeLeaderboard({
      questions,
      participants,
      contestStartTime: baseStart,
      contestEndTime: baseEnd,
      wrongTryPenaltySeconds: 300,
    });

    const r = rows[0]!;
    expect(r.score).toBe(0);
    expect(r.attemptsCount).toBe(2);
    expect(r.effectiveSeconds).toBe(0); // Never accepted -> 0 effective penalty
    expect(r.questions.q1?.state).toBe('WRONG');
    expect(r.questions.q1?.tries).toBe(2);
    expect(r.questions.q1?.seconds).toBe(0);
  });

  it('handles ties: participants share a rank ONLY if score AND effective time are equal', () => {
    const participants: LeaderboardParticipantRecord[] = [
      {
        userId: 'u1',
        sessionId: 's1',
        displayHandle: 'user_a',
        sittingStartedAt: baseStart,
        submissions: [
          {
            id: 'sub1',
            questionId: 'q1',
            submittedAt: new Date(baseStart.getTime() + 600 * 1000),
            score: 10,
            maxScore: 10,
            passed: true,
            kind: 'SUBMISSION',
          },
        ],
      },
      {
        userId: 'u2',
        sessionId: 's2',
        displayHandle: 'user_b',
        sittingStartedAt: baseStart,
        submissions: [
          {
            id: 'sub2',
            questionId: 'q1',
            submittedAt: new Date(baseStart.getTime() + 600 * 1000),
            score: 10,
            maxScore: 10,
            passed: true,
            kind: 'SUBMISSION',
          },
        ],
      },
      {
        userId: 'u3',
        sessionId: 's3',
        displayHandle: 'user_c',
        sittingStartedAt: baseStart,
        submissions: [
          {
            id: 'sub3',
            questionId: 'q1',
            submittedAt: new Date(baseStart.getTime() + 900 * 1000), // higher effective time
            score: 10,
            maxScore: 10,
            passed: true,
            kind: 'SUBMISSION',
          },
        ],
      },
      {
        userId: 'u4',
        sessionId: 's4',
        displayHandle: 'user_d',
        sittingStartedAt: baseStart,
        submissions: [], // score 0
      },
    ];

    const rows = computeLeaderboard({
      questions,
      participants,
      contestStartTime: baseStart,
      contestEndTime: baseEnd,
    });

    expect(rows).toHaveLength(4);
    // user_a and user_b tied on score (10) and effectiveSeconds (600) -> both rank 1
    expect(rows[0]!.handle).toBe('user_a');
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.handle).toBe('user_b');
    expect(rows[1]!.rank).toBe(1);

    // user_c has score 10 but effectiveSeconds 900 -> rank 3 (skips rank 2 due to 2 ties at rank 1)
    expect(rows[2]!.handle).toBe('user_c');
    expect(rows[2]!.rank).toBe(3);

    // user_d has score 0 -> rank 4
    expect(rows[3]!.handle).toBe('user_d');
    expect(rows[3]!.rank).toBe(4);
  });

  it('marks question as PLAGIARIZED when flagged by admin and awards 0 points', () => {
    const participants: LeaderboardParticipantRecord[] = [
      {
        userId: 'u1',
        sessionId: 's1',
        displayHandle: 'cheater',
        sittingStartedAt: baseStart,
        submissions: [
          {
            id: 'sub1',
            questionId: 'q1',
            submittedAt: new Date(baseStart.getTime() + 300 * 1000),
            score: 10,
            maxScore: 10,
            passed: true,
            kind: 'SUBMISSION',
          },
        ],
        flags: [{ questionId: 'q1', kind: 'PLAGIARISM' }],
      },
    ];

    const rows = computeLeaderboard({
      questions,
      participants,
      contestStartTime: baseStart,
      contestEndTime: baseEnd,
    });

    const r = rows[0]!;
    expect(r.questions.q1?.state).toBe('PLAGIARIZED');
    expect(r.questions.q1?.score).toBe(0);
    expect(r.score).toBe(0);
    expect(r.effectiveSeconds).toBe(0);
  });

  it('completely ignores practice runs and validation runs', () => {
    const participants: LeaderboardParticipantRecord[] = [
      {
        userId: 'u1',
        sessionId: 's1',
        displayHandle: 'practice_user',
        sittingStartedAt: baseStart,
        submissions: [
          {
            id: 'prac1',
            questionId: 'q1',
            submittedAt: new Date(baseStart.getTime() + 200 * 1000),
            score: 10,
            maxScore: 10,
            passed: true,
            kind: 'PRACTICE', // Ignored!
          },
          {
            id: 'val1',
            questionId: 'q1',
            submittedAt: new Date(baseStart.getTime() + 250 * 1000),
            score: 10,
            maxScore: 10,
            passed: true,
            kind: 'VALIDATION', // Ignored!
          },
        ],
      },
    ];

    const rows = computeLeaderboard({
      questions,
      participants,
      contestStartTime: baseStart,
      contestEndTime: baseEnd,
    });

    const r = rows[0]!;
    expect(r.score).toBe(0);
    expect(r.attemptsCount).toBe(0);
    expect(r.questions.q1?.state).toBe('NOT_ATTEMPTED');
  });

  it('ignores late submissions after contest end or freeze cutoff', () => {
    const participants: LeaderboardParticipantRecord[] = [
      {
        userId: 'u1',
        sessionId: 's1',
        displayHandle: 'late_user',
        sittingStartedAt: baseStart,
        submissions: [
          // Solved after contest end (baseEnd is 12:00, submission is at 12:05)
          {
            id: 'sub_late',
            questionId: 'q1',
            submittedAt: new Date(baseEnd.getTime() + 300 * 1000),
            score: 10,
            maxScore: 10,
            passed: true,
            kind: 'SUBMISSION',
          },
        ],
      },
    ];

    const rows = computeLeaderboard({
      questions,
      participants,
      contestStartTime: baseStart,
      contestEndTime: baseEnd,
    });

    const r = rows[0]!;
    expect(r.score).toBe(0);
    expect(r.attemptsCount).toBe(0);
    expect(r.questions.q1?.state).toBe('NOT_ATTEMPTED');
  });

  it('orders deterministically by displayHandle on exact multi-way ties', () => {
    const participants: LeaderboardParticipantRecord[] = [
      {
        userId: 'u_zebra',
        sessionId: 's_z',
        displayHandle: 'zebra',
        sittingStartedAt: baseStart,
        submissions: [],
      },
      {
        userId: 'u_alpha',
        sessionId: 's_a',
        displayHandle: 'alpha',
        sittingStartedAt: baseStart,
        submissions: [],
      },
      {
        userId: 'u_beta',
        sessionId: 's_b',
        displayHandle: 'beta',
        sittingStartedAt: baseStart,
        submissions: [],
      },
    ];

    const rows = computeLeaderboard({
      questions,
      participants,
      contestStartTime: baseStart,
      contestEndTime: baseEnd,
    });

    expect(rows.map((r) => r.handle)).toEqual(['alpha', 'beta', 'zebra']);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 1]); // All tied at 0
  });
});
