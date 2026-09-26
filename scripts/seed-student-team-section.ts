/* eslint-disable no-console */
/**
 * Seed script for "Student Team Section — Flexbox"
 *
 * Adds the question with 10 declarative test cases totaling 100 points,
 * following the Question + QuestionTest schema established in scripts/create-lab-quiz-1.ts.
 * Runs real validation against the live runner and reports pass/fail per test.
 *
 * Usage:
 *   npx tsx scripts/seed-student-team-section.ts
 */

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

    <div class="team-section">
        <div class="team-card">
            <div class="team-avatar">A</div>
            <h3 class="team-name">Aarav</h3>
            <p class="team-role">Frontend</p>
            <p class="team-description">Passionate about building responsive web applications and clean UI.</p>
        </div>
        <div class="team-card">
            <div class="team-avatar">D</div>
            <h3 class="team-name">Diya</h3>
            <p class="team-role">Backend</p>
            <p class="team-description">Focused on scalable APIs, databases, and robust server architecture.</p>
        </div>
        <div class="team-card">
            <div class="team-avatar">K</div>
            <h3 class="team-name">Kabir</h3>
            <p class="team-role">UI/UX</p>
            <p class="team-description">Crafting intuitive user journeys, accessibility, and visual design.</p>
        </div>
    </div>

