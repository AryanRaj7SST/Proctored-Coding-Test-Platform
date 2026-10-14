import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getContestLandingData, type ContestStudentState } from '@/server/services/contest-landing';

const mockDb = vi.hoisted(() => ({
  exam: null as any,
  assignment: null as any,
  sessions: [] as any[],
  completedAttempt: null as any,
  allAssignments: [] as any[],
  otherExams: [] as any[],
}));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    exam: {
      findUnique: vi.fn(async () => mockDb.exam),
      findMany: vi.fn(async () => mockDb.otherExams),
    },
    examAssignment: {
      findUnique: vi.fn(async () => mockDb.assignment),
      findMany: vi.fn(async () => mockDb.allAssignments),
    },
    examSession: {
      findMany: vi.fn(async () => mockDb.sessions),
    },
    attempt: {
      findFirst: vi.fn(async () => mockDb.completedAttempt),
    },
  },
}));

vi.mock('@/server/services/sessions', () => ({
  getExamTimeState: vi.fn(async () => ({
    availability: mockDb.exam?._mockAvailability ?? 'AVAILABLE',
  })),
  userHasOpenTestAccess: vi.fn(async () => false),
}));

describe('Contest Landing Page Data & State Logic', () => {
  const user = {
    id: 'u-student-1',
    email: 'student@scaler.com',
    name: 'Aryan Raj',
    role: 'STUDENT' as const,
    batch: '2026',
  };

  const baseExam = {
    id: 'exam-1',
    title: 'Maths Contest - Beginners',
    description: 'This is a test contest description',
    mandatory: true,
    durationMinutes: 120,
    startTime: new Date(Date.now() - 3600_000),
    endTime: new Date(Date.now() + 3600_000),
    timezone: 'Asia/Kolkata',
    notesMd: '# Notes\n- Problem 1 tips',
    instructorInfoMd: '# Instructor\nDr. Smith',
    instructions: 'Follow rules',
    leaderboardMode: 'LIVE',
    maxAttempts: 1,
    active: true,
    status: 'PUBLISHED',
    accessMode: 'ANY_AUTHENTICATED_USER',
    questions: [{ marks: 50 }, { marks: 50 }],
    _mockAvailability: 'AVAILABLE',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.exam = { ...baseExam };
    mockDb.assignment = null;
    mockDb.sessions = [];
    mockDb.completedAttempt = null;
    mockDb.allAssignments = [];
    mockDb.otherExams = [baseExam];
  });

  it('correctly resolves LIVE state when contest is open and available', async () => {
    mockDb.exam._mockAvailability = 'AVAILABLE';
    const data = await getContestLandingData('exam-1', user);

    expect(data.studentState).toBe('LIVE');
    expect(data.canStart).toBe(true);
    expect(data.canResume).toBe(false);
    expect(data.isLocked).toBe(false);
  });

  it('correctly resolves LIVE state with canResume when student has active session', async () => {
    mockDb.exam._mockAvailability = 'IN_PROGRESS';
    mockDb.sessions = [
      {
        id: 'sess-active',
        attemptNumber: 1,
        startedAt: new Date(),
        endedAt: null,
        score: null,
        maxScore: 100,
        percentage: null,
      },
    ];

    const data = await getContestLandingData('exam-1', user);
    expect(data.studentState).toBe('LIVE');
    expect(data.canResume).toBe(true);
    expect(data.activeSessionId).toBe('sess-active');
  });

  it('correctly resolves UPCOMING state when contest has not opened yet', async () => {
    mockDb.exam._mockAvailability = 'NOT_STARTED';
    const data = await getContestLandingData('exam-1', user);

    expect(data.studentState).toBe('UPCOMING');
    expect(data.isLocked).toBe(true);
    expect(data.canStart).toBe(false);
  });

  it('correctly resolves MISSED state when contest has ended and student did not attempt', async () => {
    mockDb.exam._mockAvailability = 'ENDED';
    mockDb.sessions = [];

    const data = await getContestLandingData('exam-1', user);
    expect(data.studentState).toBe('MISSED');
    expect(data.attempts).toHaveLength(1);
    expect(data.attempts[0]?.status).toBe('MISSED');
  });

  it('correctly resolves COMPLETED state when student finished a session and window has ended', async () => {
    mockDb.exam._mockAvailability = 'ENDED';
    mockDb.sessions = [
      {
        id: 'sess-done',
        attemptNumber: 1,
        startedAt: new Date(Date.now() - 7200_000),
        endedAt: new Date(Date.now() - 3600_000),
        result: 'PASSED',
        score: 84,
        maxScore: 100,
        percentage: 84,
      },
    ];
    mockDb.completedAttempt = { id: 'att-1' };

    const data = await getContestLandingData('exam-1', user);
    expect(data.studentState).toBe('COMPLETED');
    expect(data.canPractice).toBe(true);
    expect(data.practiceAttemptId).toBe('att-1');
  });

  it('correctly resolves REVOKED state when administrator revoked access', async () => {
    mockDb.assignment = { revokedAt: new Date() };

    const data = await getContestLandingData('exam-1', user);
    expect(data.studentState).toBe('REVOKED');
    expect(data.isLocked).toBe(true);
  });

  it('throws 404 when student has no access to an INVITED_ONLY exam', async () => {
    mockDb.exam.accessMode = 'INVITED_ONLY';
    mockDb.assignment = null;

    await expect(getContestLandingData('exam-1', user)).rejects.toMatchObject({
      status: 404,
    });
  });
});
