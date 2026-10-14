import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock('@/lib/auth', () => ({ auth: async () => session.current }));

const mockDb = vi.hoisted(() => ({
  auditLogs: [] as any[],
  exam: null as any,
  questions: [] as any[],
  sessions: [] as any[],
  attempts: [] as any[],
  flags: [] as any[],
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => {
      if (typeof arg === 'function') {
        return arg({
          exam: {
            update: vi.fn(async ({ where, data }: any) => {
              if (mockDb.exam && mockDb.exam.id === where.id) {
                mockDb.exam = { ...mockDb.exam, ...data };
              }
              return mockDb.exam;
            }),
          },
          examQuestion: {
            deleteMany: vi.fn(async () => ({ count: 0 })),
            findMany: vi.fn(async () => mockDb.questions),
            update: vi.fn(),
            create: vi.fn(),
          },
        });
      }
      return Promise.all(arg);
    }),
    exam: {
      findUnique: vi.fn(async () => mockDb.exam),
      update: vi.fn(async ({ where, data }: any) => {
        if (mockDb.exam && mockDb.exam.id === where.id) {
          mockDb.exam = { ...mockDb.exam, ...data };
        }
        return mockDb.exam;
      }),
    },
    examAssignment: {
      findUnique: vi.fn(async () => ({ id: 'asgn-1', revokedAt: null })),
    },
    examQuestion: {
      findMany: vi.fn(async () => mockDb.questions),
    },
    examSession: {
      findMany: vi.fn(async () => mockDb.sessions),
      findFirst: vi.fn(async ({ where }: any) => {
        return mockDb.sessions.find((s: any) => s.id === where.id) ?? null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const s = mockDb.sessions.find((sess: any) => sess.id === where.id);
        if (s) {
          Object.assign(s, data);
        }
        return s;
      }),
    },
    attempt: {
      findFirst: vi.fn(async ({ where }: any) => {
        return mockDb.attempts.find((a: any) => a.id === where.id) ?? null;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        return mockDb.attempts.filter((a: any) => {
          if (where.id?.in) return where.id.in.includes(a.id);
          if (where.sessionId && a.sessionId !== where.sessionId) return false;
          if (where.questionId && a.questionId !== where.questionId) return false;
          return true;
        });
      }),
    },
    attemptFlag: {
      upsert: vi.fn(async ({ create, update }: any) => {
        const existingIdx = mockDb.flags.findIndex(
          (f: any) => f.attemptId === create.attemptId && f.kind === create.kind,
        );
        if (existingIdx >= 0) {
          mockDb.flags[existingIdx] = { ...mockDb.flags[existingIdx], ...update };
          return mockDb.flags[existingIdx];
        }
        const created = { id: `flag-${mockDb.flags.length + 1}`, ...create };
        mockDb.flags.push(created);
        return created;
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const countBefore = mockDb.flags.length;
        mockDb.flags = mockDb.flags.filter((f: any) => {
          if (where.attemptId?.in && where.attemptId.in.includes(f.attemptId)) {
            if (where.kind && f.kind !== where.kind) return true;
            return false;
          }
          if (where.attemptId && f.attemptId === where.attemptId) {
            if (where.kind && f.kind !== where.kind) return true;
            return false;
          }
          return true;
        });
        return { count: countBefore - mockDb.flags.length };
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        mockDb.auditLogs.push(data);
        return data;
      }),
    },
  },
}));

import { invalidateLeaderboardCache } from '@/server/services/leaderboard';
import {
  GET as adminGetLeaderboard,
  POST as adminActionLeaderboard,
} from '@/app/api/admin/exams/[id]/leaderboard/route';
import { GET as studentGetLeaderboard } from '@/app/api/exams/[id]/leaderboard/route';
import { PATCH as updateExamRoute } from '@/app/api/exams/[id]/route';

const studentUser = {
  id: 'u-student-1',
  email: 'student1@scaler.com',
  name: 'Aryan Student',
  role: 'STUDENT',
};

const adminUser = {
  id: 'u-admin-1',
  email: 'admin@scaler.com',
  name: 'Contest Administrator',
  role: 'ADMIN',
};

const examId = 'exam-100';
const ctx = { params: Promise.resolve({ id: examId }) };

