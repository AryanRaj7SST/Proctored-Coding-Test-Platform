import { prisma } from '@/lib/prisma';
import { notFound } from '@/lib/errors';
import { getExamTimeState } from './sessions';
import { marksToNumber, fromMicro, totalOf, toMicro } from '@/server/grading/marks';
import { accessFromAssignment, studentCanAccessTest } from '@/lib/authz';
import type { SessionUser } from '@/lib/authz';

export type ContestStudentState = 'UPCOMING' | 'LIVE' | 'SUBMITTED' | 'COMPLETED' | 'MISSED' | 'REVOKED';

export interface ContestLandingData {
  exam: {
    id: string;
    title: string;
    description: string | null;
    mandatory: boolean;
    durationMinutes: number;
    startTime: Date | null;
    endTime: Date | null;
    timezone: string;
    notesMd: string | null;
    instructorInfoMd: string | null;
    instructions: string | null;
    leaderboardMode: string;
    maxAttempts: number;
    totalMarks: number;
    createdAt: Date;
  };
  studentState: ContestStudentState;
  availability: string;
  isLocked: boolean;
  canStart: boolean;
  canResume: boolean;
  canPractice: boolean;
  activeSessionId: string | null;
  practiceAttemptId: string | null;
  attempts: Array<{
    id: string;
    attemptNumber: number;
    startedAt: Date;
    endedAt: Date | null;
    status: 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'MISSED' | 'EXPIRED';
    score: number | null;
    maxScore: number;
    percentage: number | null;
  }>;
  similarContests: Array<{
    id: string;
    title: string;
    startTime: Date | null;
    endTime: Date | null;
    durationMinutes: number;
    availability: string;
    mandatory: boolean;
  }>;
  studentContests: Array<{
    id: string;
    title: string;
  }>;
}

/**
 * Loads the complete data model for the student contest landing page.
 * Strictly derives studentState and availability using the server-side state machine.
 */
