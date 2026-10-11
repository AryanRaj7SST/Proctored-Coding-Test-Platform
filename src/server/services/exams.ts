import { Prisma, type Exam } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { badRequest, conflict, notFound } from '@/lib/errors';
import type { ExamCreateInput, ExamUpdateInput } from '@/lib/validation';
import { examAvailability, testPhase, unboundedWindow, type TestPhase } from '@/lib/timing';
import { marksToNumber, toMicro, totalOf, fromMicro } from '@/server/grading/marks';
import { refreshSittingTotals } from '@/server/grading/sitting-totals';
import { buildSnapshot } from './questions';
import { finalizeOverdueSittings } from './finalization';
import { hasOpenTestAccess } from './sessions';

/**
 * Tests ("exams" in the schema): building, scheduling, publishing.
 *
 * A test is built from PUBLISHED questions; each keeps its own marks in this
 * test (ExamQuestion.marks, defaulting to the question's marks). Publishing
 * pins every question's snapshot, so later question edits never change what
 * the test grades. Once anyone has started the test, its questions and marks
 * are locked -- scores already awarded must stay comparable.
 */

type TestQuestionInput = { questionId: string; marks?: string };

/** Resolve question marks (explicit or each question's default) and check the questions exist. */
async function resolveQuestions(tx: Prisma.TransactionClient, input: TestQuestionInput[]) {
  if (input.length === 0) return [];
  const rows = await tx.question.findMany({
    where: { id: { in: input.map((q) => q.questionId) } },
    select: { id: true, title: true, marks: true, status: true },
  });
  const byId = new Map(rows.map((q) => [q.id, q]));
  return input.map((q, order) => {
    const question = byId.get(q.questionId);
    if (!question) throw badRequest('One of the selected questions no longer exists.');
    if (question.status === 'ARCHIVED')
      throw conflict(`"${question.title}" is archived and cannot be added.`);
    return { questionId: q.questionId, order, marks: q.marks ?? question.marks.toFixed(2) };
  });
}

/** Replace a test's question list (order and marks) in two phases: (examId, order) is unique. */
async function writeQuestions(tx: Prisma.TransactionClient, examId: string, input: TestQuestionInput[]) {
  const resolved = await resolveQuestions(tx, input);
  await tx.examQuestion.deleteMany({
    where: { examId, questionId: { notIn: resolved.map((q) => q.questionId) } },
  });
  const existing = await tx.examQuestion.findMany({ where: { examId } });
  for (const [i, row] of existing.entries()) {
    await tx.examQuestion.update({ where: { id: row.id }, data: { order: -1 - i } });
  }
  for (const q of resolved) {
    const row = existing.find((e) => e.questionId === q.questionId);
    if (row)
      await tx.examQuestion.update({ where: { id: row.id }, data: { order: q.order, marks: q.marks } });
    else await tx.examQuestion.create({ data: { examId, ...q } });
  }
}

const settingsData = (input: ExamUpdateInput) => ({
  ...(input.title !== undefined ? { title: input.title } : {}),
  ...(input.description !== undefined ? { description: input.description || null } : {}),
  ...(input.instructions !== undefined ? { instructions: input.instructions || null } : {}),
  ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
  ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
  ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
  ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
  ...(input.batch !== undefined ? { batch: input.batch || null } : {}),
  ...(input.accessMode !== undefined ? { accessMode: input.accessMode } : {}),
  ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
  ...(input.passingPercentage !== undefined ? { passingPercentage: input.passingPercentage } : {}),
  ...(input.resultVisibility !== undefined ? { resultVisibility: input.resultVisibility } : {}),
  ...(input.maxViolations !== undefined ? { maxViolations: input.maxViolations } : {}),
  ...(input.shuffleQuestions !== undefined ? { shuffleQuestions: input.shuffleQuestions } : {}),
});

/** A new test is always a DRAFT. */
export async function createExam(input: ExamCreateInput): Promise<Exam> {
  return prisma.$transaction(async (tx) => {
    const exam = await tx.exam.create({
      data: { ...settingsData(input), title: input.title, status: 'DRAFT' },
    });
    await writeQuestions(tx, exam.id, input.questions);
    return exam;
  });
}

