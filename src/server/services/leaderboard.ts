import { prisma } from '@/lib/prisma';
import { badRequest, forbidden, notFound } from '@/lib/errors';
import { marksToNumber } from '@/server/grading/marks';
import { toCsv } from '@/lib/csv';
import { recordAudit } from '@/server/services/audit';
import {
  computeLeaderboard,
  type ComputeLeaderboardInput,
  type LeaderboardParticipantRecord,
  type LeaderboardQuestionConfig,
  type LeaderboardRow,
  type LeaderboardSubmissionRecord,
  type LeaderboardFlagRecord,
  type LeaderboardQuestionCell,
} from '@/lib/leaderboard';

export interface LeaderboardServiceResult {
  exam: {
    id: string;
    title: string;
    leaderboardMode: string;
    frozenAt: Date | null;
    resultsPublishedAt: Date | null;
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

export interface AdminLeaderboardRow {
  rank: number | null;
  userId: string;
  sessionId: string;
  name: string | null;
  email: string;
  handle: string;
  score: number;
  attemptsCount: number;
  effectiveSeconds: number;
  lastAcceptedAt: Date | null;
  disqualified: boolean;
  disqualifiedAt: Date | null;
  disqualifiedReason?: string | null;
  questions: Record<string, LeaderboardQuestionCell>;
  flags: { attemptId: string; questionId: string; kind: 'PLAGIARISM' | 'MANUAL_REVIEW' | 'DISQUALIFIED' }[];
  attempts: { id: string; questionId: string; score: number; maxScore: number; status: string }[];
}

export interface AdminLeaderboardServiceResult {
  exam: {
    id: string;
    title: string;
    status: string;
    startTime: Date | null;
    endTime: Date | null;
    leaderboardMode: string;
    wrongTryPenaltySeconds: number;
    frozenAt: Date | null;
    resultsPublishedAt: Date | null;
  };
  questions: LeaderboardQuestionConfig[];
  rows: AdminLeaderboardRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface GetLeaderboardParams {
  examId: string;
  requestingUserId?: string;
  page?: number;
  pageSize?: number;
  q?: string;
  isAdmin?: boolean;
}

interface CachedLeaderboardData {
  exam: {
    id: string;
    title: string;
    status: string;
    startTime: Date | null;
    endTime: Date | null;
    leaderboardMode: string;
    wrongTryPenaltySeconds: number;
    leaderboardFrozenAt: Date | null;
    resultsPublishedAt: Date | null;
  };
  questionsConfig: LeaderboardQuestionConfig[];
  rankedRows: LeaderboardRow[];
  allRowsForAdmin: AdminLeaderboardRow[];
  computedAt: number;
}

// 10-second TTL in-memory cache to survive high-concurrency student refreshes
const LEADERBOARD_CACHE_TTL_MS = 10_000;
const examBoardCache = new Map<string, CachedLeaderboardData>();

/**
 * Invalidate cached leaderboard (e.g. on new submission, settings update, or admin moderation).
 */
export function invalidateLeaderboardCache(examId?: string): void {
  if (examId) {
    examBoardCache.delete(examId);
  } else {
    examBoardCache.clear();
  }
}

/**
 * Loads the raw exam and submission data, computes both public and admin leaderboards,
 * and caches the result for ~10 seconds.
 */
async function getCachedRankedData(examId: string): Promise<CachedLeaderboardData> {
  const now = Date.now();
  const cached = examBoardCache.get(examId);
  if (cached && now - cached.computedAt < LEADERBOARD_CACHE_TTL_MS) {
    return cached;
  }

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
      resultsPublishedAt: true,
    },
  });

  if (!exam) {
    throw notFound('Exam not found.');
  }

  // 2. Query questions and participant sessions in two batched queries
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
        disqualifiedAt: true,
        disqualifiedById: true,
        disqualifiedReason: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
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
              select: { id: true, kind: true, setById: true, note: true, createdAt: true },
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

  // Deduplicate sessions to pick primary sitting per student
  const primarySessionByUser = new Map<string, (typeof sessions)[number]>();
  for (const s of sessions) {
    if (!primarySessionByUser.has(s.userId)) {
      primarySessionByUser.set(s.userId, s);
    }
  }

  // Map DB records to pure participant structures
  const allParticipants: (LeaderboardParticipantRecord & {
    email: string;
    disqualifiedAt: Date | null;
    disqualifiedReason: string | null;
    rawFlags: {
      attemptId: string;
      questionId: string;
      kind: 'PLAGIARISM' | 'MANUAL_REVIEW' | 'DISQUALIFIED';
    }[];
    rawAttempts: { id: string; questionId: string; score: number; maxScore: number; status: string }[];
  })[] = [];

