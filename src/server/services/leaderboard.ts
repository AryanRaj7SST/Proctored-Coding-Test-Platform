import { prisma } from '@/lib/prisma';
import { forbidden, notFound } from '@/lib/errors';
import { marksToNumber } from '@/server/grading/marks';
import {
  computeLeaderboard,
  type ComputeLeaderboardInput,
  type LeaderboardParticipantRecord,
  type LeaderboardQuestionConfig,
  type LeaderboardRow,
  type LeaderboardSubmissionRecord,
  type LeaderboardFlagRecord,
} from '@/lib/leaderboard';

export interface LeaderboardServiceResult {
  exam: {
    id: string;
    title: string;
    leaderboardMode: string;
    frozenAt: Date | null;
  };
  questions: LeaderboardQuestionConfig[];
  rows: LeaderboardRow[];
  userRow: LeaderboardRow | null;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface GetLeaderboardParams {
  examId: string;
  requestingUserId?: string;
  page?: number;
  pageSize?: number;
  isAdmin?: boolean;
}

/**
 * Loads the minimal data for an exam leaderboard with no N+1 queries,
 * evaluates the pure computeLeaderboard algorithm, paginates (page size 50),
 * and returns the requesting student's own row separately.
 */
export async function getExamLeaderboard(params: GetLeaderboardParams): Promise<LeaderboardServiceResult> {
  const { examId, requestingUserId, isAdmin = false } = params;

  // 1. Fetch exam configuration
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      title: true,
      status: true,
      startTime: true,
      endTime: true,
      leaderboardMode: true,
      wrongTryPenaltySeconds: true,
      leaderboardFrozenAt: true,
    },
  });

  if (!exam) {
    throw notFound('Exam not found.');
  }

  // 2. Enforce visibility rules
  if (!isAdmin) {
    if (exam.leaderboardMode === 'HIDDEN') {
      throw forbidden('Leaderboard is hidden for this contest.');
    }

    if (exam.leaderboardMode === 'AFTER_END') {
      const now = new Date();
      const hasEnded = (exam.endTime && now.getTime() >= exam.endTime.getTime()) || exam.status === 'ENDED';
      if (!hasEnded) {
        throw forbidden('Leaderboard will be available after the contest ends.');
      }
    }
  }

  // 3. Query questions and participant sessions in two batched queries (No N+1)
  const [examQuestions, sessions] = await Promise.all([
    prisma.examQuestion.findMany({
      where: { examId },
      orderBy: { order: 'asc' },
      select: {
        questionId: true,
        order: true,
        marks: true,
        question: { select: { title: true } },
      },
    }),
    prisma.examSession.findMany({
      where: { examId },
      select: {
        id: true,
        userId: true,
        startedAt: true,
        endedAt: true,
        attemptNumber: true,
        user: {
          select: {
            id: true,
            name: true,
            displayHandle: true,
          },
        },
        attempts: {
          select: {
            id: true,
            questionId: true,
            score: true,
            maxScore: true,
            status: true,
            submittedAt: true,
            attemptFlags: {
              select: { kind: true },
            },
            testRuns: {
              where: { kind: 'SUBMISSION' },
              select: {
                id: true,
                questionId: true,
                startedAt: true,
                completedAt: true,
                score: true,
                maxScore: true,
                status: true,
              },
              orderBy: { startedAt: 'asc' },
            },
          },
        },
      },
      orderBy: [{ userId: 'asc' }, { attemptNumber: 'desc' }],
    }),
  ]);

  const questionsConfig: LeaderboardQuestionConfig[] = examQuestions.map((eq) => ({
    id: eq.questionId,
    order: eq.order,
    marks: marksToNumber(eq.marks),
    title: eq.question.title,
  }));

  // Deduplicate sessions to pick the primary/latest sitting per student
  const primarySessionByUser = new Map<string, (typeof sessions)[number]>();
  for (const s of sessions) {
    if (!primarySessionByUser.has(s.userId)) {
      primarySessionByUser.set(s.userId, s);
    }
  }

  // 4. Map DB records to pure participant structures
  const participants: LeaderboardParticipantRecord[] = [];

  for (const session of primarySessionByUser.values()) {
    const submissions: LeaderboardSubmissionRecord[] = [];
    const flags: LeaderboardFlagRecord[] = [];

    for (const att of session.attempts) {
      for (const flag of att.attemptFlags) {
        flags.push({
          questionId: att.questionId,
          kind: flag.kind,
        });
      }

      if (att.testRuns && att.testRuns.length > 0) {
        for (const tr of att.testRuns) {
          const trScore = marksToNumber(tr.score);
          const trMax = marksToNumber(tr.maxScore);
          submissions.push({
            id: tr.id,
            questionId: tr.questionId ?? att.questionId,
            submittedAt: tr.completedAt ?? tr.startedAt,
            score: trScore,
            maxScore: trMax,
            passed: trScore >= trMax && trMax > 0,
            kind: 'SUBMISSION',
          });
        }
      } else if (
        att.submittedAt &&
        (att.status === 'SUBMITTED' || att.status === 'AUTO_SUBMITTED' || att.status === 'EXPIRED')
      ) {
        // Graceful fallback for attempts before testRuns recording
        const attScore = marksToNumber(att.score);
        const attMax = marksToNumber(att.maxScore);
        submissions.push({
          id: att.id,
          questionId: att.questionId,
          submittedAt: att.submittedAt,
          score: attScore,
          maxScore: attMax,
          passed: attScore >= attMax && attMax > 0,
          kind: 'SUBMISSION',
        });
      }
    }

    participants.push({
      userId: session.user.id,
      sessionId: session.id,
      displayHandle: session.user.displayHandle,
      name: session.user.name,
      sittingStartedAt: session.startedAt,
      submissions,
      flags,
    });
  }

  // 5. Execute pure leaderboard computation
  const computeInput: ComputeLeaderboardInput = {
    questions: questionsConfig,
    participants,
    contestStartTime: exam.startTime,
    contestEndTime: exam.endTime,
    wrongTryPenaltySeconds: exam.wrongTryPenaltySeconds,
    frozenAt: exam.leaderboardFrozenAt,
  };

  const rankedRows = computeLeaderboard(computeInput);

  // 6. Pagination & user row
  const total = rankedRows.length;
  const pageSize = Math.min(Math.max(1, params.pageSize ?? 50), 200);
  const totalPages = Math.ceil(total / pageSize) || 1;
  const page = Math.min(Math.max(1, params.page ?? 1), totalPages);

  const paginatedRows = rankedRows.slice((page - 1) * pageSize, page * pageSize);

  const userRow = requestingUserId ? (rankedRows.find((r) => r.userId === requestingUserId) ?? null) : null;

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      leaderboardMode: exam.leaderboardMode,
      frozenAt: exam.leaderboardFrozenAt,
    },
    questions: questionsConfig,
    rows: paginatedRows,
    userRow,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
}

/**
 * Admin action: create or update an attempt flag (e.g. PLAGIARISM).
 * Only admins can create PLAGIARISM flags.
 */
export async function flagAttempt(params: {
  attemptId: string;
  kind: 'PLAGIARISM' | 'MANUAL_REVIEW';
  adminUserId: string;
  note?: string;
}) {
  return prisma.attemptFlag.upsert({
    where: {
      attemptId_kind: {
        attemptId: params.attemptId,
        kind: params.kind,
      },
    },
    update: {
      setById: params.adminUserId,
      note: params.note ?? null,
    },
    create: {
      attemptId: params.attemptId,
      kind: params.kind,
      setById: params.adminUserId,
      note: params.note ?? null,
    },
  });
}

/**
 * Admin action: remove an attempt flag.
 */
export async function unflagAttempt(params: { attemptId: string; kind: 'PLAGIARISM' | 'MANUAL_REVIEW' }) {
  return prisma.attemptFlag.deleteMany({
    where: {
      attemptId: params.attemptId,
      kind: params.kind,
    },
  });
}