export interface ExamChange {
  exam: Exam;
  /** What changed, for the audit log. */
  changed: string[];
}

/**
 * Edit a test's settings and/or questions. Questions and marks are locked
 * once any sitting exists; a changed pass mark re-evaluates PASS/FAIL of
 * graded sittings; schedule and access changes apply to new sittings.
 */
export async function updateExam(id: string, input: ExamUpdateInput): Promise<ExamChange> {
  const exam = await prisma.exam.findUnique({ where: { id }, include: { questions: true } });
  if (!exam) throw notFound('Test not found.');
  if (exam.status === 'ARCHIVED') throw conflict('Restore this test before editing it.');
  const start = input.startTime !== undefined ? input.startTime : exam.startTime;
  const end = input.endTime !== undefined ? input.endTime : exam.endTime;
  if (start && end && end.getTime() <= start.getTime())
    throw badRequest('The end time must be after the start time.');

  const questionsChanged = input.questions !== undefined && !sameQuestions(exam.questions, input.questions);
  if (questionsChanged) {
    const sittings = await prisma.examSession.count({ where: { examId: id } });
    if (sittings > 0) {
      throw conflict('Students have already started this test, so its questions and marks are locked.');
    }
  }

  const changed = diffSettings(exam, input);
  if (questionsChanged) changed.push('questions');

  const updated = await prisma.$transaction(async (tx) => {
    if (questionsChanged) {
      await writeQuestions(tx, id, input.questions!);
      // A published test that nobody has started re-pins its (new) question list.
      if (exam.status === 'PUBLISHED') await pinSnapshots(tx, id, { repin: true });
    }
    return tx.exam.update({ where: { id }, data: settingsData(input) });
  });

  if (changed.includes('passingPercentage')) {
    const graded = await prisma.examSession.findMany({
      where: { examId: id, endedAt: { not: null } },
      select: { id: true },
    });
    for (const s of graded) await refreshSittingTotals(s.id);
  }
  return { exam: updated, changed };
}

function sameQuestions(
  stored: { questionId: string; order: number; marks: Prisma.Decimal }[],
  input: TestQuestionInput[],
) {
  const current = [...stored].sort((a, b) => a.order - b.order);
  return (
    current.length === input.length &&
    current.every(
      (q, i) =>
        q.questionId === input[i]!.questionId &&
        (input[i]!.marks === undefined || toMicro(q.marks) === toMicro(input[i]!.marks!)),
    )
  );
}

const SCHEDULE_FIELDS = ['startTime', 'endTime', 'durationMinutes', 'timezone'] as const;

function diffSettings(exam: Exam, input: ExamUpdateInput): string[] {
  const changed: string[] = [];
  const same = (a: unknown, b: unknown) =>
    a instanceof Date || b instanceof Date
      ? (a as Date | null)?.getTime?.() === (b as Date | null)?.getTime?.()
      : String(a ?? '') === String(b ?? '');
  for (const key of Object.keys(settingsData(input)) as (keyof Exam)[]) {
    const incoming = (input as Record<string, unknown>)[key];
    const stored = key === 'passingPercentage' ? exam.passingPercentage.toFixed(2) : exam[key];
    const normalized =
      key === 'passingPercentage' && incoming !== undefined ? Number(incoming).toFixed(2) : incoming;
    if (!same(normalized, stored)) changed.push(key);
  }
  if (changed.some((k) => (SCHEDULE_FIELDS as readonly string[]).includes(k))) changed.push('schedule');
  return changed;
}

/**
 * Freeze each question's current content and tests on the test. `repin`
 * refreshes existing pins (only ever used before anyone has started).
 */
async function pinSnapshots(tx: Prisma.TransactionClient, examId: string, opts: { repin: boolean }) {
  const rows = await tx.examQuestion.findMany({
    where: { examId, ...(opts.repin ? {} : { snapshot: { equals: Prisma.DbNull } }) },
    include: { question: { include: { tests: { orderBy: { order: 'asc' } } } } },
  });
  const now = new Date();
  for (const row of rows) {
    const snapshot = buildSnapshot(row.question);
    await tx.examQuestion.update({
      where: { id: row.id },
      data: {
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        questionVersion: snapshot.version,
        pinnedAt: now,
      },
    });
  }
}

