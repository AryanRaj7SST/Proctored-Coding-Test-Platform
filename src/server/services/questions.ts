import { Prisma, type Attempt, type QuestionTest } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { badRequest, conflict, notFound } from '@/lib/errors';
import type { QuestionCreateInput, QuestionTestInput } from '@/lib/validation';
import { questionChangeImpact } from '@/lib/question-changes';
import {
  marksToNumber,
  microToNumber,
  testCaseShare,
  toMicro,
  type DecimalLike,
} from '@/server/grading/marks';
import {
  describeTestCase,
  validateTestCaseBody,
  validateTestSuiteShape,
  DEFAULT_VIEWPORT,
  type RunnerSpec,
  type RunnerTest,
} from '@shared/test-spec';

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || 'question'
  );
}

export async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const existing = await prisma.question.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/**
 * Compile stored test rows into the payload handed to the runner.
 * The server ALWAYS builds this from the question the attempt belongs to --
 * a student can never name, choose, or influence which spec is executed
 * (product requirement #15).
 */
export function compileRunnerSpec(
  tests: (Pick<QuestionTest, 'id' | 'name' | 'testCode' | 'testType' | 'order'> & {
    enabled?: boolean;
    hidden?: boolean;
  })[],
): RunnerSpec {
  const ordered = tests.filter(isEnabled).sort((a, b) => a.order - b.order);
  const runnerTests: RunnerTest[] = [];
  for (const t of ordered) {
    // Never skip a test silently: it would still count towards the maximum.
    if (t.testType !== 'DECLARATIVE') throw badRequest(`Test "${t.name}" uses an unsupported test type.`);
    const body = validateTestCaseBody(t.testCode);
    if (!body.ok || !body.value) {
      throw badRequest(`Test "${t.name}" has an invalid specification: ${body.errors.join('; ')}`);
    }
    // Marks are applied by the grading engine, not the runner; hidden flag passed through.
    runnerTests.push({ id: t.id, name: t.name, points: 0, hidden: Boolean(t.hidden), ...body.value });
  }
  if (runnerTests.length === 0) throw badRequest('This question has no enabled test cases.');
  return { version: 1, viewport: DEFAULT_VIEWPORT, tests: runnerTests };
}

/** Disabled test cases are neither run, counted nor shown. Absent flag = enabled (older snapshots). */
export function isEnabled(test: { enabled?: boolean }): boolean {
  return test.enabled !== false;
}

/** A test case as students see it: its whole definition, in words. */
export interface StudentTestCase {
  id: string;
  name: string;
  description?: string | null;
  expectedBehavior?: string | null;
  points: number;
  steps?: string[];
  checks?: string[];
}

/**
 * Everything a student is allowed to see about a question. Every enabled test
 * case is visible with its equal share of `marks` (the question's marks in this test);
 * for hidden tests, only {id, points} and a generic name are returned.
 * The reference solution and raw grading internals never are.
 */
export function toStudentQuestion(
  question: {
    id: string;
    title: string;
    slug: string;
    description: string;
    instructions: string | null;
    constraints?: string | null;
    expectedBehavior?: string | null;
    mediaUrl: string | null;
    difficulty: string;
    starterHtml: string;
    starterCss: string;
    starterJs: string;
    tests?: {
      id: string;
      name: string;
      description: string | null;
      expectedBehavior?: string | null;
      enabled?: boolean;
      hidden?: boolean;
      isHidden?: boolean;
      order: number;
      testType: string;
      testCode: string;
    }[];
  },
  marks: DecimalLike,
) {
  const tests = (question.tests ?? []).filter(isEnabled).sort((a, b) => a.order - b.order);
  const marksMicro = toMicro(marks);
  const share = microToNumber(testCaseShare(marksMicro, tests.length));
  let hiddenIndex = 1;
  return {
    id: question.id,
    title: question.title,
    slug: question.slug,
    description: question.description,
    instructions: question.instructions,
    constraints: question.constraints ?? null,
    expectedBehavior: question.expectedBehavior ?? null,
    mediaUrl: question.mediaUrl,
    difficulty: question.difficulty,
    points: microToNumber(marksMicro),
    starterHtml: question.starterHtml,
    starterCss: question.starterCss,
    starterJs: question.starterJs,
    tests: tests.map((t) => {
      const isHidden = Boolean(t.hidden ?? t.isHidden);
      if (isHidden) {
        return {
          id: t.id,
          name: `Hidden test ${hiddenIndex++}`,
          points: share,
        };
      }
      return toStudentTestCase(t, share);
    }),
  };
}

