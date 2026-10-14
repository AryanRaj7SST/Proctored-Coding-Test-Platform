import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isProductionHost, validateExamForLoadtest } from '../../scripts/loadtest/run';
import { executeCleanup, getCleanupCounts } from '../../scripts/loadtest/cleanup';
import type { PrismaClient } from '@prisma/client';

describe('load test production safety & safeguards', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Production refusal & opt-in', () => {
    it('identifies known production hosts and environment PRODUCTION_URL', () => {
      expect(isProductionHost('https://proctored-coding-test-platform.vercel.app')).toBe(true);
      expect(isProductionHost('https://proctored-coding-test-platform.vercel.app/')).toBe(true);
      expect(isProductionHost('http://localhost:3000')).toBe(false);
      expect(isProductionHost('https://preview-deploy-branch-123.vercel.app')).toBe(false);

      const oldEnv = process.env.PRODUCTION_URL;
      try {
        process.env.PRODUCTION_URL = 'https://custom-production.domain.com';
        expect(isProductionHost('https://custom-production.domain.com')).toBe(true);
        expect(isProductionHost('https://other-preview.domain.com')).toBe(false);
      } finally {
        process.env.PRODUCTION_URL = oldEnv;
      }
    });

    it('rejects invalid or malformed target URLs gracefully', () => {
      expect(isProductionHost('not-a-valid-url')).toBe(false);
    });
  });

  describe('2. Exam title prefix validation (non-LOADTEST refusal)', () => {
    it('refuses when exam does not exist in database', () => {
      const result = validateExamForLoadtest(null);
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/Exam not found in database/i);
    });

    it('refuses when exam title does not start with "LOADTEST "', () => {
      const liveExams = [
        { id: 'exam-1', title: 'Midterm Examination 2026' },
        { id: 'exam-2', title: 'Weekly Contest #12' },
        { id: 'exam-3', title: 'Loadtest lowercase prefix' },
        { id: 'exam-4', title: 'LOADTESTwithoutSpace' },
      ];

      for (const exam of liveExams) {
        const result = validateExamForLoadtest(exam);
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('does not start with "LOADTEST "');
      }
    });

    it('accepts exams with title starting with "LOADTEST "', () => {
      const validExams = [
        { id: 'exam-1', title: 'LOADTEST 250 Concurrent Students' },
        { id: 'exam-2', title: 'LOADTEST - Baseline Runner Performance' },
        { id: 'exam-3', title: 'LOADTEST' + ' ' + 'Synthetic Sitting' },
      ];

      for (const exam of validExams) {
        const result = validateExamForLoadtest(exam);
        expect(result.ok).toBe(true);
        expect(result.reason).toBeUndefined();
      }
    });
  });

  describe('3. Cleanup dry-run: touches nothing', () => {
    it('queries counts but executes zero deletes when execute flag is false', async () => {
      const mockDeleteMany = vi.fn();
      const mockTransaction = vi.fn();

      const mockPrisma = {
        user: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'user-1', email: 'loadtest-run99-student-001@loadtest.local' },
            { id: 'user-2', email: 'loadtest-run99-student-002@loadtest.local' },
          ]),
          deleteMany: mockDeleteMany,
        },
        attempt: {
          findMany: vi.fn().mockResolvedValue([{ id: 'att-1' }]),
          count: vi.fn().mockResolvedValue(0),
          deleteMany: mockDeleteMany,
        },
        examSession: {
          findMany: vi.fn().mockResolvedValue([{ id: 'sess-1' }]),
          deleteMany: mockDeleteMany,
        },
        examAssignment: {
          findMany: vi.fn().mockResolvedValue([{ id: 'asgn-1' }, { id: 'asgn-2' }]),
          deleteMany: mockDeleteMany,
        },
        proctorEvent: {
          findMany: vi.fn().mockResolvedValue([{ id: 'pe-1' }]),
          deleteMany: mockDeleteMany,
        },
        testResult: {
          count: vi.fn().mockResolvedValue(4),
          deleteMany: mockDeleteMany,
        },
        testRun: {
          count: vi.fn().mockResolvedValue(2),
          deleteMany: mockDeleteMany,
        },
        attemptFlag: {
          count: vi.fn().mockResolvedValue(0),
          deleteMany: mockDeleteMany,
        },
        attemptScoreHistory: {
          count: vi.fn().mockResolvedValue(0),
          deleteMany: mockDeleteMany,
        },
        auditLog: {
          count: vi.fn().mockResolvedValue(1),
          deleteMany: mockDeleteMany,
        },
        $transaction: mockTransaction,
      } as unknown as PrismaClient;

      const { before, after } = await executeCleanup(mockPrisma, {
        runId: 'run99',
        execute: false, // DRY RUN
      });

      // Verify records were counted
      expect(before.users).toBe(2);
      expect(before.attempts).toBe(1);
      expect(before.exam_sessions).toBe(1);
      expect(before.exam_assignments).toBe(2);
      expect(before.test_results).toBe(4);
      expect(before.test_runs).toBe(2);
      expect(before.audit_logs).toBe(1);

      // Verify before and after counts are unchanged
      expect(after).toEqual(before);

      // Verify NO deletes were called and no transaction was executed
      expect(mockDeleteMany).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });

  describe('4. Cleanup scoped to prefix: deletes only matching records', () => {
    it('scopes user query to prefix and performs ordered deletion in a transaction', async () => {
      const deletedCalls: string[] = [];

      const txMock = {
        testResult: {
          deleteMany: vi.fn().mockImplementation((args) => {
            deletedCalls.push('testResult');
            expect(args.where.attemptId.in).toEqual(['att-1']);
          }),
        },
        testRun: {
          deleteMany: vi.fn().mockImplementation((args) => {
            deletedCalls.push('testRun');
            expect(args.where.OR).toEqual([
              { attemptId: { in: ['att-1'] } },
              { userId: { in: ['user-1'] } },
            ]);
          }),
        },
        attemptFlag: {
          deleteMany: vi.fn().mockImplementation(() => deletedCalls.push('attemptFlag')),
        },
        attemptScoreHistory: {
          deleteMany: vi.fn().mockImplementation(() => deletedCalls.push('attemptScoreHistory')),
        },
        proctorEvent: {
          deleteMany: vi.fn().mockImplementation((args) => {
            deletedCalls.push('proctorEvent');
            expect(args.where.id.in).toEqual(['pe-1']);
          }),
        },
        attempt: {
          deleteMany: vi.fn().mockImplementation((args) => {
            deletedCalls.push('attempt');
            expect(args.where.id.in).toEqual(['att-1']);
          }),
        },
        examSession: {
          deleteMany: vi.fn().mockImplementation((args) => {
            deletedCalls.push('examSession');
            expect(args.where.id.in).toEqual(['sess-1']);
          }),
        },
        examAssignment: {
          deleteMany: vi.fn().mockImplementation((args) => {
            deletedCalls.push('examAssignment');
            expect(args.where.id.in).toEqual(['asgn-1']);
          }),
        },
        auditLog: {
          deleteMany: vi.fn().mockImplementation((args) => {
            deletedCalls.push('auditLog');
            expect(args.where.userId.in).toEqual(['user-1']);
          }),
        },
        user: {
          deleteMany: vi.fn().mockImplementation((args) => {
            deletedCalls.push('user');
            expect(args.where.id.in).toEqual(['user-1']);
          }),
        },
      };

      let queryCallCount = 0;
      const mockPrisma = {
        user: {
          findMany: vi.fn().mockImplementation((args) => {
            expect(args.where.email.startsWith).toBe('loadtest-runScoped-');
            queryCallCount++;
            // First call before delete returns 1 user; second call after delete returns 0 users
            if (queryCallCount === 1) {
              return [{ id: 'user-1', email: 'loadtest-runScoped-student-001@loadtest.local' }];
            }
            return [];
          }),
        },
        attempt: {
          findMany: vi.fn().mockImplementation((args) => {
            expect(args.where.userId.in).toEqual(['user-1']);
            expect(args.where.exam.title.startsWith).toBe('LOADTEST ');
            return [{ id: 'att-1' }];
          }),
          count: vi.fn().mockResolvedValue(0),
        },
        examSession: {
          findMany: vi.fn().mockResolvedValue([{ id: 'sess-1' }]),
        },
        examAssignment: {
          findMany: vi.fn().mockResolvedValue([{ id: 'asgn-1' }]),
        },
        proctorEvent: {
          findMany: vi.fn().mockResolvedValue([{ id: 'pe-1' }]),
        },
        testResult: {
          count: vi.fn().mockResolvedValue(2),
        },
        testRun: {
          count: vi.fn().mockResolvedValue(1),
        },
        attemptFlag: {
          count: vi.fn().mockResolvedValue(0),
        },
        attemptScoreHistory: {
          count: vi.fn().mockResolvedValue(0),
        },
        auditLog: {
          count: vi.fn().mockResolvedValue(1),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => {
          await cb(txMock);
        }),
      } as unknown as PrismaClient;

      const { before, after } = await executeCleanup(mockPrisma, {
        runId: 'runScoped',
        execute: true,
      });

      expect(before.users).toBe(1);
      expect(after.users).toBe(0);

      // Verify transaction was called
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

      // Verify order of deletion: leaf children first, user last
      expect(deletedCalls).toEqual([
        'testResult',
        'testRun',
        'attemptFlag',
        'attemptScoreHistory',
        'proctorEvent',
        'attempt',
        'examSession',
        'examAssignment',
        'auditLog',
        'user',
      ]);
    });
  });
});
