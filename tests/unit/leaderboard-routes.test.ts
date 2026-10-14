import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Route tests for student-facing Leaderboard APIs:
 *  - GET /api/exams/[id]/leaderboard
 *  - GET /api/exams/[id]/me/rank
 *
 * Verifies:
 *  1. Unauthorized (401) when user is not signed in
 *  2. No access (404) when student lacks access to the exam
 *  3. Hidden mode (403) when exam leaderboardMode is HIDDEN
 *  4. Before-end in AFTER_END mode (403)
 *  5. Allowed in AFTER_END mode once exam has ended
 *  6. LIVE mode works while contest is running
 *  7. Pagination and search filter `q`
 *  8. Privacy enforcement: Deeply assert JSON response does not leak email, userId,
 *     code, test names, inputs, or expected outputs.
 *  9. GET /api/exams/[id]/me/rank returns { rank, score, maxScore }
 */

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock('@/lib/auth', () => ({ auth: async () => session.current }));

const mockExamData = vi.hoisted(() => ({
  exam: null as any,
  assignment: null as any,
  questions: [] as any[],
  sessions: [] as any[],
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    exam: {
      findUnique: vi.fn(async () => mockExamData.exam),
    },
    examAssignment: {
      findUnique: vi.fn(async () => mockExamData.assignment),
    },
    examQuestion: {
      findMany: vi.fn(async () => mockExamData.questions),
    },
    examSession: {
      findMany: vi.fn(async () => mockExamData.sessions),
    },
  },
}));

import { invalidateLeaderboardCache } from '@/server/services/leaderboard';
import { GET as getLeaderboard } from '@/app/api/exams/[id]/leaderboard/route';
import { GET as getRank } from '@/app/api/exams/[id]/me/rank/route';

const studentUser = {
  id: 'u-student-1',
  email: 'student1@scaler.com',
  name: 'Aryan Student',
  role: 'STUDENT',
  batch: '2026',
};

const adminUser = {
  id: 'u-admin-1',
  email: 'admin@scaler.com',
  name: 'Super Admin',
  role: 'ADMIN',
  batch: null,
};

const examId = 'exam-contest-101';
const ctx = (id = examId) => ({ params: Promise.resolve({ id }) });

const req = (url: string) => new Request(url, { method: 'GET' });