/** Why a test cannot be published yet (empty when it can). */
export async function examPublishBlockers(examId: string): Promise<string[]> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { questions: { include: { question: { select: { title: true, status: true } } } } },
  });
  if (!exam) throw notFound('Test not found.');
  const blockers: string[] = [];
  if (exam.questions.length === 0) blockers.push('Add at least one question.');
  for (const q of exam.questions) {
    if (q.question.status !== 'PUBLISHED') {
      blockers.push(`"${q.question.title}" is not published (it is ${q.question.status.toLowerCase()}).`);
    }
    if (toMicro(q.marks) <= 0) blockers.push(`"${q.question.title}" needs marks greater than 0.`);
  }
  if (exam.endTime && exam.endTime.getTime() <= Date.now())
    blockers.push('The end time is already in the past.');
  return blockers;
}

export type ExamStatusAction = 'publish' | 'unpublish' | 'close' | 'archive' | 'unarchive';

/**
 * Lifecycle: DRAFT -> PUBLISHED (checked, pins snapshots) -> ENDED ("close
 * now", finalises open sittings) -> ARCHIVED. Unpublishing is only possible
 * while nobody has started; after that, close or archive instead.
 */
export async function changeExamStatus(id: string, action: ExamStatusAction): Promise<Exam> {
  const exam = await prisma.exam.findUnique({ where: { id } });
  if (!exam) throw notFound('Test not found.');

  switch (action) {
    case 'publish': {
      if (exam.status === 'PUBLISHED') return exam;
      if (exam.status !== 'DRAFT') throw conflict('Only a draft test can be published.');
      const blockers = await examPublishBlockers(id);
      if (blockers.length > 0) throw conflict(`This test is not ready to publish. ${blockers[0]}`);
      return prisma.$transaction(async (tx) => {
        await pinSnapshots(tx, id, { repin: true });
        return tx.exam.update({
          where: { id },
          data: { status: 'PUBLISHED', publishedAt: new Date(), active: true },
        });
      });
    }
    case 'unpublish': {
      if (exam.status !== 'PUBLISHED') throw conflict('Only a published test can be unpublished.');
      if ((await prisma.examSession.count({ where: { examId: id } })) > 0) {
        throw conflict('Students have already started this test. Close or archive it instead.');
      }
      return prisma.exam.update({ where: { id }, data: { status: 'DRAFT', active: false } });
    }
    case 'close': {
      if (exam.status !== 'PUBLISHED') throw conflict('Only a published test can be closed.');
      const closed = await prisma.exam.update({ where: { id }, data: { status: 'ENDED' } });
      // Open sittings are finalised (graded) now rather than on their next heartbeat.
      await finalizeOverdueSittings({ examId: id, limit: 500 });
      return closed;
    }
    case 'archive':
      if (exam.status === 'ARCHIVED') return exam;
      if (
        exam.status === 'PUBLISHED' &&
        (await prisma.examSession.count({ where: { examId: id, endedAt: null } })) > 0
      ) {
        throw conflict('Students are taking this test right now. Close it first.');
      }
      return prisma.exam.update({ where: { id }, data: { status: 'ARCHIVED' } });
    case 'unarchive':
      if (exam.status !== 'ARCHIVED') throw conflict('This test is not archived.');
      return prisma.exam.update({
        where: { id },
        data: { status: exam.publishedAt ? 'ENDED' : 'DRAFT' },
      });
  }
}

/** Delete a test that nobody has started; otherwise archive it so results survive. */
export async function deleteExam(id: string): Promise<void> {
  if ((await prisma.examSession.count({ where: { examId: id } })) > 0) {
    throw conflict('Students have started this test. Archive it instead so results stay intact.');
  }
  await prisma.exam.delete({ where: { id } });
}

/* ------------------------------------------------------------------ reads */