function toStudentTestCase(
  t: {
    id: string;
    name: string;
    description: string | null;
    expectedBehavior?: string | null;
    testCode: string;
  },
  share: number,
): StudentTestCase {
  const body = validateTestCaseBody(t.testCode);
  const readable = body.ok && body.value ? describeTestCase(body.value) : { steps: [], checks: [] };
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    expectedBehavior: t.expectedBehavior ?? null,
    points: share,
    ...readable,
  };
}

export interface QuestionSnapshot {
  questionId: string;
  version: number;
  title: string;
  slug: string;
  description: string;
  instructions: string | null;
  /** Absent in snapshots taken before they were recorded. */
  constraints?: string | null;
  expectedBehavior?: string | null;
  mediaUrl: string | null;
  difficulty: string;
  starterHtml: string;
  starterCss: string;
  starterJs: string;
  /** Legacy (snapshots taken before equal-split marks); never read for grading. */
  points?: number;
  tests: {
    id: string;
    name: string;
    description: string | null;
    /** Absent in snapshots taken before it was recorded. */
    expectedBehavior?: string | null;
    /** Absent in older snapshots, where every test was enabled. */
    enabled?: boolean;
    /** Legacy fields of older snapshots; never read. */
    hidden?: boolean;
    points?: number;
    order: number;
    testType: string;
    testCode: string;
  }[];
}

/**
 * Freeze the question + its tests into the attempt (product requirement #45).
 * Grading always reads this snapshot, so editing the question later cannot
 * change a score awarded earlier.
 */
export function buildSnapshot(question: {
  id: string;
  version: number;
  title: string;
  slug: string;
  description: string;
  instructions: string | null;
  constraints?: string | null;
  expectedBehavior?: string | null;
  mediaUrl: string | null;
  difficulty: string;
  starterHtml: string;
  starterCss: string;
  starterJs: string;
  tests: QuestionTest[];
}): QuestionSnapshot {
  return {
    questionId: question.id,
    version: question.version,
    title: question.title,
    slug: question.slug,
    description: question.description,
    instructions: question.instructions,
    constraints: question.constraints ?? null,
    expectedBehavior: question.expectedBehavior ?? null,
    mediaUrl: question.mediaUrl,
    difficulty: String(question.difficulty),
    starterHtml: question.starterHtml,
    starterCss: question.starterCss,
    starterJs: question.starterJs,
    tests: question.tests
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        expectedBehavior: t.expectedBehavior,
        enabled: t.enabled,
        hidden: Boolean(t.hidden),
        order: t.order,
        testType: String(t.testType),
        testCode: t.testCode,
      })),
  };
}

/** The test cases an attempt is graded on: the snapshot's enabled tests, in order. */
export function enabledTests(snapshot: QuestionSnapshot) {
  return snapshot.tests.filter(isEnabled).sort((a, b) => a.order - b.order);
}

/**
 * The snapshot a test's attempts grade against. Publishing a test pins it; a
 * test published before pinning existed is pinned by its first attempt, and
 * the conditional update makes every later attempt reuse that same version.
 */
export async function pinnedSnapshot(examQuestion: {
  id: string;
  snapshot: Prisma.JsonValue | null;
  question: Parameters<typeof buildSnapshot>[0];
}): Promise<QuestionSnapshot> {
  if (examQuestion.snapshot) return examQuestion.snapshot as unknown as QuestionSnapshot;
  const snapshot = buildSnapshot(examQuestion.question);
  await prisma.examQuestion.updateMany({
    where: { id: examQuestion.id, snapshot: { equals: Prisma.DbNull } },
    data: {
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      questionVersion: snapshot.version,
      pinnedAt: new Date(),
    },
  });
  const pinned = await prisma.examQuestion.findUniqueOrThrow({
    where: { id: examQuestion.id },
    select: { snapshot: true },
  });
  return pinned.snapshot as unknown as QuestionSnapshot;
}

/** What a student sees of an attempt's question: its frozen snapshot, with this test's marks. */
export function studentQuestionOf(attempt: Pick<Attempt, 'snapshot' | 'maxScore'>) {
  const snapshot = attempt.snapshot as unknown as QuestionSnapshot;
  return toStudentQuestion({ ...snapshot, id: snapshot.questionId }, attempt.maxScore);
}

/** The frozen question an attempt is graded against. */
export function snapshotOf(attempt: Attempt): QuestionSnapshot {
  return attempt.snapshot as unknown as QuestionSnapshot;
}

