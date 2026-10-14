import { NextResponse } from 'next/server';
import { requireAuth, requireTestAccess } from '@/lib/authz';
import { handler, ok, tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { getExamLeaderboard } from '@/server/services/leaderboard';
import type { LeaderboardQuestionCell, LeaderboardQuestionConfig } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export interface SanitizedQuestionCell {
  state: string;
  tries: number;
  seconds: number;
  score: number;
}

export interface SanitizedLeaderboardRow {
  rank: number;
  handle: string;
  score: number;
  attemptsCount: number;
  effectiveSeconds: number;
  questions: Record<string, SanitizedQuestionCell>;
}

export interface SanitizedLeaderboardQuestion {
  n: number;
  title: string;
}

export interface SanitizedLeaderboardResponse {
  mode: string;
  frozen: boolean;
  isFinal: boolean;
  myRow: SanitizedLeaderboardRow | null;
  rows: SanitizedLeaderboardRow[];
  total: number;
  questions: SanitizedLeaderboardQuestion[];
}

function sanitizeCell(cell: LeaderboardQuestionCell): SanitizedQuestionCell {
  return {
    state: cell.state,
    tries: cell.tries,
    seconds: cell.seconds,
    score: cell.score,
  };
}

function sanitizeRow(
  row: {
    rank: number;
    handle: string;
    score: number;
    attemptsCount: number;
    effectiveSeconds: number;
    questions: Record<string, LeaderboardQuestionCell>;
  } | null,
  questionsConfig: LeaderboardQuestionConfig[],
): SanitizedLeaderboardRow | null {
  if (!row) return null;
  const questions: Record<string, SanitizedQuestionCell> = {};

  // Map cells by question order 'n' (1-indexed string e.g. "1", "2")
  for (const q of questionsConfig) {
    const rawCell = row.questions[q.id];
    if (rawCell) {
      questions[q.order.toString()] = sanitizeCell(rawCell);
    } else {
      questions[q.order.toString()] = {
        state: 'NOT_ATTEMPTED',
        tries: 0,
        seconds: 0,
        score: 0,
      };
    }
  }

  return {
    rank: row.rank,
    handle: row.handle,
    score: row.score,
    attemptsCount: row.attemptsCount,
    effectiveSeconds: row.effectiveSeconds,
    questions,
  };
}

export const GET = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const user = await requireAuth();
  const { id: examId } = await ctx.params;

  // Rate-limit per user (e.g. 60 requests per minute)
  const limit = await rateLimit(`leaderboard:${user.id}`, 60, 60_000);
  if (!limit.allowed) throw tooManyRequests('Too many leaderboard requests. Please slow down.');

  // Access check: non-assigned or non-permitted student receives 404 (notFound)
  const exam = await requireTestAccess(examId, user);

  // Parse search params: page and q
  const url = new URL(req.url);
  const pageParam = url.searchParams.get('page');
  const page = pageParam ? parseInt(pageParam, 10) || 1 : 1;
  const q = url.searchParams.get('q') || undefined;

  const result = await getExamLeaderboard({
    examId,
    requestingUserId: user.id,
    page,
    q,
    isAdmin: user.role === 'ADMIN',
  });

  const now = new Date();
  const frozen = Boolean(exam.leaderboardFrozenAt && now.getTime() >= exam.leaderboardFrozenAt.getTime());

  const questions: SanitizedLeaderboardQuestion[] = result.questions.map((q) => ({
    n: q.order,
    title: q.title || `Problem ${q.order}`,
  }));

  const sanitizedRows = result.rows.map((r) => sanitizeRow(r, result.questions)!);
  const sanitizedMyRow = sanitizeRow(result.userRow, result.questions);

  const response: SanitizedLeaderboardResponse = {
    mode: result.exam.leaderboardMode,
    frozen,
    isFinal: Boolean(result.exam.resultsPublishedAt),
    myRow: sanitizedMyRow,
    rows: sanitizedRows,
    total: result.pagination.total,
    questions,
  };

  return ok(response);
});