describe('Admin Leaderboard Controls & API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateLeaderboardCache();
    mockDb.auditLogs = [];

    mockDb.exam = {
      id: examId,
      title: 'Full Stack DSA Contest',
      status: 'ENDED',
      startTime: new Date('2026-10-14T10:00:00Z'),
      endTime: new Date('2026-10-14T12:00:00Z'),
      leaderboardMode: 'LIVE',
      wrongTryPenaltySeconds: 300,
      leaderboardFrozenAt: null,
      resultsPublishedAt: null,
      mandatory: true,
      active: true,
      accessMode: 'ANY_AUTHENTICATED_USER',
      notesMd: '# Important Notes',
      instructorInfoMd: '### Instructor: Aryan Raj',
    };

    mockDb.questions = [
      {
        questionId: 'q-1',
        order: 1,
        marks: 100,
        question: { title: 'Two Sum Variant' },
      },
    ];

    mockDb.attempts = [
      {
        id: 'att-1',
        userId: 'u-student-1',
        sessionId: 'sess-1',
        examId,
        questionId: 'q-1',
        score: 100,
        maxScore: 100,
        status: 'SUBMITTED',
        submittedAt: new Date('2026-10-14T10:15:00Z'),
      },
      {
        id: 'att-2',
        userId: 'u-student-2',
        sessionId: 'sess-2',
        examId,
        questionId: 'q-1',
        score: 100,
        maxScore: 100,
        status: 'SUBMITTED',
        submittedAt: new Date('2026-10-14T10:20:00Z'),
      },
    ];

    mockDb.flags = [];

    mockDb.sessions = [
      {
        id: 'sess-1',
        userId: 'u-student-1',
        startedAt: new Date('2026-10-14T10:00:00Z'),
        endedAt: new Date('2026-10-14T10:25:00Z'),
        attemptNumber: 1,
        disqualifiedAt: null,
        disqualifiedById: null,
        disqualifiedReason: null,
        user: {
          id: 'u-student-1',
          name: 'Aryan Student',
          email: 'student1@scaler.com',
          displayHandle: 'aryan_10373',
        },
        attempts: [
          {
            id: 'att-1',
            questionId: 'q-1',
            score: 100,
            maxScore: 100,
            status: 'SUBMITTED',
            submittedAt: new Date('2026-10-14T10:15:00Z'),
            attemptFlags: [],
            testRuns: [
              {
                id: 'tr-1',
                questionId: 'q-1',
                startedAt: new Date('2026-10-14T10:15:00Z'),
                completedAt: new Date('2026-10-14T10:15:05Z'),
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
        startedAt: new Date('2026-10-14T10:00:00Z'),
        endedAt: new Date('2026-10-14T10:30:00Z'),
        attemptNumber: 1,
        disqualifiedAt: null,
        disqualifiedById: null,
        disqualifiedReason: null,
        user: {
          id: 'u-student-2',
          name: 'Cheating Candidate',
          email: '=1+1@evil.com',
          displayHandle: 'evil_user',
        },
        attempts: [
          {
            id: 'att-2',
            questionId: 'q-1',
            score: 100,
            maxScore: 100,
            status: 'SUBMITTED',
            submittedAt: new Date('2026-10-14T10:20:00Z'),
            attemptFlags: [],
            testRuns: [
              {
                id: 'tr-2',
                questionId: 'q-1',
                startedAt: new Date('2026-10-14T10:20:00Z'),
                completedAt: new Date('2026-10-14T10:20:05Z'),
                score: 100,
                maxScore: 100,
                status: 'PASSED',
              },
            ],
          },
        ],
      },
    ];
  });

  describe('Non-admins get 403 on all admin routes', () => {
    it('returns 403 when student calls GET /api/admin/exams/[id]/leaderboard', async () => {
      session.current = { user: studentUser };
      const req = new Request('http://localhost/api/admin/exams/exam-100/leaderboard');
      const res = await adminGetLeaderboard(req, ctx);
      expect(res.status).toBe(403);
    });

    it('returns 403 when student calls GET /api/admin/exams/[id]/leaderboard?format=csv', async () => {
      session.current = { user: studentUser };
      const req = new Request('http://localhost/api/admin/exams/exam-100/leaderboard?format=csv');
      const res = await adminGetLeaderboard(req, ctx);
      expect(res.status).toBe(403);
    });

    it('returns 403 when student calls POST /api/admin/exams/[id]/leaderboard for actions', async () => {
      session.current = { user: studentUser };
      const actions = [
        { action: 'disqualify', sessionId: 'sess-2' },
        { action: 'undisqualify', sessionId: 'sess-2' },
        { action: 'flag_plagiarism', sessionId: 'sess-2' },
        { action: 'clear_flag', sessionId: 'sess-2' },
        { action: 'freeze_now' },
        { action: 'publish_final' },
        { action: 'promote_similarity_pair', attemptAId: 'att-1', attemptBId: 'att-2' },
      ];

      for (const payload of actions) {
        const req = new Request('http://localhost/api/admin/exams/exam-100/leaderboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const res = await adminActionLeaderboard(req, ctx);
        expect(res.status).toBe(403);
      }
    });
  });

  describe('Admin actions, audit logs, and disqualification isolation', () => {
    it('disqualifies a participant, writes audit log, and removes from student API while retaining in admin API', async () => {
      session.current = { user: adminUser };

      // 1. Admin calls disqualify action
      const req = new Request('http://localhost/api/admin/exams/exam-100/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'disqualify',
          sessionId: 'sess-2',
          reason: 'Tab violation and plagiarism detection',
        }),
      });

      const res = await adminActionLeaderboard(req, ctx);
      expect(res.status).toBe(200);

      // Verify session updated without deleting attempt or session
      const s2 = mockDb.sessions.find((s: any) => s.id === 'sess-2');
      expect(s2.disqualifiedAt).toBeTruthy();
      expect(s2.disqualifiedById).toBe(adminUser.id);
      expect(s2.disqualifiedReason).toBe('Tab violation and plagiarism detection');

      // Verify audit entry was written
      const audit = mockDb.auditLogs.find((a: any) => a.action === 'exam.session_disqualified');
      expect(audit).toBeTruthy();
      expect(audit.entityId).toBe('sess-2');
      expect(audit.userId).toBe(adminUser.id);

      // 2. Student API: Disqualified student is completely absent
      session.current = { user: studentUser };
      const studentReq = new Request('http://localhost/api/exams/exam-100/leaderboard');
      const studentRes = await studentGetLeaderboard(studentReq, ctx);
      expect(studentRes.status).toBe(200);
      const studentData = await studentRes.json();

      expect(studentData.rows.length).toBe(1);
      expect(studentData.rows[0].handle).toBe('aryan_10373');
      expect(studentData.rows.some((r: any) => r.handle === 'evil_user')).toBe(false);

      // 3. Admin API: Disqualified student remains visible with email and DQ flag
      session.current = { user: adminUser };
      const adminReq = new Request('http://localhost/api/admin/exams/exam-100/leaderboard');
      const adminRes = await adminGetLeaderboard(adminReq, ctx);
      expect(adminRes.status).toBe(200);
      const adminData = await adminRes.json();

      expect(adminData.rows.length).toBe(2);
      const evilRow = adminData.rows.find((r: any) => r.sessionId === 'sess-2');
      expect(evilRow).toBeTruthy();
      expect(evilRow.disqualified).toBe(true);
      expect(evilRow.email).toBe('=1+1@evil.com');
      expect(evilRow.rank).toBeNull();
    });

    it('reinstates a disqualified participant reversibly with audit log', async () => {
      session.current = { user: adminUser };

      // Pre-set as disqualified
      const s2 = mockDb.sessions.find((s: any) => s.id === 'sess-2');
      s2.disqualifiedAt = new Date();

      const req = new Request('http://localhost/api/admin/exams/exam-100/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'undisqualify',
          sessionId: 'sess-2',
        }),
      });

      const res = await adminActionLeaderboard(req, ctx);
      expect(res.status).toBe(200);

      expect(s2.disqualifiedAt).toBeNull();
      const audit = mockDb.auditLogs.find((a: any) => a.action === 'exam.session_reinstated');
      expect(audit).toBeTruthy();
      expect(audit.entityId).toBe('sess-2');
    });

    it('flags plagiarism and clears flag with audit logging', async () => {
      session.current = { user: adminUser };

      // Flag as plagiarism
      const flagReq = new Request('http://localhost/api/admin/exams/exam-100/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'flag_plagiarism',
          sessionId: 'sess-2',
          note: 'Found code identical to external repo',
        }),
      });

      const flagRes = await adminActionLeaderboard(flagReq, ctx);
      expect(flagRes.status).toBe(200);

      const flagAudit = mockDb.auditLogs.find((a: any) => a.action === 'exam.plagiarism_flagged');
      expect(flagAudit).toBeTruthy();
      expect(flagAudit.entityId).toBe('att-2');

      // Clear flag
      const clearReq = new Request('http://localhost/api/admin/exams/exam-100/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear_flag',
          sessionId: 'sess-2',
        }),
      });

      const clearRes = await adminActionLeaderboard(clearReq, ctx);
      expect(clearRes.status).toBe(200);

      const clearAudit = mockDb.auditLogs.find((a: any) => a.action === 'exam.plagiarism_cleared');
      expect(clearAudit).toBeTruthy();
    });

    it('promotes similarity scan pair to PLAGIARISM flag with one click and audits', async () => {
      session.current = { user: adminUser };

      const req = new Request('http://localhost/api/admin/exams/exam-100/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'promote_similarity_pair',
          attemptAId: 'att-1',
          attemptBId: 'att-2',
          note: 'Jaccard similarity 95%',
        }),
      });

      const res = await adminActionLeaderboard(req, ctx);
      expect(res.status).toBe(200);

      const audit = mockDb.auditLogs.find((a: any) => a.action === 'exam.similarity_pair_promoted');
      expect(audit).toBeTruthy();
      expect(audit.metadata.attemptAId).toBe('att-1');
      expect(audit.metadata.attemptBId).toBe('att-2');
    });

    it('freezes board now and writes audit log', async () => {
      session.current = { user: adminUser };

      const req = new Request('http://localhost/api/admin/exams/exam-100/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'freeze_now' }),
      });

      const res = await adminActionLeaderboard(req, ctx);
      expect(res.status).toBe(200);

      expect(mockDb.exam.leaderboardFrozenAt).toBeTruthy();
      const audit = mockDb.auditLogs.find((a: any) => a.action === 'exam.leaderboard_frozen');
      expect(audit).toBeTruthy();
    });

    it('publishes final results: freezes board, writes audit, and informs student API that results are final', async () => {
      session.current = { user: adminUser };

      const req = new Request('http://localhost/api/admin/exams/exam-100/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish_final' }),
      });

      const res = await adminActionLeaderboard(req, ctx);
      expect(res.status).toBe(200);

      expect(mockDb.exam.resultsPublishedAt).toBeTruthy();
      expect(mockDb.exam.leaderboardFrozenAt).toBeTruthy();

      const audit = mockDb.auditLogs.find((a: any) => a.action === 'exam.final_results_published');
      expect(audit).toBeTruthy();

      // Verify student API reflects final status
      session.current = { user: studentUser };
      const studentReq = new Request('http://localhost/api/exams/exam-100/leaderboard');
      const studentRes = await studentGetLeaderboard(studentReq, ctx);
      const studentData = await studentRes.json();

      expect(studentData.isFinal).toBe(true);
    });

    it('exports admin CSV with formula escaping for cells starting with =, +, -, @', async () => {
      session.current = { user: adminUser };

      const req = new Request('http://localhost/api/admin/exams/exam-100/leaderboard?format=csv');
      const res = await adminGetLeaderboard(req, ctx);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/csv');

      const csvText = await res.text();
      // Student 2 has email '=1+1@evil.com' which must be escaped as '=1+1@evil.com'
      expect(csvText).toContain("'=1+1@evil.com");
      expect(csvText).not.toMatch(/^=1\+1@evil\.com/m);

      const audit = mockDb.auditLogs.find((a: any) => a.action === 'exam.leaderboard_exported');
      expect(audit).toBeTruthy();
    });

    it('updates exam leaderboard settings via PATCH and writes audit log', async () => {
      session.current = { user: adminUser };

      // Ensure exam has passingPercentage and count of sessions
      mockDb.exam.passingPercentage = { toFixed: () => '40.00' };
      mockDb.exam.questions = [];
      mockDb.exam._count = { sessions: 2, assignments: 1 };

      const patchReq = new Request('http://localhost/api/exams/exam-100', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaderboardMode: 'AFTER_END',
          wrongTryPenaltySeconds: 600,
          mandatory: false,
          notesMd: 'Updated notes content',
          instructorInfoMd: 'Updated instructor bio',
        }),
      });

      const res = await updateExamRoute(patchReq, ctx);
      expect(res.status).toBe(200);

      expect(mockDb.exam.leaderboardMode).toBe('AFTER_END');
      expect(mockDb.exam.wrongTryPenaltySeconds).toBe(600);
      expect(mockDb.exam.mandatory).toBe(false);
      expect(mockDb.exam.notesMd).toBe('Updated notes content');
      expect(mockDb.exam.instructorInfoMd).toBe('Updated instructor bio');

      const audit = mockDb.auditLogs.find((a: any) => a.action === 'exam.updated');
      expect(audit).toBeTruthy();
      expect(audit.entityId).toBe(examId);
      expect(audit.metadata.changed).toContain('leaderboardMode');
      expect(audit.metadata.changed).toContain('wrongTryPenaltySeconds');
    });
  });
});
