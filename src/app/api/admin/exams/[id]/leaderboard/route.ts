import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { handler, ok, badRequest, readJson } from '@/lib/http';
import { recordAudit } from '@/server/services/audit';
import {
  getAdminExamLeaderboard,
  exportAdminLeaderboardToCsv,
  disqualifySession,
  undisqualifySession,
  flagPlagiarism,
  clearPlagiarismFlag,
  promoteSimilarityPair,
  freezeLeaderboardNow,
  publishFinalResults,
} from '@/server/services/leaderboard';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id: examId } = await ctx.params;
  const url = new URL(req.url);
  const format = url.searchParams.get('format');
  const q = url.searchParams.get('q') || undefined;
  const pageParam = url.searchParams.get('page');
  const page = pageParam ? parseInt(pageParam, 10) || 1 : 1;
  const pageSizeParam = url.searchParams.get('pageSize');
  const pageSize = pageSizeParam ? parseInt(pageSizeParam, 10) || 50 : 50;

  if (format === 'csv') {
    const csv = await exportAdminLeaderboardToCsv(examId);
    const stamp = new Date().toISOString().slice(0, 10);

    await recordAudit({
      userId: admin.id,
      action: 'exam.leaderboard_exported',
      entity: 'Exam',
      entityId: examId,
      metadata: { format: 'csv' },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="admin-leaderboard-${examId}-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const result = await getAdminExamLeaderboard({
    examId,
    q,
    page,
    pageSize,
  });

  await recordAudit({
    userId: admin.id,
    action: 'exam.admin_leaderboard_viewed',
    entity: 'Exam',
    entityId: examId,
    metadata: { total: result.total, page, pageSize },
  });

  return ok(result);
});

export const POST = handler(async (req: Request, ctx: Ctx): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const { id: examId } = await ctx.params;
  const body = await readJson(req);

  if (!body || typeof body !== 'object' || !('action' in body)) {
    throw badRequest('Missing action in request body.');
  }

  const payload = body as Record<string, unknown>;
  const action = payload.action as string;

  switch (action) {
    case 'disqualify': {
      const sessionId = payload.sessionId as string;
      if (!sessionId) throw badRequest('Missing sessionId for disqualify action.');
      const reason = payload.reason as string | undefined;
      await disqualifySession({ examId, sessionId, adminId: admin.id, reason });
      return ok({ success: true, action: 'disqualify', sessionId });
    }

    case 'undisqualify': {
      const sessionId = payload.sessionId as string;
      if (!sessionId) throw badRequest('Missing sessionId for undisqualify action.');
      await undisqualifySession({ examId, sessionId, adminId: admin.id });
      return ok({ success: true, action: 'undisqualify', sessionId });
    }

    case 'flag_plagiarism': {
      const attemptId = payload.attemptId as string | undefined;
      const sessionId = payload.sessionId as string | undefined;
      const questionId = payload.questionId as string | undefined;
      const note = payload.note as string | undefined;
      if (!attemptId && !sessionId) {
        throw badRequest('Must provide attemptId or sessionId.');
      }
      await flagPlagiarism({ examId, attemptId, sessionId, questionId, adminId: admin.id, note });
      return ok({ success: true, action: 'flag_plagiarism', attemptId, sessionId });
    }

    case 'clear_flag': {
      const attemptId = payload.attemptId as string | undefined;
      const sessionId = payload.sessionId as string | undefined;
      const questionId = payload.questionId as string | undefined;
      if (!attemptId && !sessionId) {
        throw badRequest('Must provide attemptId or sessionId.');
      }
      await clearPlagiarismFlag({ examId, attemptId, sessionId, questionId, adminId: admin.id });
      return ok({ success: true, action: 'clear_flag', attemptId, sessionId });
    }

    case 'promote_similarity_pair': {
      const attemptAId = payload.attemptAId as string;
      const attemptBId = payload.attemptBId as string;
      const note = payload.note as string | undefined;
      if (!attemptAId || !attemptBId) {
        throw badRequest('Must provide both attemptAId and attemptBId.');
      }
      await promoteSimilarityPair({ examId, attemptAId, attemptBId, adminId: admin.id, note });
      return ok({ success: true, action: 'promote_similarity_pair', attemptAId, attemptBId });
    }

    case 'freeze_now': {
      const frozenAt = await freezeLeaderboardNow(examId, admin.id);
      return ok({ success: true, action: 'freeze_now', frozenAt });
    }

    case 'publish_final': {
      const result = await publishFinalResults(examId, admin.id);
      return ok({ success: true, action: 'publish_final', ...result });
    }

    default:
      throw badRequest(`Unknown action: ${action}`);
  }
});
