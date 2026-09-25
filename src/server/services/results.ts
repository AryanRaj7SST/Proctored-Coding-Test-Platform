import { Prisma, type ExamSession } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { notFound } from '@/lib/errors';
import { toCsv } from '@/lib/csv';
import { describeTestCase, validateTestCaseBody } from '@shared/test-spec';
import { marksToNumber } from '@/server/grading/marks';
import { enabledTests, snapshotOf, type QuestionSnapshot } from './questions';

/**
 * Results are per sitting (one attempt at a test). A student is judged by
 * their best graded sitting -- highest percentage, earliest on a tie -- so the
 * default view shows exactly that one row per student and test.
 */

export type SittingState = 'IN_PROGRESS' | 'GRADING_PENDING' | 'PASSED' | 'FAILED';

export interface ResultFilter {
  examId?: string;
  batch?: string;
  q?: string;
  state?: SittingState;
  /** 'best' (default): each student's best sitting per test; 'all': every sitting. */
  view?: 'best' | 'all';
  page?: number;
  pageSize?: number;
}

export interface ResultRow {
  sessionId: string;
  userId: string;
  studentName: string;
  studentEmail: string;
  batch: string | null;
  examId: string;
  examTitle: string;
  attemptNumber: number;
  state: SittingState;
  score: number | null;
  maxScore: number;
  percentage: number | null;
  result: 'PASSED' | 'FAILED' | null;
  startedAt: string;
  submittedAt: string | null;
  violationCount: number;
  /** How many sittings this student has for this test. */
  sittingCount: number;
}

function stateOf(s: Pick<ExamSession, 'endedAt' | 'result'>): SittingState {
  if (!s.endedAt) return 'IN_PROGRESS';
  if (!s.result) return 'GRADING_PENDING';
  return s.result;
}

function stateWhere(state: SittingState | undefined): Prisma.ExamSessionWhereInput {
  switch (state) {
    case 'IN_PROGRESS':
      return { endedAt: null };
    case 'GRADING_PENDING':
      return { endedAt: { not: null }, result: null };
    case 'PASSED':
    case 'FAILED':
      return { result: state };
    default:
      return {};
  }
}

/** Ids of each student's best sitting per test (graded first, then by percentage). */
async function bestSittingIds(examId?: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT ON ("userId", "examId") id
    FROM exam_sessions
    ${examId ? Prisma.sql`WHERE "examId" = ${examId}` : Prisma.empty}
    ORDER BY "userId", "examId", (result IS NULL), percentage DESC NULLS LAST, "attemptNumber" ASC`;
  return rows.map((r) => r.id);
}

/** The sitting a student is judged by for one test, or null before any. */
async function bestSittingId(userId: string, examId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM exam_sessions
    WHERE "userId" = ${userId} AND "examId" = ${examId}
    ORDER BY (result IS NULL), percentage DESC NULLS LAST, "attemptNumber" ASC
    LIMIT 1`;
  return rows[0]?.id ?? null;
}