export function specFromSnapshot(snapshot: QuestionSnapshot): RunnerSpec {
  return compileRunnerSpec(
    enabledTests(snapshot).map((t) => ({
      id: t.id,
      name: t.name,
      testCode: t.testCode,
      testType: t.testType as 'DECLARATIVE',
      order: t.order,
      hidden: Boolean(t.hidden),
    })),
  );
}

/**
 * A draft may hold an unfinished suite (no tests yet, all disabled, a body
 * still being written); the full rules are enforced when the question is
 * validated or published. Names must still be present and unique -- the
 * database requires it.
 */
function assertSuiteSaveable(tests: QuestionTestInput[]): void {
  const seen = new Set<string>();
  tests.forEach((t, i) => {
    const name = t.name.trim().toLowerCase();
    if (!name)
      throw badRequest(`Test ${i + 1}: name is required.`, { [`tests.${i}.name`]: 'Name is required.' });
    if (seen.has(name)) {
      throw badRequest(`Test ${i + 1}: duplicate test name "${t.name}".`, {
        [`tests.${i}.name`]: 'Duplicate name.',
      });
    }
    seen.add(name);
  });
}

/** Row data for a test case. Marks are split equally, never per test. */
function testRow(t: QuestionTestInput, index: number) {
  return {
    name: t.name.trim(),
    description: t.description?.trim() || null,
    testType: t.testType,
    testCode: t.testCode,
    expectedBehavior: t.expectedBehavior?.trim() || null,
    order: t.order ?? index,
    enabled: t.enabled,
    hidden: Boolean(t.hidden),
  };
}

const orderedTests = { tests: { orderBy: { order: 'asc' as const } } };

/** A new question is always a DRAFT: it must be validated before it can be published. */
export async function createQuestion(input: QuestionCreateInput, createdById: string) {
  const slug = await uniqueSlug(input.slug ?? input.title);
  assertSuiteSaveable(input.tests);

  return prisma.question.create({
    data: {
      title: input.title,
      slug,
      description: input.description,
      instructions: input.instructions ?? null,
      constraints: input.constraints ?? null,
      expectedBehavior: input.expectedBehavior ?? null,
      type: 'WEB',
      category: input.category || null,
      marks: input.marks,
      suggestedMinutes: input.suggestedMinutes ?? null,
      starterHtml: input.starterHtml,
      starterCss: input.starterCss,
      starterJs: input.starterJs,
      referenceHtml: input.referenceHtml ?? null,
      referenceCss: input.referenceCss ?? null,
      referenceJs: input.referenceJs ?? null,
      mediaUrl: input.mediaUrl || null,
      difficulty: input.difficulty,
      tags: input.tags,
      status: 'DRAFT',
      createdById,
      tests: { create: input.tests.map(testRow) },
    },
    include: orderedTests,
  });
}

/**
 * Edit a question. What changed decides the consequences (see
 * question-changes): grading-relevant edits bump the version, clear the last
 * validation and send a VALIDATED or PUBLISHED question back to DRAFT. Tests
 * that already pinned the question keep their snapshot either way.
 */