describe('Student Leaderboard APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateLeaderboardCache();
    session.current = { user: studentUser };

    // Standard live exam
    mockExamData.exam = {
      id: examId,
      title: 'DSA Contest 1',
      status: 'PUBLISHED',
      active: true,
      accessMode: 'ANY_AUTHENTICATED_USER',
      startTime: new Date(Date.now() - 3600_000), // started 1h ago
      endTime: new Date(Date.now() + 3600_000), // ends in 1h
      leaderboardMode: 'LIVE',
      wrongTryPenaltySeconds: 300,
      leaderboardFrozenAt: null,
    };

    mockExamData.assignment = null;

    mockExamData.questions = [
      {
        questionId: 'q1',
        order: 1,
        marks: 100,
        question: { title: 'Two Sum' },
      },
      {
        questionId: 'q2',
        order: 2,
        marks: 100,
        question: { title: 'Reverse Linked List' },
      },
    ];

    mockExamData.sessions = [
      {
        id: 'sess-1',
        userId: 'u-student-1',
        startedAt: new Date(Date.now() - 3000_000),
        endedAt: null,
        attemptNumber: 1,
        user: {
          id: 'u-student-1',
          name: 'Aryan Student',
          displayHandle: 'aryan_101',
        },
        attempts: [
          {
            id: 'att-1',
            questionId: 'q1',
            score: 100,
            maxScore: 100,
            status: 'SUBMITTED',
            submittedAt: new Date(Date.now() - 2000_000),
            attemptFlags: [],
            testRuns: [
              {
                id: 'tr-1',
                questionId: 'q1',
                startedAt: new Date(Date.now() - 2000_000),
                completedAt: new Date(Date.now() - 1990_000),
                score: 100,
                maxScore: 100,
                status: 'PASSED',
              },
            ],
          },
        ],
      },
      {
        id: 'sess-2',
        userId: 'u-student-2',
        startedAt: new Date(Date.now() - 2500_000),
        endedAt: null,
        attemptNumber: 1,
        user: {
          id: 'u-student-2',
          name: 'Bob Coder',
          displayHandle: 'bob_the_builder',
        },
        attempts: [
          {
            id: 'att-2',
            questionId: 'q1',
            score: 50,
            maxScore: 100,
            status: 'SUBMITTED',
            submittedAt: new Date(Date.now() - 1500_000),
            attemptFlags: [],
            testRuns: [
              {
                id: 'tr-2',
                questionId: 'q1',
                startedAt: new Date(Date.now() - 1500_000),
                completedAt: new Date(Date.now() - 1490_000),
                score: 50,
                maxScore: 100,
                status: 'FAILED',
              },
            ],
          },
        ],
      },
    ];
  });

  describe('Authorization and Access Control', () => {
    it('returns 401 when unauthenticated', async () => {
      session.current = null;
      const res = await getLeaderboard(req(`http://localhost/api/exams/${examId}/leaderboard`), ctx());
      expect(res.status).toBe(401);
    });

    it('returns 404 when student has no access to the test', async () => {
      // e.g. exam requires assignment and student is not assigned
      mockExamData.exam.accessMode = 'INVITED_ONLY';
      mockExamData.assignment = null;

      const res = await getLeaderboard(req(`http://localhost/api/exams/${examId}/leaderboard`), ctx());
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe('NOT_FOUND');
    });

    it('returns 404 when access was revoked', async () => {
      mockExamData.assignment = { revokedAt: new Date() };

      const res = await getLeaderboard(req(`http://localhost/api/exams/${examId}/leaderboard`), ctx());
      expect(res.status).toBe(404);
    });
  });

  describe('Leaderboard Visibility Modes', () => {
    it('returns 403 when leaderboardMode is HIDDEN for students', async () => {
      mockExamData.exam.leaderboardMode = 'HIDDEN';

      const res = await getLeaderboard(req(`http://localhost/api/exams/${examId}/leaderboard`), ctx());
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toContain('hidden');
    });

    it('allows admin to view HIDDEN leaderboard', async () => {
      session.current = { user: adminUser };
      mockExamData.exam.leaderboardMode = 'HIDDEN';

      const res = await getLeaderboard(req(`http://localhost/api/exams/${examId}/leaderboard`), ctx());
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.mode).toBe('HIDDEN');
    });

    it('returns 403 when leaderboardMode is AFTER_END and contest is still running', async () => {
      mockExamData.exam.leaderboardMode = 'AFTER_END';
      mockExamData.exam.endTime = new Date(Date.now() + 100_000); // in future
      mockExamData.exam.status = 'PUBLISHED';

      const res = await getLeaderboard(req(`http://localhost/api/exams/${examId}/leaderboard`), ctx());
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toContain('available after the contest ends');
    });

    it('allows student to view AFTER_END leaderboard once contest window has ended', async () => {
      mockExamData.exam.leaderboardMode = 'AFTER_END';
      mockExamData.exam.endTime = new Date(Date.now() - 10_000); // ended 10s ago

      const res = await getLeaderboard(req(`http://localhost/api/exams/${examId}/leaderboard`), ctx());
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.mode).toBe('AFTER_END');
      expect(data.rows.length).toBeGreaterThan(0);
    });

    it('allows student to view LIVE leaderboard during contest', async () => {
      mockExamData.exam.leaderboardMode = 'LIVE';

      const res = await getLeaderboard(req(`http://localhost/api/exams/${examId}/leaderboard`), ctx());
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.mode).toBe('LIVE');
      expect(data.rows).toHaveLength(2);
      expect(data.myRow).not.toBeNull();
      expect(data.myRow?.handle).toBe('aryan_101');
    });
  });

  describe('Search and Pagination', () => {
    it('filters rows by handle search query q', async () => {
      const res = await getLeaderboard(req(`http://localhost/api/exams/${examId}/leaderboard?q=bob`), ctx());
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.total).toBe(1);
      expect(data.rows).toHaveLength(1);
      expect(data.rows[0].handle).toBe('bob_the_builder');
    });

    it('supports pagination with page param', async () => {
      const res = await getLeaderboard(req(`http://localhost/api/exams/${examId}/leaderboard?page=1`), ctx());
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.total).toBe(2);
      expect(data.rows.length).toBe(2);
    });
  });

  describe('Privacy & Leak Prevention Verification', () => {
    it('strictly does not leak emails, user IDs, session IDs, code, or test details in response JSON', async () => {
      const res = await getLeaderboard(req(`http://localhost/api/exams/${examId}/leaderboard`), ctx());
      expect(res.status).toBe(200);
      const body = await res.json();

      // Convert entire JSON payload to string to perform broad leak checks
      const jsonStr = JSON.stringify(body);

      // Forbidden strings
      expect(jsonStr).not.toContain('student1@scaler.com');
      expect(jsonStr).not.toContain('u-student-1');
      expect(jsonStr).not.toContain('u-student-2');
      expect(jsonStr).not.toContain('sess-1');
      expect(jsonStr).not.toContain('sess-2');
      expect(jsonStr).not.toContain('att-1');
      expect(jsonStr).not.toContain('tr-1');

      // Verify that every row contains only permitted keys
      const permittedRowKeys = new Set([
        'rank',
        'handle',
        'score',
        'attemptsCount',
        'effectiveSeconds',
        'questions',
      ]);

      const permittedCellKeys = new Set(['state', 'tries', 'seconds', 'score']);

      for (const row of body.rows) {
        for (const key of Object.keys(row)) {
          expect(permittedRowKeys.has(key)).toBe(true);
        }
        expect(row).not.toHaveProperty('userId');
        expect(row).not.toHaveProperty('email');
        expect(row).not.toHaveProperty('sessionId');
        expect(row).not.toHaveProperty('code');

        for (const cell of Object.values(row.questions) as any[]) {
          for (const cellKey of Object.keys(cell)) {
            expect(permittedCellKeys.has(cellKey)).toBe(true);
          }
          expect(cell).not.toHaveProperty('testName');
          expect(cell).not.toHaveProperty('input');
          expect(cell).not.toHaveProperty('expectedOutput');
        }
      }

      // Check myRow as well
      if (body.myRow) {
        for (const key of Object.keys(body.myRow)) {
          expect(permittedRowKeys.has(key)).toBe(true);
        }
        expect(body.myRow).not.toHaveProperty('userId');
        expect(body.myRow).not.toHaveProperty('email');
      }

      // Check questions metadata contains only n and title
      for (const q of body.questions) {
        expect(Object.keys(q).sort()).toEqual(['n', 'title'].sort());
        expect(q).not.toHaveProperty('tests');
        expect(q).not.toHaveProperty('expectedOutput');
      }
    });
  });

  describe('Header Rank Widget (/me/rank)', () => {
    it('returns rank, score, maxScore for student', async () => {
      const res = await getRank(req(`http://localhost/api/exams/${examId}/me/rank`), ctx());
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        rank: 1,
        score: 100,
        maxScore: 200,
      });
    });

    it('returns rank null and score 0 if student has not participated', async () => {
      session.current = {
        user: {
          id: 'u-unparticipated',
          email: 'new@scaler.com',
          name: 'New Student',
          role: 'STUDENT',
          batch: '2026',
        },
      };

      const res = await getRank(req(`http://localhost/api/exams/${examId}/me/rank`), ctx());
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        rank: null,
        score: 0,
        maxScore: 200,
      });
    });

    it('enforces leaderboardMode on /me/rank as well', async () => {
      mockExamData.exam.leaderboardMode = 'HIDDEN';

      const res = await getRank(req(`http://localhost/api/exams/${examId}/me/rank`), ctx());
      expect(res.status).toBe(403);
    });
  });
});
