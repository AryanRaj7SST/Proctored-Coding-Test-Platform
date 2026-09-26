/* eslint-disable no-console */
/**
 * Seed script for "Digital Display Panels — Consistent Box Model"
 *
 * Adds or updates the question with 7 declarative test cases totaling 100 points,
 * following the Question + QuestionTest schema established in scripts/create-lab-quiz-1.ts.
 * Supersedes earlier "Digital Display Panels — Box Model Math".
 * Runs real validation against the live runner and reports pass/fail per test.
 *
 * Usage:
 *   npx tsx scripts/seed-digital-display-panels.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import type { TestCaseBody } from '../shared/test-spec';
import { validateQuestion } from '../src/server/services/validation-runs';

const prisma = new PrismaClient();

const spec = (body: unknown): string => JSON.stringify(body, null, 2);

export interface QuestionDef {
  title: string;
  slug: string;
  description: string;
  instructions: string;
  starterHtml: string;
  starterCss: string;
  starterJs: string;
  referenceHtml: string | null;
  referenceCss: string | null;
  referenceJs: string | null;
  tests: {
    name: string;
    description: string | null;
    hidden: boolean;
    points: number;
    order: number;
    body: TestCaseBody;
  }[];
}

const STARTER_HTML = `<!DOCTYPE html>
<html>
<!-- Please NOTE that the link to assets (like images) need to be set in
global context. For example: To access an image from assets folder
correct way to set src attribute is

src = 'profile.png'

instead of

src = './assets/profile.png'
-->

<head>
    <link rel="stylesheet" href="style.css">
</head>

<body>

    <div class="stage">
      <div class="box box--a">A</div>
      <div class="box box--b">B</div>
      <div class="box box--c">C</div>
    </div>

</body>
</html>`;

const STARTER_CSS = `.stage {
  width: 720px;
  height: 180px;
  margin: 16px auto;
  border: 1px dashed #bbb;
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: center;
}
.box {
  background: #2563eb;
  color: #fff;
  display: grid;
  place-items: center;
  font: 600 14px/1 system-ui;
}
.box--a {
  padding: 0;
  border: 8px solid #1e40af;
  /* Write your code here */
}
.box--b {
  padding: 20px;
  border: 2px solid #1e40af;
  /* Write your code here */
}
.box--c {
  padding: 12px 24px;
  border: 4px solid #1e40af;
  /* Write your code here */
}`;

const REFERENCE_CSS = `.stage {
  width: 720px;
  height: 180px;
  margin: 16px auto;
  border: 1px dashed #bbb;
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: center;
}
.box {
  background: #2563eb;
  color: #fff;
  display: grid;
  place-items: center;
  font: 600 14px/1 system-ui;
}
body { box-sizing: content-box; }
.box--a { padding: 0; border: 8px solid #1e40af; width: 184px; height: 104px; box-sizing: content-box; }
.box--b { padding: 20px; border: 2px solid #1e40af; width: 156px; height: 76px; box-sizing: content-box; }
.box--c { padding: 12px 24px; border: 4px solid #1e40af; width: 144px; height: 88px; box-sizing: content-box; }`;

export const digitalDisplayPanelsQuestion: QuestionDef = {
  title: 'Digital Display Panels — Consistent Box Model',
  slug: 'digital-display-panels-consistent-box-model',
  description: `**Problem Description:**
You're designing a set of digital display panels for an airport. The tricky part? Each panel has a different frame style:

- One has a **thick border** but no inner padding.
- Another has **generous padding** but only a thin border.
- The last one has a mix of both.

Even though their internal measurements differ, to the traveler's eye they must all appear to be exactly the same size:

- **200px wide × 120px high** from edge to edge.

Your job is to calculate the **content width and height** for each panel so that after the border and padding are added, the outer dimensions are equal.

***You must do the math yourself.***

This problem reflects a very real-world scenario: maintaining consistent visual dimensions across components, even when their internal styles differ.`,
  instructions:
    'Calculate and set width and height for .box--a, .box--b, and .box--c in style.css so that each box renders at exactly 200x120px from edge to edge while maintaining box-sizing: content-box.',
  starterHtml: STARTER_HTML,
  starterCss: STARTER_CSS,
  starterJs: '',
  referenceHtml: STARTER_HTML,
  referenceCss: REFERENCE_CSS,
  referenceJs: null,
  tests: [
    {
      name: 'Box A renders at 200×120',
      description: 'Checks that .box--a outer dimensions are 200px wide by 120px high.',
      hidden: false,
      points: 20,
      order: 0,
      body: {
        assertions: [
          { type: 'size', selector: '.box--a', dimension: 'width', op: 'eq', value: 200, tolerance: 1 },
          { type: 'size', selector: '.box--a', dimension: 'height', op: 'eq', value: 120, tolerance: 1 },
        ],
      },
    },
    {
      name: 'Box B renders at 200×120',
      description: 'Checks that .box--b outer dimensions are 200px wide by 120px high.',
      hidden: false,
      points: 20,
      order: 1,
      body: {
        assertions: [
          { type: 'size', selector: '.box--b', dimension: 'width', op: 'eq', value: 200, tolerance: 1 },
          { type: 'size', selector: '.box--b', dimension: 'height', op: 'eq', value: 120, tolerance: 1 },
        ],
      },
    },
    {
      name: 'Box C renders at 200×120',
      description: 'Checks that .box--c outer dimensions are 200px wide by 120px high.',
      hidden: false,
      points: 20,
      order: 2,
      body: {
        assertions: [
          { type: 'size', selector: '.box--c', dimension: 'width', op: 'eq', value: 200, tolerance: 1 },
          { type: 'size', selector: '.box--c', dimension: 'height', op: 'eq', value: 120, tolerance: 1 },
        ],
      },
    },
    {
      name: 'Box A still uses content-box',
      description: 'Verifies that .box--a retains box-sizing: content-box.',
      hidden: false,
      points: 10,
      order: 3,
      body: {
        assertions: [{ type: 'css', selector: '.box--a', property: 'box-sizing', equals: 'content-box' }],
      },
    },
    {
      name: 'Box B still uses content-box',
      description: 'Verifies that .box--b retains box-sizing: content-box.',
      hidden: false,
      points: 10,
      order: 4,
      body: {
        assertions: [{ type: 'css', selector: '.box--b', property: 'box-sizing', equals: 'content-box' }],
      },
    },
    {
      name: 'Box C still uses content-box',
      description: 'Verifies that .box--c retains box-sizing: content-box.',
      hidden: false,
      points: 10,
      order: 5,
      body: {
        assertions: [{ type: 'css', selector: '.box--c', property: 'box-sizing', equals: 'content-box' }],
      },
    },
    {
      name: 'No console errors',
      description: 'Ensures execution produces no console errors.',
      hidden: true,
      points: 10,
      order: 6,
      body: {
        assertions: [{ type: 'noConsoleErrors' }],
      },
    },
  ],
};

async function main(): Promise<void> {
  console.log('--- Seeding Question: Digital Display Panels — Consistent Box Model ---');

  const q = digitalDisplayPanelsQuestion;
  const totalPoints = q.tests.reduce((sum, t) => sum + t.points, 0);

  if (totalPoints !== 100) {
    throw new Error(`Total test points must equal 100, calculated: ${totalPoints}`);
  }
  console.log(`Verified test point sum: ${totalPoints} pts across ${q.tests.length} tests.`);

  // 1. Look up existing question by current or previous title/slug
  const existing = await prisma.question.findFirst({
    where: {
      OR: [
        { title: 'Digital Display Panels — Consistent Box Model' },
        { title: 'Digital Display Panels — Box Model Math' },
        { slug: 'digital-display-panels-consistent-box-model' },
        { slug: 'digital-display-panels-box-model-math' },
      ],
    },
  });

  const questionData = {
    title: q.title,
    slug: q.slug,
    description: q.description,
    instructions: q.instructions,
    type: 'WEB' as const,
    starterHtml: q.starterHtml,
    starterCss: q.starterCss,
    starterJs: q.starterJs,
    referenceHtml: q.referenceHtml,
    referenceCss: q.referenceCss,
    referenceJs: q.referenceJs,
    difficulty: 'EASY' as const,
    marks: totalPoints,
    tags: ['html', 'css', 'box-model', 'math'],
    status: 'DRAFT' as const,
    validation: 'NOT_VALIDATED' as const,
    validationMessage: null,
  };

  const question = existing
    ? await prisma.question.update({ where: { id: existing.id }, data: questionData })
    : await prisma.question.create({ data: questionData });

  console.log(
    `  ✓ Question "${question.title}" (id: ${question.id}) ${existing ? 'updated from previous version' : 'created'} in DRAFT status.`,
  );

  // 2. Recreate QuestionTest records
  await prisma.questionTest.deleteMany({ where: { questionId: question.id } });
  for (const t of q.tests) {
    await prisma.questionTest.create({
      data: {
        questionId: question.id,
        name: t.name,
        description: t.description,
        testType: 'DECLARATIVE',
        testCode: spec(t.body),
        expectedBehavior: t.description,
        order: t.order,
        enabled: true,
      },
    });
  }
  console.log(`  ✓ Created all ${q.tests.length} QuestionTest records.`);

  // 3. Attempt to attach to exam "Mid-term Practice Quiz" if it exists
  const exam = await prisma.exam.findFirst({
    where: { title: 'Mid-term Practice Quiz' },
  });

  if (exam) {
    const existingExamQuestion = await prisma.examQuestion.findFirst({
      where: { examId: exam.id, questionId: question.id },
    });

    if (!existingExamQuestion) {
      const maxOrder = await prisma.examQuestion.findFirst({
        where: { examId: exam.id },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      const nextOrder = (maxOrder?.order ?? -1) + 1;

      await prisma.examQuestion.create({
        data: {
          examId: exam.id,
          questionId: question.id,
          order: nextOrder,
          marks: totalPoints,
        },
      });
      console.log(`  ✓ Attached question to exam "${exam.title}" at order ${nextOrder}.`);
    } else {
      console.log(`  ✓ Question already attached to exam "${exam.title}".`);
    }
  } else {
    console.log('\n  ℹ Notice: Exam "Mid-term Practice Quiz" was not found in the database.');
    console.log('    Per runbook instructions, skipped exam attachment rather than guessing an exam name.');
  }

  // 4. Run real validation against live runner
  console.log('\n--- Running Validation via Runner ---');
  try {
    const validationResult = await validateQuestion(question.id);
    console.log(
      `Validation Result: ${validationResult.ok ? 'PASSED' : 'FAILED'} (${validationResult.passedCount}/${validationResult.totalCount} tests passed)`,
    );
    console.log(`Updated Question Status: ${validationResult.status}`);
    console.log('\nPer-test Breakdown:');
    for (const [i, r] of validationResult.results.entries()) {
      const icon = r.passed ? '✓ PASS' : '✗ FAIL';
      const detail = r.passed
        ? `(duration: ${r.durationMs}ms)`
        : `| message: ${r.message ?? 'none'} | expected: ${r.expected ?? 'none'} | actual: ${r.actual ?? 'none'}`;
      console.log(`  [Test ${i + 1}] ${icon} - "${r.testName}" ${detail}`);
    }
  } catch (err) {
    console.error('Validation execution encountered an error:', err);
  }

  console.log('\n--- Seeding & Validation Finished ---');
}

if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].replace(/\\/g, '/').endsWith('seed-digital-display-panels.ts')
) {
  main()
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