export async function listResults(filter: ResultFilter = {}) {
  const page = filter.page ?? 1;
  const pageSize = Math.min(filter.pageSize ?? 50, 500);
  const where: Prisma.ExamSessionWhereInput = {
    ...(filter.examId ? { examId: filter.examId } : {}),
    ...stateWhere(filter.state),
    ...(filter.view !== 'all' ? { id: { in: await bestSittingIds(filter.examId) } } : {}),
    user: {
      ...(filter.batch ? { batch: filter.batch } : {}),
      ...(filter.q
        ? {
            OR: [
              { email: { contains: filter.q, mode: 'insensitive' as const } },
              { name: { contains: filter.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
  };
  const [total, sessions] = await Promise.all([
    prisma.examSession.count({ where }),
    prisma.examSession.findMany({
      where,
      orderBy: [
        { percentage: { sort: 'desc', nulls: 'last' } },
        { endedAt: { sort: 'desc', nulls: 'last' } },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, name: true, email: true, batch: true } },
        exam: { select: { id: true, title: true } },
      },
    }),
  ]);

  const counts = await prisma.examSession.groupBy({
    by: ['userId', 'examId'],
    where: { OR: sessions.map((s) => ({ userId: s.userId, examId: s.examId })) },
    _count: { _all: true },
  });
  const countOf = new Map(counts.map((c) => [`${c.userId}:${c.examId}`, c._count._all]));

  const rows: ResultRow[] = sessions.map((s) => ({
    sessionId: s.id,
    userId: s.userId,
    studentName: s.user.name ?? s.user.email,
    studentEmail: s.user.email,
    batch: s.user.batch,
    examId: s.examId,
    examTitle: s.exam.title,
    attemptNumber: s.attemptNumber,
    state: stateOf(s),
    score: s.score !== null ? marksToNumber(s.score) : null,
    maxScore: marksToNumber(s.maxScore),
    percentage: s.percentage !== null ? marksToNumber(s.percentage) : null,
    result: s.result,
    startedAt: s.startedAt.toISOString(),
    submittedAt: s.endedAt?.toISOString() ?? null,
    violationCount: s.violationCount,
    sittingCount: countOf.get(`${s.userId}:${s.examId}`) ?? 1,
  }));
  return { rows, total, page, pageSize };
}

/** Every row matching a filter (for export), fetched page by page. */
export async function listAllResults(filter: Omit<ResultFilter, 'page' | 'pageSize'>): Promise<ResultRow[]> {
  const rows: ResultRow[] = [];
  for (let page = 1; ; page += 1) {
    const batch = await listResults({ ...filter, page, pageSize: 500 });
    rows.push(...batch.rows);
    if (rows.length >= batch.total || batch.rows.length === 0) return rows;
  }
}

/** CSV export: assessment data only -- never student source or test internals. */
export function resultsToCsv(rows: ResultRow[]): string {
  return toCsv(
    [
      'student_name',
      'student_email',
      'batch',
      'test',
      'attempt',
      'state',
      'score',
      'max_score',
      'percentage',
      'result',
      'violations',
      'started_at',
      'submitted_at',
    ],
    rows.map((r) => [
      r.studentName,
      r.studentEmail,
      r.batch ?? '',
      r.examTitle,
      r.attemptNumber,
      r.state,
      r.score ?? '',
      r.maxScore,
      r.percentage ?? '',
      r.result ?? '',
      r.violationCount,
      r.startedAt,
      r.submittedAt ?? '',
    ]),
  );
}

/* ------------------------------------------------------------- drill-down */

async function loadSitting(sessionId: string) {
  const session = await prisma.examSession.findUnique({
    where: { id: sessionId },
    include: {
      user: { select: { id: true, name: true, email: true, batch: true } },
      exam: {
        select: {
          id: true,
          title: true,
          passingPercentage: true,
          resultVisibility: true,
          timezone: true,
          questions: { select: { questionId: true, order: true } },
        },
      },
      attempts: {
        include: {
          testResults: { where: { final: true }, orderBy: { createdAt: 'asc' } },
          _count: { select: { testRuns: true } },
        },
      },
    },
  });
  if (!session) throw notFound('Result not found.');
  const order = new Map(session.exam.questions.map((q) => [q.questionId, q.order]));
  session.attempts.sort((a, b) => (order.get(a.questionId) ?? 0) - (order.get(b.questionId) ?? 0));
  return session;
}

type LoadedSitting = Awaited<ReturnType<typeof loadSitting>>;
type LoadedAttempt = LoadedSitting['attempts'][number];

function sittingSummary(s: LoadedSitting) {
  return {
    sessionId: s.id,
    examId: s.exam.id,
    examTitle: s.exam.title,
    timezone: s.exam.timezone,
    attemptNumber: s.attemptNumber,
    state: stateOf(s),
    score: s.score !== null ? marksToNumber(s.score) : null,
    maxScore: marksToNumber(s.maxScore),
    percentage: s.percentage !== null ? marksToNumber(s.percentage) : null,
    result: s.result,
    passingPercentage: marksToNumber(s.exam.passingPercentage),
    startedAt: s.startedAt.toISOString(),
    submittedAt: s.endedAt?.toISOString() ?? null,
    gradedAt: s.gradedAt?.toISOString() ?? null,
  };
}

/** The readable definition of each graded test case, from the attempt's own snapshot. */
function definitionsOf(snapshot: QuestionSnapshot) {
  return new Map(
    enabledTests(snapshot).map((t) => {
      const body = validateTestCaseBody(t.testCode);
      const readable = body.ok && body.value ? describeTestCase(body.value) : { steps: [], checks: [] };
      return [
        t.name,
        { description: t.description, expectedBehavior: t.expectedBehavior ?? null, ...readable },
      ];
    }),
  );
}

function questionResult(a: LoadedAttempt) {
  const snapshot = snapshotOf(a);
  const definitions = definitionsOf(snapshot);
  const graded = a.status !== 'IN_PROGRESS' && a.gradedAt !== null;
  return {
    attemptId: a.id,
    questionId: a.questionId,
    title: snapshot.title,
    questionVersion: a.questionVersion,
    status: a.status,
    resultStatus: a.resultStatus,
    graded,
    score: graded ? marksToNumber(a.score) : null,
    maxScore: marksToNumber(a.maxScore),
    passedCount: a.passedCount,
    enabledCount: a.enabledCount,
    submittedAt: a.submittedAt?.toISOString() ?? null,
    gradedAt: a.gradedAt?.toISOString() ?? null,
    testCases: a.testResults.map((r) => ({
      testName: r.testName,
      passed: r.passed,
      points: marksToNumber(r.points),
      pointsAwarded: marksToNumber(r.pointsAwarded),
      message: r.message,
      expected: r.expected,
      actual: r.actual,
      durationMs: r.durationMs,
      definition: definitions.get(r.testName) ?? null,
    })),
  };
}

/**
 * Admin drill-down for one sitting: totals, every question with its test-case
 * results and the student's submitted code, plus the student's other sittings.
 */
export async function getSittingResultForAdmin(sessionId: string) {
  const s = await loadSitting(sessionId);
  const reviewerIds = s.attempts.flatMap((a) => (a.reviewedById ? [a.reviewedById] : []));
  const [others, best, reviewers] = await Promise.all([
    prisma.examSession.findMany({
      where: { userId: s.userId, examId: s.examId, id: { not: s.id } },
      orderBy: { attemptNumber: 'asc' },
      select: { id: true, attemptNumber: true, percentage: true, result: true, endedAt: true },
    }),
    bestSittingId(s.userId, s.examId),
    reviewerIds.length
      ? prisma.user.findMany({
          where: { id: { in: reviewerIds } },
          select: { id: true, name: true, email: true },
        })
      : [],
  ]);
  const reviewerName = new Map(reviewers.map((r) => [r.id, r.name ?? r.email]));
  return {
    ...sittingSummary(s),
    /** The sitting that counts for this student (best graded, earliest on a tie). */
    bestSessionId: best,
    isBest: best === s.id,
    student: s.user,
    violationCount: s.violationCount,
    otherSittings: others.map((o) => ({
      sessionId: o.id,
      attemptNumber: o.attemptNumber,
      percentage: o.percentage !== null ? marksToNumber(o.percentage) : null,
      result: o.result,
      submittedAt: o.endedAt?.toISOString() ?? null,
    })),
    questions: s.attempts.map((a) => ({
      ...questionResult(a),
      code: { html: a.html, css: a.css, js: a.js },
      gradingError: a.gradingError,
      reviewFeedback: a.reviewFeedback,
      reviewedAt: a.reviewedAt?.toISOString() ?? null,
      reviewerName: a.reviewedById ? (reviewerName.get(a.reviewedById) ?? null) : null,
      starter: (() => {
        const snap = snapshotOf(a);
        return { html: snap.starterHtml, css: snap.starterCss, js: snap.starterJs };
      })(),
      runCount: a._count.testRuns,
    })),
  };
}

/**
 * A student's own result, shaped by the test's result visibility:
 *   HIDDEN      only that the sitting was submitted
 *   SCORE_ONLY  totals and PASS/FAIL
 *   FULL        plus each question and test case (definitions + outcomes)
 * Nothing is shown until the sitting is finished; the reference solution,
 * runner internals and other students' data are never included.
 */
export async function getSittingResultForStudent(sessionId: string, userId: string) {
  const s = await loadSitting(sessionId);
  if (s.userId !== userId) throw notFound('Result not found.');
  const summary = sittingSummary(s);
  const visibility = s.exam.resultVisibility;
  const base = {
    sessionId: summary.sessionId,
    examId: summary.examId,
    examTitle: summary.examTitle,
    attemptNumber: summary.attemptNumber,
    state: summary.state,
    submittedAt: summary.submittedAt,
    visibility,
  };
  if (visibility === 'HIDDEN' || summary.state === 'IN_PROGRESS')
    return { ...base, totals: null, questions: null };

  const totals = {
    score: summary.score,
    maxScore: summary.maxScore,
    percentage: summary.percentage,
    result: summary.result,
    passingPercentage: summary.passingPercentage,
  };
  if (visibility === 'SCORE_ONLY') return { ...base, totals, questions: null };
  return {
    ...base,
    totals,
    questions: s.attempts.map((a) => ({ ...questionResult(a), feedback: a.reviewFeedback })),
  };
}

/** A student's own sittings, newest first, with scores only where the test shows them. */
export async function listMySittings(userId: string) {
  const sessions = await prisma.examSession.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: 200,
    include: { exam: { select: { id: true, title: true, resultVisibility: true } } },
  });
  return sessions.map((s) => {
    const show = s.exam.resultVisibility !== 'HIDDEN' && s.result !== null;
    return {
      sessionId: s.id,
      examTitle: s.exam.title,
      attemptNumber: s.attemptNumber,
      state: stateOf(s),
      startedAt: s.startedAt.toISOString(),
      submittedAt: s.endedAt?.toISOString() ?? null,
      score: show ? marksToNumber(s.score!) : null,
      maxScore: show ? marksToNumber(s.maxScore) : null,
      percentage: show ? marksToNumber(s.percentage!) : null,
      result: show ? s.result : null,
      resultsHidden: s.exam.resultVisibility === 'HIDDEN',
    };
  });
}