/** Prisma filter matching a derived test phase at `now` (see testPhase). */
export function phaseWhere(phase: TestPhase | undefined, now: Date): Prisma.ExamWhereInput {
  switch (phase) {
    case 'DRAFT':
      return { status: 'DRAFT' };
    case 'ARCHIVED':
      return { status: 'ARCHIVED' };
    case 'UPCOMING':
      return { status: 'PUBLISHED', startTime: { gt: now } };
    case 'ACTIVE':
      return {
        status: 'PUBLISHED',
        AND: [
          { OR: [{ startTime: null }, { startTime: { lte: now } }] },
          { OR: [{ endTime: null }, { endTime: { gte: now } }] },
        ],
      };
    case 'ENDED':
      return { OR: [{ status: 'ENDED' }, { status: 'PUBLISHED', endTime: { lt: now } }] };
    default:
      return {};
  }
}

/** Admin test list, filterable by derived phase. */
export async function listExamsForAdmin(filter: {
  page: number;
  pageSize: number;
  q?: string;
  phase?: TestPhase;
}) {
  const now = new Date();
  const where: Prisma.ExamWhereInput = {
    ...phaseWhere(filter.phase, now),
    ...(filter.q ? { title: { contains: filter.q, mode: 'insensitive' } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.exam.count({ where }),
    prisma.exam.findMany({
      where,
      orderBy: [{ startTime: 'desc' }, { createdAt: 'desc' }],
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      include: {
        questions: { select: { marks: true } },
        _count: { select: { assignments: { where: { revokedAt: null } }, sessions: true } },
      },
    }),
  ]);
  return {
    items: rows.map(({ questions, _count, passingPercentage, ...exam }) => ({
      ...exam,
      passingPercentage: marksToNumber(passingPercentage),
      phase: testPhase(exam, now),
      questionCount: questions.length,
      totalMarks: marksToNumber(fromMicro(totalOf(questions.map((q) => toMicro(q.marks))))),
      assignedCount: _count.assignments,
      sittingCount: _count.sessions,
    })),
    total,
    page: filter.page,
    pageSize: filter.pageSize,
  };
}

/** Everything the test builder needs about one test. */
export async function getExamForAdmin(id: string) {
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: {
          question: {
            select: {
              id: true,
              title: true,
              slug: true,
              difficulty: true,
              category: true,
              tags: true,
              status: true,
              marks: true,
              version: true,
              _count: { select: { tests: { where: { enabled: true } } } },
            },
          },
        },
      },
      _count: { select: { sessions: true, assignments: { where: { revokedAt: null } } } },
    },
  });
  if (!exam) throw notFound('Test not found.');
  const { questions, _count, passingPercentage, ...rest } = exam;
  return {
    ...rest,
    passingPercentage: marksToNumber(passingPercentage),
    phase: testPhase(exam),
    sittingCount: _count.sessions,
    assignedCount: _count.assignments,
    locked: _count.sessions > 0,
    totalMarks: marksToNumber(fromMicro(totalOf(questions.map((q) => toMicro(q.marks))))),
    questions: questions.map((q) => ({
      questionId: q.questionId,
      order: q.order,
      marks: marksToNumber(q.marks),
      pinnedVersion: q.questionVersion,
      pinnedAt: q.pinnedAt,
      title: q.question.title,
      slug: q.question.slug,
      difficulty: q.question.difficulty,
      category: q.question.category,
      tags: q.question.tags,
      status: q.question.status,
      currentVersion: q.question.version,
      defaultMarks: marksToNumber(q.question.marks),
      enabledTests: q.question._count.tests,
    })),
    blockers: exam.status === 'DRAFT' ? await examPublishBlockers(id) : [],
  };
}

export interface ListStudentExamsOptions {
  user?: { email?: string | null; role?: string | null } | null;
  alreadyFinalized?: boolean;
}