  for (const session of primarySessionByUser.values()) {
    const submissions: LeaderboardSubmissionRecord[] = [];
    const flags: LeaderboardFlagRecord[] = [];
    const rawFlags: {
      attemptId: string;
      questionId: string;
      kind: 'PLAGIARISM' | 'MANUAL_REVIEW' | 'DISQUALIFIED';
    }[] = [];
    const rawAttempts: { id: string; questionId: string; score: number; maxScore: number; status: string }[] =
      [];

    for (const att of session.attempts) {
      rawAttempts.push({
        id: att.id,
        questionId: att.questionId,
        score: marksToNumber(att.score),
        maxScore: marksToNumber(att.maxScore),
        status: att.status,
      });

      for (const flag of att.attemptFlags) {
        flags.push({
          questionId: att.questionId,
          kind: flag.kind === 'DISQUALIFIED' ? 'MANUAL_REVIEW' : flag.kind,
        });
        rawFlags.push({
          attemptId: att.id,
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

    allParticipants.push({
      userId: session.user.id,
      sessionId: session.id,
      email: session.user.email,
      displayHandle: session.user.displayHandle,
      name: session.user.name,
      sittingStartedAt: session.startedAt,
      disqualifiedAt: session.disqualifiedAt,
      disqualifiedReason: session.disqualifiedReason,
      rawFlags,
      rawAttempts,
      submissions,
      flags,
    });
  }

  // 1. PUBLIC / STUDENT LEADERBOARD: Compute ONLY for non-disqualified students
  const publicParticipants = allParticipants.filter((p) => !p.disqualifiedAt);
  const publicComputeInput: ComputeLeaderboardInput = {
    questions: questionsConfig,
    participants: publicParticipants,
    contestStartTime: exam.startTime,
    contestEndTime: exam.endTime,
    wrongTryPenaltySeconds: exam.wrongTryPenaltySeconds,
    frozenAt: exam.leaderboardFrozenAt,
  };
  const rankedRows = computeLeaderboard(publicComputeInput);

  // Map public rank by userId for fast lookup
  const publicRankByUserId = new Map<string, number>();
  for (const row of rankedRows) {
    publicRankByUserId.set(row.userId, row.rank);
  }

  // 2. ADMIN LEADERBOARD: Compute for ALL participants (both active and disqualified)
  const fullComputeInput: ComputeLeaderboardInput = {
    questions: questionsConfig,
    participants: allParticipants,
    contestStartTime: exam.startTime,
    contestEndTime: exam.endTime,
    wrongTryPenaltySeconds: exam.wrongTryPenaltySeconds,
    frozenAt: exam.leaderboardFrozenAt,
  };
  const fullRows = computeLeaderboard(fullComputeInput);
  const fullRowByUserId = new Map<string, LeaderboardRow>();
  for (const r of fullRows) {
    fullRowByUserId.set(r.userId, r);
  }

  const allRowsForAdmin: AdminLeaderboardRow[] = allParticipants.map((p) => {
    const computed = fullRowByUserId.get(p.userId);
    const isDisqualified = Boolean(p.disqualifiedAt);
    return {
      rank: isDisqualified ? null : (publicRankByUserId.get(p.userId) ?? null),
      userId: p.userId,
      sessionId: p.sessionId,
      name: p.name ?? null,
      email: p.email,
      handle: computed?.handle ?? (p.displayHandle || 'student'),
      score: computed?.score ?? 0,
      attemptsCount: computed?.attemptsCount ?? 0,
      effectiveSeconds: computed?.effectiveSeconds ?? 0,
      lastAcceptedAt: computed?.lastAcceptedAt ?? null,
      disqualified: isDisqualified,
      disqualifiedAt: p.disqualifiedAt,
      disqualifiedReason: p.disqualifiedReason,
      questions: computed?.questions ?? {},
      flags: p.rawFlags,
      attempts: p.rawAttempts,
    };
  });

  // Sort admin rows: active rows by public rank ascending, then disqualified rows by score descending
  allRowsForAdmin.sort((a, b) => {
    if (!a.disqualified && !b.disqualified) {
      return (a.rank ?? 999999) - (b.rank ?? 999999);
    }
    if (!a.disqualified && b.disqualified) return -1;
    if (a.disqualified && !b.disqualified) return 1;
    return b.score - a.score;
  });

  const entry: CachedLeaderboardData = {
    exam,
    questionsConfig,
    rankedRows,
    allRowsForAdmin,
    computedAt: Date.now(),
  };

  examBoardCache.set(examId, entry);
  return entry;
}

/**
 * Loads the minimal data for a student-facing exam leaderboard.
 * Excludes all disqualified students, enforces visibility rules, paginates,
 * and returns the requesting student's own row.
 */
export async function getExamLeaderboard(params: GetLeaderboardParams): Promise<LeaderboardServiceResult> {
  const { examId, requestingUserId, q, isAdmin = false } = params;

  const cachedData = await getCachedRankedData(examId);
  const { exam, questionsConfig, rankedRows } = cachedData;

  // Enforce visibility rules server-side
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

  // Find user's own row from complete ranked list before query filtering
  const userRow = requestingUserId ? (rankedRows.find((r) => r.userId === requestingUserId) ?? null) : null;

  // Apply search query filter if provided
  let filteredRows = rankedRows;
  if (q && q.trim().length > 0) {
    const query = q.trim().toLowerCase();
    filteredRows = rankedRows.filter((row) => row.handle.toLowerCase().includes(query));
  }

  // Pagination
  const total = filteredRows.length;
  const pageSize = Math.min(Math.max(1, params.pageSize ?? 50), 200);
  const totalPages = Math.ceil(total / pageSize) || 1;
  const page = Math.min(Math.max(1, params.page ?? 1), totalPages);

  const paginatedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      leaderboardMode: exam.leaderboardMode,
      frozenAt: exam.leaderboardFrozenAt,
      resultsPublishedAt: exam.resultsPublishedAt,
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
 * Returns header rank widget summary: { rank, score, maxScore }
 */
export async function getStudentRankSummary(examId: string, userId: string, isAdmin = false) {
  const cachedData = await getCachedRankedData(examId);
  const { exam, questionsConfig, rankedRows } = cachedData;

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

  const maxScore = questionsConfig.reduce((sum, q) => sum + (q.marks || 0), 0);
  const userRow = rankedRows.find((r) => r.userId === userId);

  return {
    rank: userRow?.rank ?? null,
    score: userRow?.score ?? 0,
    maxScore,
  };
}

/**
 * Admin Leaderboard View Service:
 * Returns full student emails, user IDs, attempt IDs, flags, and disqualification status.
 */
export async function getAdminExamLeaderboard(params: {
  examId: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminLeaderboardServiceResult> {
  const { examId, q, page = 1, pageSize = 50 } = params;
  const cachedData = await getCachedRankedData(examId);
  const { exam, questionsConfig, allRowsForAdmin } = cachedData;

  let filtered = allRowsForAdmin;
  if (q && q.trim().length > 0) {
    const query = q.trim().toLowerCase();
    filtered = allRowsForAdmin.filter(
      (r) =>
        r.handle.toLowerCase().includes(query) ||
        r.email.toLowerCase().includes(query) ||
        (r.name && r.name.toLowerCase().includes(query)),
    );
  }

  const total = filtered.length;
  const safePageSize = Math.min(Math.max(1, pageSize), 500);
  const totalPages = Math.ceil(total / safePageSize) || 1;
  const safePage = Math.min(Math.max(1, page), totalPages);
  const rows = filtered.slice((safePage - 1) * safePageSize, safePage * safePageSize);

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      status: exam.status,
      startTime: exam.startTime,
      endTime: exam.endTime,
      leaderboardMode: exam.leaderboardMode,
      wrongTryPenaltySeconds: exam.wrongTryPenaltySeconds,
      frozenAt: exam.leaderboardFrozenAt,
      resultsPublishedAt: exam.resultsPublishedAt,
    },
    questions: questionsConfig,
    rows,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}

/**
 * Exports full admin leaderboard to CSV with formula injection protection (toCsv).
 */
export async function exportAdminLeaderboardToCsv(examId: string): Promise<string> {
  const cachedData = await getCachedRankedData(examId);
  const { questionsConfig, allRowsForAdmin } = cachedData;

  const headers = [
    'Rank',
    'Student Name',
    'Email',
    'Handle',
    'Total Score',
    'Attempts Count',
    'Effective Time (s)',
    'Disqualified',
    'Disqualified Reason',
  ];

  for (const q of questionsConfig) {
    const label = `Q${q.order}`;
    headers.push(`${label} State`, `${label} Tries`, `${label} Solve Time (s)`, `${label} Score`);
  }

  const csvRows = allRowsForAdmin.map((row) => {
    const r: (string | number | boolean | null | undefined)[] = [
      row.disqualified ? 'DQ' : (row.rank ?? ''),
      row.name ?? '',
      row.email,
      row.handle,
      row.score,
      row.attemptsCount,
      row.effectiveSeconds,
      row.disqualified ? 'YES' : 'NO',
      row.disqualifiedReason ?? '',
    ];

    for (const q of questionsConfig) {
      const cell = row.questions[q.id];
      if (cell) {
        r.push(cell.state, cell.tries, cell.seconds, cell.score);
      } else {
        r.push('NOT_ATTEMPTED', 0, 0, 0);
      }
    }

    return r;
  });

  return toCsv(headers, csvRows);
}

/**
 * Admin action: Disqualify a participant sitting from the public leaderboard.
 * Keeps all attempts and work intact. Audited and reversible.
 */
export async function disqualifySession(params: {
  examId: string;
  sessionId: string;
  adminId: string;
  reason?: string;
}): Promise<void> {
  const session = await prisma.examSession.findFirst({
    where: { id: params.sessionId, examId: params.examId },
    select: { id: true, userId: true },
  });
  if (!session) throw notFound('Sitting not found for this exam.');

  await prisma.examSession.update({
    where: { id: params.sessionId },
    data: {
      disqualifiedAt: new Date(),
      disqualifiedById: params.adminId,
      disqualifiedReason: params.reason ?? 'Disqualified by administrator',
    },
  });

  await recordAudit({
    userId: params.adminId,
    action: 'exam.session_disqualified',
    entity: 'ExamSession',
    entityId: params.sessionId,
    metadata: { examId: params.examId, userId: session.userId, reason: params.reason },
  });

  invalidateLeaderboardCache(params.examId);
}

/**
 * Admin action: Reinstate/undisqualify a previously disqualified sitting.
 */
export async function undisqualifySession(params: {
  examId: string;
  sessionId: string;
  adminId: string;
}): Promise<void> {
  const session = await prisma.examSession.findFirst({
    where: { id: params.sessionId, examId: params.examId },
    select: { id: true, userId: true },
  });
  if (!session) throw notFound('Sitting not found for this exam.');

  await prisma.examSession.update({
    where: { id: params.sessionId },
    data: {
      disqualifiedAt: null,
      disqualifiedById: null,
      disqualifiedReason: null,
    },
  });

  await recordAudit({
    userId: params.adminId,
    action: 'exam.session_reinstated',
    entity: 'ExamSession',
    entityId: params.sessionId,
    metadata: { examId: params.examId, userId: session.userId },
  });

  invalidateLeaderboardCache(params.examId);
}

/**
 * Admin action: Flag an attempt or all attempts in a sitting as PLAGIARISM.
 * Audited and reversible.
 */
export async function flagPlagiarism(params: {
  examId: string;
  attemptId?: string;
  sessionId?: string;
  questionId?: string;
  adminId: string;
  note?: string;
}): Promise<void> {
  const { examId, attemptId, sessionId, questionId, adminId, note } = params;

  let targetAttempts: { id: string }[] = [];
  if (attemptId) {
    const att = await prisma.attempt.findFirst({ where: { id: attemptId, examId } });
    if (!att) throw notFound('Attempt not found for this exam.');
    targetAttempts = [{ id: attemptId }];
  } else if (sessionId) {
    const whereClause: { sessionId: string; examId: string; questionId?: string } = { sessionId, examId };
    if (questionId) whereClause.questionId = questionId;
    targetAttempts = await prisma.attempt.findMany({
      where: whereClause,
      select: { id: true },
    });
    if (targetAttempts.length === 0) throw notFound('No attempts found to flag.');
  } else {
    throw badRequest('Must provide attemptId or sessionId.');
  }

  for (const att of targetAttempts) {
    await prisma.attemptFlag.upsert({
      where: { attemptId_kind: { attemptId: att.id, kind: 'PLAGIARISM' } },
      create: { attemptId: att.id, kind: 'PLAGIARISM', setById: adminId, note: note ?? null },
      update: { setById: adminId, note: note ?? null },
    });

    await recordAudit({
      userId: adminId,
      action: 'exam.plagiarism_flagged',
      entity: 'Attempt',
      entityId: att.id,
      metadata: { examId, sessionId, note },
    });
  }

  invalidateLeaderboardCache(examId);
}

/**
 * Admin action: Clear plagiarism flag from an attempt or sitting.
 */
export async function clearPlagiarismFlag(params: {
  examId: string;
  attemptId?: string;
  sessionId?: string;
  questionId?: string;
  adminId: string;
}): Promise<void> {
  const { examId, attemptId, sessionId, questionId, adminId } = params;

  let attemptIds: string[] = [];
  if (attemptId) {
    attemptIds = [attemptId];
  } else if (sessionId) {
    const whereClause: { sessionId: string; examId: string; questionId?: string } = { sessionId, examId };
    if (questionId) whereClause.questionId = questionId;
    const atts = await prisma.attempt.findMany({ where: whereClause, select: { id: true } });
    attemptIds = atts.map((a) => a.id);
  }

  if (attemptIds.length > 0) {
    await prisma.attemptFlag.deleteMany({
      where: {
        attemptId: { in: attemptIds },
        kind: 'PLAGIARISM',
      },
    });

    for (const id of attemptIds) {
      await recordAudit({
        userId: adminId,
        action: 'exam.plagiarism_cleared',
        entity: 'Attempt',
        entityId: id,
        metadata: { examId, sessionId },
      });
    }
  }

  invalidateLeaderboardCache(examId);
}

/**
 * Admin action: Promote a similarity pair from the similarity report to PLAGIARISM flags with one click.
 * Audited and never auto-published.
 */
export async function promoteSimilarityPair(params: {
  examId: string;
  attemptAId: string;
  attemptBId: string;
  adminId: string;
  note?: string;
}): Promise<void> {
  const { examId, attemptAId, attemptBId, adminId, note } = params;

  const [attA, attB] = await Promise.all([
    prisma.attempt.findFirst({ where: { id: attemptAId, examId } }),
    prisma.attempt.findFirst({ where: { id: attemptBId, examId } }),
  ]);

  if (!attA || !attB) {
    throw notFound('One or both attempts in the similarity pair not found.');
  }

  const defaultNote = note ?? 'Promoted from similarity scan pair';

  await Promise.all([
    prisma.attemptFlag.upsert({
      where: { attemptId_kind: { attemptId: attemptAId, kind: 'PLAGIARISM' } },
      create: { attemptId: attemptAId, kind: 'PLAGIARISM', setById: adminId, note: defaultNote },
      update: { setById: adminId, note: defaultNote },
    }),
    prisma.attemptFlag.upsert({
      where: { attemptId_kind: { attemptId: attemptBId, kind: 'PLAGIARISM' } },
      create: { attemptId: attemptBId, kind: 'PLAGIARISM', setById: adminId, note: defaultNote },
      update: { setById: adminId, note: defaultNote },
    }),
  ]);

  await recordAudit({
    userId: adminId,
    action: 'exam.similarity_pair_promoted',
    entity: 'Exam',
    entityId: examId,
    metadata: { attemptAId, attemptBId, note: defaultNote },
  });

  invalidateLeaderboardCache(examId);
}

/**
 * Admin action: Freeze leaderboard at current instant.
 */
export async function freezeLeaderboardNow(examId: string, adminId: string): Promise<Date> {
  const frozenAt = new Date();
  await prisma.exam.update({
    where: { id: examId },
    data: { leaderboardFrozenAt: frozenAt },
  });

  await recordAudit({
    userId: adminId,
    action: 'exam.leaderboard_frozen',
    entity: 'Exam',
    entityId: examId,
    metadata: { frozenAt: frozenAt.toISOString() },
  });

  invalidateLeaderboardCache(examId);
  return frozenAt;
}

/**
 * Admin action: Publish final results.
 * Only allowed after the contest has ended. Freezes board and sets resultsPublishedAt.
 */
export async function publishFinalResults(
  examId: string,
  adminId: string,
): Promise<{ publishedAt: Date; frozenAt: Date }> {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw notFound('Exam not found.');

  const now = new Date();
  const hasEnded = (exam.endTime && now.getTime() >= exam.endTime.getTime()) || exam.status === 'ENDED';
  if (!hasEnded) {
    throw badRequest('Final results can only be published after the contest has ended.');
  }

  const frozenAt = exam.leaderboardFrozenAt ?? now;
  const publishedAt = now;

  await prisma.exam.update({
    where: { id: examId },
    data: {
      leaderboardFrozenAt: frozenAt,
      resultsPublishedAt: publishedAt,
    },
  });

  await recordAudit({
    userId: adminId,
    action: 'exam.final_results_published',
    entity: 'Exam',
    entityId: examId,
    metadata: { publishedAt: publishedAt.toISOString(), frozenAt: frozenAt.toISOString() },
  });

  invalidateLeaderboardCache(examId);
  return { publishedAt, frozenAt };
}

/**
 * Admin action: create or update an attempt flag (e.g. PLAGIARISM).
 */
export async function flagAttempt(params: {
  attemptId: string;
  kind: 'PLAGIARISM' | 'MANUAL_REVIEW';
  adminUserId: string;
  note?: string;
}) {
  invalidateLeaderboardCache();
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
  invalidateLeaderboardCache();
  return prisma.attemptFlag.deleteMany({
    where: {
      attemptId: params.attemptId,
      kind: params.kind,
    },
  });
}
