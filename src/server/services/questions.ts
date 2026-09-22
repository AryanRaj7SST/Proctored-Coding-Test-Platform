import type { Prisma, QuestionTest } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { badRequest, conflict, notFound } from '@/lib/http';
import type { QuestionCreateInput, QuestionTestInput } from '@/lib/validation';
import {
  validateTestCaseBody,
  validateTestSuiteShape,
  totalPoints,
  DEFAULT_VIEWPORT,
  type RunnerSpec,
  type RunnerTest,
} from '@shared/test-spec';

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'question';
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
  tests: Pick<QuestionTest, 'id' | 'name' | 'points' | 'hidden' | 'testCode' | 'testType' | 'order'>[],
): RunnerSpec {
  const ordered = [...tests].sort((a, b) => a.order - b.order);
  const runnerTests: RunnerTest[] = [];
  for (const t of ordered) {
    if (t.testType !== 'DECLARATIVE') continue; // PLAYWRIGHT specs are executed by a dedicated path
    const body = validateTestCaseBody(t.testCode);
    if (!body.ok || !body.value) {
      throw badRequest(`Test "${t.name}" has an invalid specification: ${body.errors.join('; ')}`);
    }
    runnerTests.push({ id: t.id, name: t.name, points: t.points, hidden: t.hidden, ...body.value });
  }
  if (runnerTests.length === 0) throw badRequest('This question has no runnable test cases.');
  return { version: 1, viewport: DEFAULT_VIEWPORT, tests: runnerTests };
}

/** Everything a student is allowed to see about a question. */
export function toStudentQuestion(question: {
  id: string;
  title: string;
  slug: string;
  description: string;
  instructions: string | null;
  mediaUrl: string | null;
  difficulty: string;
  points: number;
  starterHtml: string;
  starterCss: string;
  starterJs: string;
  tests?: { id: string; name: string; description: string | null; hidden: boolean; points: number; order: number }[];
}) {
  return {
    id: question.id,
    title: question.title,
    slug: question.slug,
    description: question.description,
    instructions: question.instructions,
    mediaUrl: question.mediaUrl,
    difficulty: question.difficulty,
    points: question.points,
    starterHtml: question.starterHtml,
    starterCss: question.starterCss,
    starterJs: question.starterJs,
    // Only names/points of PUBLIC tests -- never testCode, never hidden bodies.
    publicTests: (question.tests ?? [])
      .filter((t) => !t.hidden)
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ id: t.id, name: t.name, description: t.description, points: t.points })),
    hiddenTestCount: (question.tests ?? []).filter((t) => t.hidden).length,
  };
}

export interface QuestionSnapshot {
  questionId: string;
  version: number;
  title: string;
  slug: string;
  description: string;
  instructions: string | null;
  mediaUrl: string | null;
  difficulty: string;
  starterHtml: string;
  starterCss: string;
  starterJs: string;
  points: number;
  tests: {
    id: string;
    name: string;
    description: string | null;
    hidden: boolean;
    points: number;
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
  mediaUrl: string | null;
  difficulty: string;
  starterHtml: string;
  starterCss: string;
  starterJs: string;
  points: number;
  tests: QuestionTest[];
}): QuestionSnapshot {
  return {
    questionId: question.id,
    version: question.version,
    title: question.title,
    slug: question.slug,
    description: question.description,
    instructions: question.instructions,
    mediaUrl: question.mediaUrl,
    difficulty: String(question.difficulty),
    starterHtml: question.starterHtml,
    starterCss: question.starterCss,
    starterJs: question.starterJs,
    points: question.points,
    tests: question.tests
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        hidden: t.hidden,
        points: t.points,
        order: t.order,
        testType: String(t.testType),
        testCode: t.testCode,
      })),
  };
}

export function specFromSnapshot(snapshot: QuestionSnapshot): RunnerSpec {
  return compileRunnerSpec(
    snapshot.tests.map((t) => ({
      id: t.id,
      name: t.name,
      points: t.points,
      hidden: t.hidden,
      testCode: t.testCode,
      testType: t.testType as 'DECLARATIVE' | 'PLAYWRIGHT',
      order: t.order,
    })),
  );
}

function assertSuiteValid(tests: QuestionTestInput[]): void {
  const result = validateTestSuiteShape(tests);
  if (!result.ok) throw badRequest(result.errors[0] ?? 'Invalid test suite.', { tests: result.errors });
}