export async function getContestLandingData(examId: string, user: SessionUser): Promise<ContestLandingData> {
  // 1. Fetch target exam
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      questions: { select: { marks: true } },
    },
  });

  if (!exam) {
    throw notFound('Contest not found.');
  }

  // 2. Access decision
  const assignment = await prisma.examAssignment.findUnique({
    where: { examId_userId: { examId, userId: user.id } },
    select: { revokedAt: true },
  });

  const access = accessFromAssignment(assignment);
  const canAccess = user.role === 'ADMIN' || studentCanAccessTest(exam, access);
  const isRevoked = access.revoked;

  if (!canAccess && !isRevoked) {
    throw notFound('Contest not found.');
  }

  // 3. Timing and session state
  const timeState = await getExamTimeState(examId, user.id, exam);
  const { availability } = timeState;

  // 4. Student sitting sessions for "Your Attempts" table
  const sessions = await prisma.examSession.findMany({
    where: { examId, userId: user.id },
    orderBy: { attemptNumber: 'desc' },
  });

  const totalMarks = marksToNumber(fromMicro(totalOf(exam.questions.map((q) => toMicro(q.marks)))));

  // 5. Practice attempt for linking to /practice/[attemptId]
  const completedAttempt = await prisma.attempt.findFirst({
    where: {
      examId,
      userId: user.id,
      status: { in: ['SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED'] },
    },
    select: { id: true },
    orderBy: { submittedAt: 'desc' },
  });

  // Map sessions to attempts table
  const attempts: ContestLandingData['attempts'] = sessions.map((s) => {
    let status: 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'MISSED' | 'EXPIRED' = 'IN_PROGRESS';
    if (s.endedAt) {
      status = s.result ? 'SUBMITTED' : 'EXPIRED';
    } else if (availability === 'EXPIRED') {
      status = 'EXPIRED';
    }

    return {
      id: s.id,
      attemptNumber: s.attemptNumber,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      status,
      score: s.score !== null ? marksToNumber(s.score) : null,
      maxScore: s.maxScore !== null ? marksToNumber(s.maxScore) : totalMarks,
      percentage: s.percentage !== null ? marksToNumber(s.percentage) : null,
    };
  });

  // If student has 0 sessions and contest has ended / is expired -> 1 Missed attempt row
  if (attempts.length === 0 && (availability === 'ENDED' || availability === 'EXPIRED')) {
    attempts.push({
      id: 'missed-attempt',
      attemptNumber: 1,
      startedAt: exam.startTime ?? exam.createdAt,
      endedAt: exam.endTime,
      status: 'MISSED',
      score: null,
      maxScore: totalMarks,
      percentage: null,
    });
  }

  // 6. Derive high-level studentState strictly from server facts
  let studentState: ContestStudentState = 'UPCOMING';
  if (isRevoked) {
    studentState = 'REVOKED';
  } else if (availability === 'NOT_STARTED') {
    studentState = 'UPCOMING';
  } else if (availability === 'IN_PROGRESS') {
    studentState = 'LIVE';
  } else if (availability === 'AVAILABLE') {
    studentState = 'LIVE';
  } else if (availability === 'SUBMITTED') {
    studentState = 'COMPLETED';
  } else if (availability === 'ENDED' || availability === 'EXPIRED') {
    // If student completed at least 1 session, show COMPLETED; otherwise MISSED
    const hasCompletedSitting = sessions.some((s) => s.endedAt !== null);
    studentState = hasCompletedSitting ? 'COMPLETED' : 'MISSED';
  }

  const isLocked = studentState === 'UPCOMING' || isRevoked;
  const canStart = availability === 'AVAILABLE';
  const canResume = availability === 'IN_PROGRESS';
  const canPractice = Boolean(completedAttempt) && availability !== 'IN_PROGRESS';

  // 7. Load student's other visible contests for dropdown and Similar Contests carousel
  const [allAssignments, otherExams] = await Promise.all([
    prisma.examAssignment.findMany({
      where: { userId: user.id },
      select: { examId: true, revokedAt: true },
    }),
    prisma.exam.findMany({
      where: {
        active: true,
        status: { notIn: ['DRAFT', 'ARCHIVED'] },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        durationMinutes: true,
        mandatory: true,
        accessMode: true,
        status: true,
      },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'desc' }],
    }),
  ]);

  const revokedIds = new Set(allAssignments.filter((a) => a.revokedAt).map((a) => a.examId));
  const assignedIds = new Set(allAssignments.filter((a) => !a.revokedAt).map((a) => a.examId));

  const visibleOtherExams = otherExams.filter((e) => {
    if (revokedIds.has(e.id)) return false;
    return e.accessMode === 'ANY_AUTHENTICATED_USER' || assignedIds.has(e.id);
  });

  const studentContests = visibleOtherExams.map((e) => ({
    id: e.id,
    title: e.title,
  }));

  const similarContests = visibleOtherExams
    .filter((e) => e.id !== examId)
    .slice(0, 6)
    .map((e) => ({
      id: e.id,
      title: e.title,
      startTime: e.startTime,
      endTime: e.endTime,
      durationMinutes: e.durationMinutes,
      availability: e.status === 'ENDED' ? 'ENDED' : 'AVAILABLE',
      mandatory: e.mandatory,
    }));

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      mandatory: exam.mandatory,
      durationMinutes: exam.durationMinutes,
      startTime: exam.startTime,
      endTime: exam.endTime,
      timezone: exam.timezone,
      notesMd: exam.notesMd,
      instructorInfoMd: exam.instructorInfoMd,
      instructions: exam.instructions,
      leaderboardMode: exam.leaderboardMode,
      maxAttempts: exam.maxAttempts,
      totalMarks,
      createdAt: exam.createdAt,
    },
    studentState,
    availability,
    isLocked,
    canStart,
    canResume,
    canPractice,
    activeSessionId: sessions.find((s) => s.endedAt === null)?.id ?? null,
    practiceAttemptId: completedAttempt?.id ?? null,
    attempts,
    similarContests,
    studentContests,
  };
}
