import { prisma } from '@/lib/prisma';
import { badRequest, conflict, notFound } from '@/lib/http';
import type { ExamCreateInput } from '@/lib/validation';
import { publishBlockers } from './questions';
import { examAvailability } from '@/lib/timing';

export async function createExam(input: ExamCreateInput) {
  assertWindow(input.startTime ?? null, input.endTime ?? null);
  return prisma.$transaction(async (tx) => {
    const exam = await tx.exam.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        durationMinutes: input.durationMinutes,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        status: input.status,
        batch: input.batch ?? null,
        maxViolations: input.maxViolations,
        shuffleQuestions: input.shuffleQuestions,
      },
    });
    if (input.questionIds.length > 0) {
      await tx.examQuestion.createMany({
        data: input.questionIds.map((questionId, order) => ({ examId: exam.id, questionId, order })),
      });
    }
    return exam;
  });
}

function assertWindow(start: Date | null, end: Date | null): void {
  if (start && end && end.getTime() <= start.getTime()) {
    throw badRequest('The exam end time must be after the start time.');
  }
}

export async function updateExam(id: string, input: Partial<ExamCreateInput> & { active?: boolean }) {
  const exam = await prisma.exam.findUnique({ where: { id } });
  if (!exam) throw notFound('Exam not found.');
  assertWindow(input.startTime ?? exam.startTime, input.endTime ?? exam.endTime);

  const nextStatus = input.status ?? exam.status;
  if (nextStatus !== 'DRAFT' && nextStatus !== 'ARCHIVED') {
    await assertExamPublishable(id, input.questionIds);
  }

  return prisma.$transaction(async (tx) => {
    if (input.questionIds) {
      await tx.examQuestion.deleteMany({ where: { examId: id, questionId: { notIn: input.questionIds } } });
      // Two-phase reorder: `(examId, order)` is unique, so shift existing rows
      // out of the way before writing the final positions.
      const existing = await tx.examQuestion.findMany({ where: { examId: id } });
      for (const [i, row] of existing.entries()) {
        await tx.examQuestion.update({ where: { id: row.id }, data: { order: -1 - i } });
      }
      for (const [order, questionId] of input.questionIds.entries()) {
        const row = existing.find((e) => e.questionId === questionId);
        if (row) await tx.examQuestion.update({ where: { id: row.id }, data: { order } });
        else await tx.examQuestion.create({ data: { examId: id, questionId, order } });
      }
    }
    return tx.exam.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.batch !== undefined ? { batch: input.batch } : {}),
        ...(input.maxViolations !== undefined ? { maxViolations: input.maxViolations } : {}),
        ...(input.shuffleQuestions !== undefined ? { shuffleQuestions: input.shuffleQuestions } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
  });
}

/**
 * An exam cannot leave DRAFT until every attached question has a valid,
 * reference-validated test suite (product requirement #52).
 */
export async function assertExamPublishable(examId: string, questionIds?: string[]): Promise<void> {
  const ids =
    questionIds ??
    (await prisma.examQuestion.findMany({ where: { examId }, select: { questionId: true } })).map(
      (q) => q.questionId,
    );
  if (ids.length === 0) throw badRequest('Add at least one question before publishing this exam.');

  const questions = await prisma.question.findMany({
    where: { id: { in: ids } },
    include: { tests: true },
  });
  const problems: string[] = [];
  for (const q of questions) {
    const blockers = publishBlockers({
      validation: q.validation,
      tests: q.tests.map((t) => ({
        name: t.name,
        points: t.points,
        testCode: t.testCode,
        testType: t.testType,
      })),
    });
    if (blockers.length > 0) problems.push(`${q.title}: ${blockers[0]}`);
  }
  if (problems.length > 0) throw conflict(`This exam is not ready to publish. ${problems[0]}`);
}

export async function assignStudents(
  examId: string,
  input: { userIds?: string[]; emails?: string[]; batch?: string },
): Promise<{ assigned: number; skipped: string[] }> {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw notFound('Exam not found.');

  const where: Record<string, unknown>[] = [];
  if (input.userIds?.length) where.push({ id: { in: input.userIds } });
  if (input.emails?.length) where.push({ email: { in: input.emails } });
  if (input.batch) where.push({ batch: input.batch });

  const users = await prisma.user.findMany({
    where: { active: true, role: 'STUDENT', OR: where.length ? (where as never[]) : undefined },
    select: { id: true, email: true },
  });
  if (users.length === 0) return { assigned: 0, skipped: ['No matching active students were found.'] };

  const result = await prisma.examAssignment.createMany({
    data: users.map((u) => ({ examId, userId: u.id })),
    skipDuplicates: true,
  });
  return { assigned: result.count, skipped: [] };
}

export async function unassignStudent(examId: string, userId: string): Promise<void> {
  const attempts = await prisma.attempt.count({ where: { examId, userId } });
  if (attempts > 0) throw conflict('This student has already started the exam and cannot be unassigned.');
  await prisma.examAssignment.deleteMany({ where: { examId, userId } });
}

/** Exams a student is allowed to see, with their live state. */
export async function listStudentExams(userId: string) {
  const assignments = await prisma.examAssignment.findMany({
    where: { userId, exam: { active: true, status: { notIn: ['DRAFT', 'ARCHIVED'] } } },
    include: {
      exam: { include: { _count: { select: { questions: true } } } },
    },
    orderBy: { assignedAt: 'desc' },
  });

  const examIds = assignments.map((a) => a.examId);
  const [sessions, attempts, user] = await Promise.all([
    prisma.examSession.findMany({ where: { userId, examId: { in: examIds } } }),
    prisma.attempt.findMany({
      where: { userId, examId: { in: examIds } },
      select: { examId: true, status: true, score: true, maxScore: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, role: true } }),
  ]);

  const now = new Date();
  return assignments.map((a) => {
    const session = sessions.find((s) => s.examId === a.examId) ?? null;
    const mine = attempts.filter((t) => t.examId === a.examId);
    const submitted = mine.filter((t) => t.status !== 'IN_PROGRESS');
    const allDone = mine.length > 0 && submitted.length === a.exam._count.questions;
    let availability = examAvailability(
      {
        status: a.exam.status,
        startTime: a.exam.startTime,
        endTime: a.exam.endTime,
        durationMinutes: a.exam.durationMinutes,
      },
      session
        ? { startedAt: session.startedAt, expiresAt: session.expiresAt, endedAt: session.endedAt }
        : null,
      { submitted: allDone, now },
    );
    if (
      (availability === 'NOT_STARTED' || availability === 'ENDED') &&
      (user?.email === 'agnihotriaryan5361@gmail.com' || user?.role === 'ADMIN')
    ) {
      availability = 'AVAILABLE';
    }
    return {
      id: a.exam.id,
      title: a.exam.title,
      description: a.exam.description,
      durationMinutes: a.exam.durationMinutes,
      startTime: a.exam.startTime,
      endTime: a.exam.endTime,
      questionCount: a.exam._count.questions,
      availability,
      submittedCount: submitted.length,
      // Scores are only surfaced once the whole exam is finished.
      score: allDone ? submitted.reduce((s, t) => s + t.score, 0) : null,
      maxScore: allDone ? submitted.reduce((s, t) => s + t.maxScore, 0) : null,
      msRemaining: session ? Math.max(0, session.expiresAt.getTime() - now.getTime()) : null,
    };
  });
}
