import { prisma } from '@/lib/prisma';
import { toCsv } from '@/lib/csv';
import { percentage } from '@/lib/utils';

export interface ResultFilter {
  examId?: string;
  batch?: string;
  q?: string;
  status?: 'SUBMITTED' | 'IN_PROGRESS' | 'ALL';
  minPercentage?: number;
}

export interface ResultRow {
  userId: string;
  studentName: string;
  studentEmail: string;
  batch: string | null;
  examId: string;
  examTitle: string;
  score: number;
  maxScore: number;
  percentage: number;
  submittedAt: string | null;
  questionsSubmitted: number;
  questionCount: number;
  violationCount: number;
  status: string;
}

/** Aggregate stored attempt scores per (student, exam). Never re-grades. */
export async function listResults(filter: ResultFilter = {}): Promise<ResultRow[]> {
  const attempts = await prisma.attempt.findMany({
    where: {
      ...(filter.examId ? { examId: filter.examId } : {}),
      ...(filter.status === 'SUBMITTED' ? { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } } : {}),
      ...(filter.status === 'IN_PROGRESS' ? { status: 'IN_PROGRESS' } : {}),
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
    },
    include: {
      user: { select: { id: true, name: true, email: true, batch: true } },
      exam: { select: { id: true, title: true, _count: { select: { questions: true } } } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 5000,
  });

  const grouped = new Map<string, ResultRow>();
  for (const a of attempts) {
    const key = `${a.userId}:${a.examId}`;
    const row =
      grouped.get(key) ??
      ({
        userId: a.userId,
        studentName: a.user.name ?? a.user.email,
        studentEmail: a.user.email,
        batch: a.user.batch,
        examId: a.examId,
        examTitle: a.exam.title,
        score: 0,
        maxScore: 0,
        percentage: 0,
        submittedAt: null,
        questionsSubmitted: 0,
        questionCount: a.exam._count.questions,
        violationCount: 0,
        status: 'IN_PROGRESS',
      } satisfies ResultRow);

    row.score += a.score;
    row.maxScore += a.maxScore;
    if (a.status !== 'IN_PROGRESS') {
      row.questionsSubmitted += 1;
      const at = a.submittedAt?.toISOString() ?? null;
      if (at && (!row.submittedAt || at > row.submittedAt)) row.submittedAt = at;
    }
    grouped.set(key, row);
  }

  const rows = [...grouped.values()];
  const keys = rows.map((r) => ({ userId: r.userId, examId: r.examId }));
  const violations = await prisma.proctorEvent.groupBy({
    by: ['userId', 'examId'],
    where: { violation: true, OR: keys.length ? keys : undefined },
    _count: { _all: true },
  });

  for (const row of rows) {
    row.percentage = percentage(row.score, row.maxScore);
    row.violationCount =
      violations.find((v) => v.userId === row.userId && v.examId === row.examId)?._count._all ?? 0;
    row.status =
      row.questionsSubmitted === 0
        ? 'NOT_STARTED'
        : row.questionsSubmitted >= row.questionCount
          ? 'COMPLETED'
          : 'PARTIAL';
  }

  const filtered =
    filter.minPercentage !== undefined ? rows.filter((r) => r.percentage >= (filter.minPercentage as number)) : rows;

  return filtered.sort((a, b) => b.percentage - a.percentage);
}

/** CSV export: assessment data only, never hidden test code or student source. */
export function resultsToCsv(rows: ResultRow[]): string {
  return toCsv(
    [
      'student_name',
      'student_email',
      'batch',
      'exam',
      'score',
      'max_score',
      'percentage',
      'questions_submitted',
      'question_count',
      'violations',
      'status',
      'submitted_at',
    ],
    rows.map((r) => [
      r.studentName,
      r.studentEmail,
      r.batch ?? '',
      r.examTitle,
      r.score,
      r.maxScore,
      r.percentage,
      r.questionsSubmitted,
      r.questionCount,
      r.violationCount,
      r.status,
      r.submittedAt ?? '',
    ]),
  );
}