export async function updateQuestion(id: string, input: Partial<QuestionCreateInput>) {
  const existing = await prisma.question.findUnique({ where: { id }, include: { tests: true } });
  if (!existing) throw notFound('Question not found.');
  if (existing.status === 'ARCHIVED') throw conflict('Restore this question before editing it.');
  if (input.tests) assertSuiteSaveable(input.tests);

  const slug = input.slug && input.slug !== existing.slug ? await uniqueSlug(input.slug, id) : existing.slug;
  // Compare VALUES with the stored row: the form always sends every field, so
  // presence in the request does not mean anything changed.
  const impact = questionChangeImpact(existing, input);
  const marksChanged = input.marks !== undefined && toMicro(input.marks) !== toMicro(existing.marks);

  const question = await prisma.$transaction(
    async (tx) => {
      // Unchanged tests are left alone, so their ids (and anything referencing
      // them) survive a metadata-only save.
      if (input.tests && impact.testsChanged) {
        const keepIds = new Set(input.tests.map((t) => t.id).filter((v): v is string => Boolean(v)));
        const deletingTests = existing.tests.filter((e) => !keepIds.has(e.id));

        if (deletingTests.length > 0) {
          for (const t of deletingTests) {
            const resultsCount = await tx.testResult.count({
              where: {
                attempt: { questionId: id },
                OR: [{ testId: t.id }, { testName: t.name }],
              },
            });
            if (resultsCount > 0) {
              throw conflict(
                `Test case "${t.name}" cannot be deleted because graded results are attached to it. Disable the test case instead.`,
              );
            }
          }
          await tx.questionTest.deleteMany({
            where: { questionId: id, id: { in: deletingTests.map((t) => t.id) } },
          });
        }

        // Two-phase rename guard: (questionId, name) is unique in DB.
        // We only park an existing test if its current name is needed by another test in input.
        const inputNames = new Set(input.tests.map((t) => t.name.trim().toLowerCase()));
        const testsToPark = existing.tests.filter((e) => {
          const match = input.tests?.find((t) => t.id === e.id);
          const nameChanged = !match || match.name.trim().toLowerCase() !== e.name.toLowerCase();
          return nameChanged && inputNames.has(e.name.toLowerCase());
        });
        for (const t of testsToPark) {
          await tx.questionTest.update({ where: { id: t.id }, data: { name: `__renaming_${t.id}` } });
        }

        const toCreate: Prisma.QuestionTestCreateManyInput[] = [];
        for (const [i, t] of input.tests.entries()) {
          const data = testRow(t, i);
          if (t.id && existing.tests.some((e) => e.id === t.id)) {
            await tx.questionTest.update({ where: { id: t.id }, data });
          } else {
            toCreate.push({ ...data, questionId: id });
          }
        }
        if (toCreate.length > 0) {
          await tx.questionTest.createMany({ data: toCreate });
        }
      }

      const data: Prisma.QuestionUpdateInput = {
        ...(input.title !== undefined ? { title: input.title } : {}),
        slug,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions || null } : {}),
        ...(input.constraints !== undefined ? { constraints: input.constraints || null } : {}),
        ...(input.expectedBehavior !== undefined ? { expectedBehavior: input.expectedBehavior || null } : {}),
        ...(input.category !== undefined ? { category: input.category || null } : {}),
        ...(input.marks !== undefined ? { marks: input.marks } : {}),
        ...(input.suggestedMinutes !== undefined ? { suggestedMinutes: input.suggestedMinutes } : {}),
        ...(input.starterHtml !== undefined ? { starterHtml: input.starterHtml } : {}),
        ...(input.starterCss !== undefined ? { starterCss: input.starterCss } : {}),
        ...(input.starterJs !== undefined ? { starterJs: input.starterJs } : {}),
        ...(input.referenceHtml !== undefined ? { referenceHtml: input.referenceHtml || null } : {}),
        ...(input.referenceCss !== undefined ? { referenceCss: input.referenceCss || null } : {}),
        ...(input.referenceJs !== undefined ? { referenceJs: input.referenceJs || null } : {}),
        ...(input.mediaUrl !== undefined ? { mediaUrl: input.mediaUrl || null } : {}),
        ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(impact.bumpVersion ? { version: { increment: 1 } } : {}),
        ...(impact.resetValidation
          ? {
              validation: 'NOT_VALIDATED' as const,
              validatedAt: null,
              validationMessage: null,
              // Whatever proved it correct no longer applies: validate again.
              ...(existing.status === 'VALIDATED' || existing.status === 'PUBLISHED'
                ? { status: 'DRAFT' as const }
                : {}),
            }
          : {}),
      };
      const updated = await tx.question.update({ where: { id }, data, include: orderedTests });

      // Update snapshots for all ExamQuestion rows referencing this question
      // so when students reload mid-exam, ensureAttempts immediately receives and applies the newest content and test cases.
      const newSnapshot = buildSnapshot(updated);
      await tx.examQuestion.updateMany({
        where: { questionId: id },
        data: {
          snapshot: newSnapshot as unknown as Prisma.InputJsonValue,
          questionVersion: updated.version,
        },
      });

      return updated;
    },
    {
      maxWait: 15000,
      timeout: 60000,
    },
  );

  // If test cases changed, automatically re-evaluate student code for that question
  // and award each student their highest score across all historical submissions.
  if (impact.testsChanged) {
    try {
      const { regradeAttemptsForQuestion } = await import('@/server/grading/grade-attempt');
      await regradeAttemptsForQuestion(id, {
        includeGraded: true,
        reason: 'Auto-regrade: question test cases updated (best of all submissions)',
      });
    } catch (err) {
      console.error('Failed to auto-regrade attempts after test update:', err);
    }
  }

  return { question, impact: { ...impact, marksChanged, previousStatus: existing.status } };
}