/** Tests a student can see, with their live state. */
export async function listStudentExams(
  userId: string,
  options?: ListStudentExamsOptions,
) {
  // A sitting the student abandoned (closed tab, lost session) is finalised
  // here, so its work is graded without the student reopening the test.
  if (!options?.alreadyFinalized) {
    await finalizeOverdueSittings({ userId });
  }

  const [user, assignments, sessions] = await Promise.all([
    options?.user !== undefined
      ? options.user
      : prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true } }),
    prisma.examAssignment.findMany({ where: { userId }, select: { examId: true, revokedAt: true } }),
    prisma.examSession.findMany({
      where: { userId },
      orderBy: { attemptNumber: 'desc' },
      include: { attempts: { select: { status: true, gradedAt: true } } },
    }),
  ]);
  // Same rule as requireTestAccess: open tests plus assigned ones, minus any
  // test whose access an administrator revoked for this student.
  const revoked = assignments.filter((a) => a.revokedAt).map((a) => a.examId);
  const assigned = assignments.filter((a) => !a.revokedAt).map((a) => a.examId);
  const activeSessions = sessions.filter((s) => s.status === 'ACTIVE' && s.endedAt === null);
  const inProgressExamIds = activeSessions.map((s) => s.examId);

  const exams = await prisma.exam.findMany({
    where: {
      id: { notIn: revoked },
      OR: [
        {
          active: true,
          status: { notIn: ['DRAFT', 'ARCHIVED'] },
          OR: [{ accessMode: 'ANY_AUTHENTICATED_USER' }, { id: { in: assigned } }],
        },
        ...(inProgressExamIds.length > 0 ? [{ id: { in: inProgressExamIds } }] : []),
      ],
    },
    include: { questions: { select: { marks: true } } },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'desc' }],
  });

  const now = new Date();
  const openAccess = hasOpenTestAccess(user);
  return exams.map((exam) => {
    const mine = sessions.filter((s) => s.examId === exam.id);
    const current = mine[0] ?? null;
    const attemptsUsed = current?.attemptNumber ?? 0;
    const window = {
      status: exam.status,
      startTime: exam.startTime,
      endTime: exam.endTime,
      durationMinutes: exam.durationMinutes,
    };
    // Same rule as getExamTimeState: open test access ignores the window and the attempt limit.
    const availability = examAvailability(
      openAccess ? unboundedWindow(window) : window,
      current
        ? { startedAt: current.startedAt, expiresAt: current.expiresAt, endedAt: current.endedAt }
        : null,
      {
        now,
        attemptsRemaining: openAccess
          ? Number.POSITIVE_INFINITY
          : Math.max(0, exam.maxAttempts - attemptsUsed),
      },
    );
    const gradingPending = current
      ? current.attempts.filter((a) => a.status !== 'IN_PROGRESS' && !a.gradedAt).length
      : 0;
    // The result a student is judged by: their best graded sitting.
    const best = mine
      .filter((s) => s.result !== null && s.score !== null)
      .sort((a, b) => Number(b.percentage) - Number(a.percentage) || a.attemptNumber - b.attemptNumber)[0];
    const showScore = exam.resultVisibility !== 'HIDDEN';
    return {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      durationMinutes: exam.durationMinutes,
      startTime: exam.startTime,
      endTime: exam.endTime,
      timezone: exam.timezone,
      questionCount: exam.questions.length,
      totalMarks: marksToNumber(fromMicro(totalOf(exam.questions.map((q) => toMicro(q.marks))))),
      phase: testPhase(exam, now),
      availability,
      maxAttempts: exam.maxAttempts,
      attemptsUsed,
      gradingPending,
      resultVisibility: exam.resultVisibility,
      bestSessionId: best?.id ?? null,
      latestSessionId: current?.id ?? null,
      latestEnded: Boolean(current?.endedAt),
      // Scores only for a finished, fully graded sitting -- and only when the
      // test shows them. An ungraded attempt never reads as a 0.
      score: best && showScore ? marksToNumber(best.score!) : null,
      maxScore: best && showScore ? marksToNumber(best.maxScore) : null,
      percentage: best && showScore ? marksToNumber(best.percentage!) : null,
      result: best && showScore ? best.result : null,
      msRemaining:
        current && !current.endedAt ? Math.max(0, current.expiresAt.getTime() - now.getTime()) : null,
    };
  });
}
