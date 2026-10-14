import { prisma } from '@/lib/prisma';
import { toCsv } from '@/lib/csv';
import { marksToNumber } from '@/server/grading/marks';
import type { SittingState } from '../results';

export interface ContestCandidate {
  userId: string;
  sessionId: string;
  studentName: string;
  studentEmail: string;
  batch: string | null;
  score: number;
  maxScore: number;
  percentage: number;
  solvedCount: number;
  totalQuestions: number;
  lastAcceptedSubmissionAt: Date | null;
  violationCount: number;
  state: SittingState;
}

export interface ContestStandingRow extends ContestCandidate {
  rank: number;
  lastAcceptedSubmissionAtIso: string | null;
}

/**
 * Rank contest candidates:
 * 1. Score descending (highest score first)
 * 2. Earliest last-accepted-submission time (tie-breaker: who reached their score earliest)
 * 3. Total violation count ascending (fewer violations first)
 */
export function rankContestStandings(candidates: ContestCandidate[]): ContestStandingRow[] {
  const sorted = [...candidates].sort((a, b) => {
    // 1. Primary: Score descending
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    // 2. Secondary: Earliest last-accepted-submission time
    if (a.lastAcceptedSubmissionAt && b.lastAcceptedSubmissionAt) {
      const timeDiff = a.lastAcceptedSubmissionAt.getTime() - b.lastAcceptedSubmissionAt.getTime();
      if (timeDiff !== 0) return timeDiff;
    } else if (a.lastAcceptedSubmissionAt && !b.lastAcceptedSubmissionAt) {
      return -1;
    } else if (!a.lastAcceptedSubmissionAt && b.lastAcceptedSubmissionAt) {
      return 1;
    }

    // 3. Tertiary: Lowest violations
    if (a.violationCount !== b.violationCount) {
      return a.violationCount - b.violationCount;
    }

    // 4. Stable tie-break by name/email
    return a.studentName.localeCompare(b.studentName);
  });

  return sorted.map((item, index) => ({
    ...item,
    rank: index + 1,
    lastAcceptedSubmissionAtIso: item.lastAcceptedSubmissionAt ? item.lastAcceptedSubmissionAt.toISOString() : null,
  }));
}

/**
 * Export contest standings to CSV using formula-safe serialiser.
 */
export function contestResultsToCsv(rows: ContestStandingRow[]): string {
  const headers = [
    'rank',
    'student_name',
    'student_email',
    'batch',
    'score',
    'max_score',
    'percentage',
    'solved_count',
    'total_questions',
    'last_accepted_at',
    'violations',
    'status',
  ];

  const data = rows.map((r) => [
    r.rank,
    r.studentName,
    r.studentEmail,
    r.batch ?? '',
    r.score,
    r.maxScore,
    r.percentage,
    r.solvedCount,
    r.totalQuestions,
    r.lastAcceptedSubmissionAtIso ?? '',
    r.violationCount,
    r.state,
  ]);

  return toCsv(headers, data);
}

/**
 * Fetch and rank all students in an exam according to DSA contest rules.
 */
export async function getExamContestStandings(examId: string): Promise<ContestStandingRow[]> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      questions: true,
      sessions: {
        include: {
          user: { select: { id: true, name: true, email: true, batch: true } },
          attempts: {
            select: {
              id: true,
              score: true,
              maxScore: true,
              status: true,
              submittedAt: true,
              passedCount: true,
              enabledCount: true,
            },
          },
        },
      },
    },
  });

  if (!exam) {
    throw new Error('Exam not found.');
  }

  const totalQuestions = exam.questions.length;

  // Best sitting per user
  const candidates: ContestCandidate[] = [];

  // Group by user, pick best session (highest score, earliest on tie)
  const userSessionsMap = new Map<string, typeof exam.sessions>();
  for (const s of exam.sessions) {
    const list = userSessionsMap.get(s.userId) ?? [];
    list.push(s);
    userSessionsMap.set(s.userId, list);
  }

  for (const [, sessions] of userSessionsMap.entries()) {
    // Pick best sitting
    const bestSession = sessions.sort((a, b) => {
      const scoreA = a.score ? marksToNumber(a.score) : 0;
      const scoreB = b.score ? marksToNumber(b.score) : 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.startedAt.getTime() - b.startedAt.getTime();
    })[0]!;

    const score = bestSession.score ? marksToNumber(bestSession.score) : 0;
    const maxScore = marksToNumber(bestSession.maxScore);
    const percentage = bestSession.percentage ? marksToNumber(bestSession.percentage) : 0;

    // Determine solvedCount and lastAcceptedSubmissionAt
    let solvedCount = 0;
    let lastAcceptedTime: Date | null = null;

    for (const att of bestSession.attempts) {
      const attScore = marksToNumber(att.score);
      const attMax = marksToNumber(att.maxScore);
      if (attScore > 0 && attScore >= attMax) {
        solvedCount++;
      }
      if (attScore > 0 && att.submittedAt) {
        if (!lastAcceptedTime || att.submittedAt > lastAcceptedTime) {
          lastAcceptedTime = att.submittedAt;
        }
      }
    }

    candidates.push({
      userId: bestSession.user.id,
      sessionId: bestSession.id,
      studentName: bestSession.user.name ?? bestSession.user.email,
      studentEmail: bestSession.user.email,
      batch: bestSession.user.batch,
      score,
      maxScore,
      percentage,
      solvedCount,
      totalQuestions,
      lastAcceptedSubmissionAt: lastAcceptedTime,
      violationCount: bestSession.violationCount,
      state: bestSession.endedAt ? (bestSession.result ?? 'GRADING_PENDING') : 'IN_PROGRESS',
    });
  }

  return rankContestStandings(candidates);
}