export async function deleteQuestion(id: string): Promise<void> {
  const usage = await prisma.examQuestion.count({ where: { questionId: id } });
  if (usage > 0) {
    throw conflict('This question is used by a test. Archive it instead, or remove it from the test first.');
  }
  const attempts = await prisma.attempt.count({ where: { questionId: id } });
  if (attempts > 0) {
    throw conflict('Students have attempted this question. Archive it instead so past results stay intact.');
  }
  await prisma.question.delete({ where: { id } });
}

/** Why a question cannot be published yet (empty when it can). */
export function publishBlockers(question: {
  validation: string;
  referenceHtml: string | null;
  referenceCss: string | null;
  referenceJs: string | null;
  tests: { name: string; testCode: string; testType: string; enabled: boolean }[];
}): string[] {
  const blockers: string[] = [];
  const shape = validateTestSuiteShape(question.tests);
  if (!shape.ok) blockers.push(...shape.errors);
  if (!question.referenceHtml && !question.referenceCss && !question.referenceJs) {
    blockers.push('Add a reference solution.');
  }
  if (question.validation !== 'PASSED') {
    blockers.push(
      'Run "Validate Question": every enabled test case must pass against the reference solution.',
    );
  }
  return blockers;
}

export type QuestionStatusAction = 'publish' | 'unpublish' | 'archive' | 'unarchive';

/**
 * Lifecycle transitions: DRAFT -> VALIDATED (by validation) -> PUBLISHED, and
 * ARCHIVED from anywhere. Only PUBLISHED questions can be added to a test;
 * unpublishing or archiving never touches tests that already pinned it.
 */
export async function changeQuestionStatus(id: string, action: QuestionStatusAction) {
  const question = await prisma.question.findUnique({ where: { id }, include: { tests: true } });
  if (!question) throw notFound('Question not found.');

  switch (action) {
    case 'publish': {
      if (question.status === 'PUBLISHED') return question;
      if (question.status === 'ARCHIVED') throw conflict('Restore this question before publishing it.');
      const blockers = publishBlockers(question);
      if (blockers.length > 0) throw conflict(`This question cannot be published yet. ${blockers[0]}`);
      return prisma.question.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
    }
    case 'unpublish':
      if (question.status !== 'PUBLISHED') throw conflict('Only a published question can be unpublished.');
      return prisma.question.update({ where: { id }, data: { status: 'VALIDATED' } });
    case 'archive':
      if (question.status === 'ARCHIVED') return question;
      return prisma.question.update({ where: { id }, data: { status: 'ARCHIVED' } });
    case 'unarchive':
      if (question.status !== 'ARCHIVED') throw conflict('This question is not archived.');
      return prisma.question.update({
        where: { id },
        data: { status: question.validation === 'PASSED' ? 'VALIDATED' : 'DRAFT' },
      });
  }
}

/** Admin question list with filters. Counts only enabled test cases. */
export async function listQuestions(filter: {
  page: number;
  pageSize: number;
  q?: string;
  status?: 'DRAFT' | 'VALIDATED' | 'PUBLISHED' | 'ARCHIVED';
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  category?: string;
  tag?: string;
}) {
  const where: Prisma.QuestionWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.difficulty ? { difficulty: filter.difficulty } : {}),
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.tag ? { tags: { has: filter.tag } } : {}),
    ...(filter.q
      ? {
          OR: [
            { title: { contains: filter.q, mode: 'insensitive' } },
            { slug: { contains: filter.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      select: {
        id: true,
        title: true,
        slug: true,
        difficulty: true,
        category: true,
        tags: true,
        marks: true,
        status: true,
        version: true,
        validation: true,
        validatedAt: true,
        updatedAt: true,
        _count: { select: { tests: { where: { enabled: true } }, examQuestions: true } },
      },
    }),
  ]);
  return {
    items: rows.map(({ _count, marks, ...q }) => ({
      ...q,
      marks: marksToNumber(marks),
      enabledTests: _count.tests,
      usedInTests: _count.examQuestions,
    })),
    total,
    page: filter.page,
    pageSize: filter.pageSize,
  };
}

/** Everything the question editor needs, including why it cannot be published yet. */
export async function getQuestionForAdmin(id: string) {
  const question = await prisma.question.findUnique({
    where: { id },
    include: { ...orderedTests, _count: { select: { examQuestions: true } } },
  });
  if (!question) throw notFound('Question not found.');
  const { _count, ...rest } = question;
  return {
    ...rest,
    marks: marksToNumber(question.marks),
    usedInTests: _count.examQuestions,
    blockers: publishBlockers(question),
  };
}