export async function createQuestion(input: QuestionCreateInput, createdById: string) {
  const slug = input.slug ? await uniqueSlug(input.slug) : await uniqueSlug(input.title);
  if (input.tests.length > 0) assertSuiteValid(input.tests);

  return prisma.$transaction(async (tx) => {
    const question = await tx.question.create({
      data: {
        title: input.title,
        slug,
        description: input.description,
        instructions: input.instructions ?? null,
        type: input.type,
        language: input.language ?? null,
        starterHtml: input.starterHtml,
        starterCss: input.starterCss,
        starterJs: input.starterJs,
        referenceHtml: input.referenceHtml ?? null,
        referenceCss: input.referenceCss ?? null,
        referenceJs: input.referenceJs ?? null,
        mediaUrl: input.mediaUrl || null,
        difficulty: input.difficulty,
        tags: input.tags,
        active: input.active,
        points: totalPoints(input.tests),
        createdById,
        tests: {
          create: input.tests.map((t, i) => ({
            name: t.name,
            description: t.description ?? null,
            testType: t.testType,
            testCode: t.testCode,
            expectedBehavior: t.expectedBehavior ?? null,
            points: t.points,
            order: t.order ?? i,
            hidden: t.hidden,
          })),
        },
      },
      include: { tests: { orderBy: { order: 'asc' } } },
    });
    return question;
  });
}

export async function updateQuestion(id: string, input: Partial<QuestionCreateInput>) {
  const existing = await prisma.question.findUnique({ where: { id }, include: { tests: true } });
  if (!existing) throw notFound('Question not found.');
  if (input.tests) assertSuiteValid(input.tests);

  const slug = input.slug && input.slug !== existing.slug ? await uniqueSlug(input.slug, id) : existing.slug;

  return prisma.$transaction(async (tx) => {
    if (input.tests) {
      const keepIds = input.tests.map((t) => t.id).filter((v): v is string => Boolean(v));
      await tx.questionTest.deleteMany({ where: { questionId: id, id: { notIn: keepIds.length ? keepIds : ['__none__'] } } });
      for (const [i, t] of input.tests.entries()) {
        const data = {
          name: t.name,
          description: t.description ?? null,
          testType: t.testType,
          testCode: t.testCode,
          expectedBehavior: t.expectedBehavior ?? null,
          points: t.points,
          order: t.order ?? i,
          hidden: t.hidden,
        };
        if (t.id && existing.tests.some((e) => e.id === t.id)) {
          await tx.questionTest.update({ where: { id: t.id }, data });
        } else {
          await tx.questionTest.create({ data: { ...data, questionId: id } });
        }
      }
    }

    const contentChanged =
      input.starterHtml !== undefined ||
      input.starterCss !== undefined ||
      input.starterJs !== undefined ||
      input.description !== undefined ||
      input.tests !== undefined;

    const data: Prisma.QuestionUpdateInput = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      slug,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.starterHtml !== undefined ? { starterHtml: input.starterHtml } : {}),
      ...(input.starterCss !== undefined ? { starterCss: input.starterCss } : {}),
      ...(input.starterJs !== undefined ? { starterJs: input.starterJs } : {}),
      ...(input.referenceHtml !== undefined ? { referenceHtml: input.referenceHtml } : {}),
      ...(input.referenceCss !== undefined ? { referenceCss: input.referenceCss } : {}),
      ...(input.referenceJs !== undefined ? { referenceJs: input.referenceJs } : {}),
      ...(input.mediaUrl !== undefined ? { mediaUrl: input.mediaUrl || null } : {}),
      ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.tests ? { points: totalPoints(input.tests) } : {}),
      // Any content/test change invalidates a previous validation pass and
      // bumps the version so future attempts snapshot the new content.
      ...(contentChanged
        ? { version: { increment: 1 }, validation: 'NOT_VALIDATED' as const, validatedAt: null, validationMessage: null }
        : {}),
    };

    return tx.question.update({ where: { id }, data, include: { tests: { orderBy: { order: 'asc' } } } });
  });
}

export async function deleteQuestion(id: string): Promise<void> {
  const usage = await prisma.examQuestion.count({ where: { questionId: id } });
  if (usage > 0) {
    throw conflict('This question is used by an exam. Deactivate it instead, or remove it from the exam first.');
  }
  const attempts = await prisma.attempt.count({ where: { questionId: id } });
  if (attempts > 0) {
    throw conflict('Students have attempted this question. Deactivate it instead so past results stay intact.');
  }
  await prisma.question.delete({ where: { id } });
}

/** A question may only be assigned once its suite is sane and validated. */
export function publishBlockers(question: {
  validation: string;
  tests: { name: string; points: number; testCode: string; testType: string }[];
}): string[] {
  const blockers: string[] = [];
  const shape = validateTestSuiteShape(question.tests);
  if (!shape.ok) blockers.push(...shape.errors);
  if (question.validation !== 'PASSED') {
    blockers.push('Run "Validate Question" against the reference solution and make every test pass.');
  }
  return blockers;
}