</body>
</html>`;

const REFERENCE_CSS = `.team-section {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: stretch;
  gap: 20px;
  padding: 20px;
}
.team-card {
  flex: 1 1 240px;
  max-width: 300px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  background: #ffffff;
  font-family: system-ui, sans-serif;
}
.team-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
  font-size: 24px;
  font-weight: 700;
}
.team-card:nth-child(1) .team-avatar { background-color: #ede9fe; color: #6d28d9; }
.team-card:nth-child(2) .team-avatar { background-color: #dcfce7; color: #16a34a; }
.team-card:nth-child(3) .team-avatar { background-color: #ffedd5; color: #c2410c; }
.team-name { margin: 0 0 4px; font-size: 16px; font-weight: 700; }
.team-role { margin: 0 0 8px; font-size: 13px; color: #6b7280; }
.team-description { margin: 0; font-size: 13px; color: #4b5563; }`;

export const studentTeamSectionQuestion: QuestionDef = {
  title: 'Student Team Section — Flexbox',
  slug: 'student-team-section-flexbox',
  description: `**Problem Description:**
Create a responsive student team section containing three team-member cards.

Each card should contain:
- Student name
- Role
- Profile image or placeholder (a circular avatar)
- Short description

Use the class names already present in the starter HTML — don't rename them, the layout is graded on them:
- \`.team-section\` (the flex container)
- \`.team-card\` (each of the three cards)
- \`.team-avatar\`, \`.team-name\`, \`.team-role\`, \`.team-description\` (inside each card)

### Use:
- \`display: flex\`, \`justify-content\`, \`align-items\`, \`gap\`, \`flex-wrap\`
- \`flex-grow\`, \`flex-shrink\`, \`flex-basis\` on each card
- \`padding\`, \`border\`, \`border-radius\` on each card

The section must remain readable on both desktop and mobile widths.

![Student Team Section reference](https://res.cloudinary.com/vrwhzinu/image/upload/v1788887438/Screenshot_2026-09-06_201949.png)`,
  instructions:
    'Use CSS flexbox properties to style .team-section and .team-card according to the specifications. Ensure the layout wraps gracefully on mobile devices.',
  starterHtml: STARTER_HTML,
  starterCss: '/* Style .team-section and its children below */',
  starterJs: '',
  referenceHtml: STARTER_HTML,
  referenceCss: REFERENCE_CSS,
  referenceJs: null,
  tests: [
    {
      name: 'Flex container established',
      description: 'Checks that .team-section has flex layout with proper alignment properties.',
      hidden: false,
      points: 15,
      order: 0,
      body: {
        assertions: [
          { type: 'css', selector: '.team-section', property: 'display', equals: 'flex' },
          {
            type: 'css',
            selector: '.team-section',
            property: 'justify-content',
            oneOf: ['center', 'space-between', 'space-around', 'space-evenly'],
          },
          {
            type: 'css',
            selector: '.team-section',
            property: 'align-items',
            oneOf: ['center', 'flex-start', 'flex-end', 'stretch', 'baseline'],
          },
        ],
      },
    },
    {
      name: 'Gap between cards',
      description: 'Checks that .team-section has a 20px gap between cards.',
      hidden: false,
      points: 10,
      order: 1,
      body: {
        assertions: [{ type: 'gap', selector: '.team-section', equals: 20, axis: 'both', tolerance: 4 }],
      },
    },
    {
      name: 'Content structure (3 cards, all fields present)',
      description: 'Checks that all 3 team cards have avatar, name, role, and description elements.',
      hidden: false,
      points: 15,
      order: 2,
      body: {
        assertions: [
          { type: 'count', selector: '.team-card', equals: 3 },
          { type: 'count', selector: '.team-avatar', equals: 3 },
          { type: 'count', selector: '.team-name', equals: 3 },
          { type: 'count', selector: '.team-role', equals: 3 },
          { type: 'count', selector: '.team-description', equals: 3 },
        ],
      },
    },
    {
      name: 'Card styling: border, radius, padding',
      description: 'Checks that .team-card has border, border-radius, and padding applied.',
      hidden: false,
      points: 15,
      order: 3,
      body: {
        assertions: [
          { type: 'cssNumber', selector: '.team-card', property: 'border-top-width', op: 'gt', value: 0 },
          {
            type: 'cssNumber',
            selector: '.team-card',
            property: 'border-top-left-radius',
            op: 'gt',
            value: 0,
          },
          {
            type: 'cssNumber',
            selector: '.team-card',
            property: 'padding-top',
            op: 'gte',
            value: 12,
            tolerance: 2,
          },
        ],
      },
    },
    {
      name: 'Avatar is a sized circle',
      description: 'Checks that .team-avatar is a circular 64x64 element.',
      hidden: false,
      points: 10,
      order: 4,
      body: {
        assertions: [
          { type: 'size', selector: '.team-avatar', dimension: 'width', op: 'eq', value: 64, tolerance: 6 },
          { type: 'size', selector: '.team-avatar', dimension: 'height', op: 'eq', value: 64, tolerance: 6 },
          {
            type: 'cssNumber',
            selector: '.team-avatar',
            property: 'border-top-left-radius',
            op: 'gte',
            value: 32,
          },
        ],
      },
    },
    {
      name: 'Avatars are colored distinctly per card',
      description: 'Checks that avatars in each card have distinct background colors.',
      hidden: false,
      points: 10,
      order: 5,
      body: {
        assertions: [
          {
            type: 'css',
            selector: '.team-card:nth-child(1) .team-avatar',
            property: 'background-color',
            oneOf: ['#ede9fe', '#ddd6fe'],
            color: true,
          },
          {
            type: 'css',
            selector: '.team-card:nth-child(2) .team-avatar',
            property: 'background-color',
            oneOf: ['#dcfce7', '#bbf7d0'],
            color: true,
          },
          {
            type: 'css',
            selector: '.team-card:nth-child(3) .team-avatar',
            property: 'background-color',
            oneOf: ['#ffedd5', '#fed7aa'],
            color: true,
          },
        ],
      },
    },
    {
      name: 'Flex sizing on cards',
      description: 'Checks flex-grow and flex-basis sizing on .team-card.',
      hidden: false,
      points: 10,
      order: 6,
      body: {
        assertions: [
          { type: 'cssNumber', selector: '.team-card', property: 'flex-grow', op: 'gte', value: 1 },
          {
            type: 'cssNumber',
            selector: '.team-card',
            property: 'flex-basis',
            op: 'gte',
            value: 200,
            tolerance: 20,
          },
        ],
      },
    },
    {
      name: 'Desktop: three cards per row',
      description: 'Checks that 3 cards are positioned on a single row at desktop width (1280px).',
      hidden: false,
      points: 5,
      order: 7,
      body: {
        viewport: { width: 1280, height: 720 },
        assertions: [{ type: 'boxesPerRow', selector: '.team-card', equals: 3 }],
      },
    },
    {
      name: 'Mobile: cards stack to one per row',
      description: 'Checks that cards wrap to 1 per row at mobile width (400px).',
      hidden: false,
      points: 5,
      order: 8,
      body: {
        viewport: { width: 400, height: 800 },
        assertions: [{ type: 'boxesPerRow', selector: '.team-card', equals: 1 }],
      },
    },
    {
      name: 'No console errors',
      description: 'Ensures execution produces no console errors.',
      hidden: true,
      points: 5,
      order: 9,
      body: {
        assertions: [{ type: 'noConsoleErrors' }],
      },
    },
  ],
};

async function main(): Promise<void> {
  console.log('--- Seeding Question: Student Team Section — Flexbox ---');

  const q = studentTeamSectionQuestion;
  const totalPoints = q.tests.reduce((sum, t) => sum + t.points, 0);

  if (totalPoints !== 100) {
    throw new Error(`Total test points must equal 100, calculated: ${totalPoints}`);
  }
  console.log(`Verified test point sum: ${totalPoints} pts across ${q.tests.length} tests.`);

  // 1. Upsert Question in DRAFT status
  const existing = await prisma.question.findUnique({ where: { slug: q.slug } });
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
    tags: ['html', 'css', 'flexbox', 'responsive'],
    status: 'DRAFT' as const,
    validation: 'NOT_VALIDATED' as const,
    validationMessage: null,
  };

  const question = existing
    ? await prisma.question.update({ where: { id: existing.id }, data: questionData })
    : await prisma.question.create({ data: questionData });

  console.log(`  ✓ Question "${question.title}" (id: ${question.id}) upserted in DRAFT status.`);

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
  process.argv[1].replace(/\\/g, '/').endsWith('seed-student-team-section.ts')
) {
  main()
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
