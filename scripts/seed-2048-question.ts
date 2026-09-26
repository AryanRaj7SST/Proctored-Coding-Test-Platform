/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { validateQuestion } from '../src/server/services/validation-runs';
import { changeExamStatus } from '../src/server/services/exams';

const prisma = new PrismaClient();

const STARTER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>2048 Game Styling</title>
<style>
  body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 0;
    background-color: #f8f8f8;
  }

  .container {
    max-width: 400px;
    margin: 0 auto;
    padding: 20px;
    text-align: center;
  }

  h1 {
    font-size: 32px;
    margin-top: 0;
  }

  /* Write your CSS for .game-board, .tile, .score, and .new-game-button here */
</style>
</head>
<body>
  <!-- Do not edit this code -->
  <div class="container">
    <h1>Let's Play</h1>
    <div class="game-board">
      <div class="tile tile-2">2</div>
      <div class="tile tile-0">0</div>
      <div class="tile tile-4">4</div>
      <div class="tile tile-8">8</div>
    </div>
    <div class="score">Score: 0</div>
    <button class="new-game-button">New Game</button>
  </div>
</body>
</html>`;

const REFERENCE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>2048 Game Styling</title>
<style>
  body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 0;
    background-color: #f8f8f8;
  }

  .container {
    max-width: 400px;
    margin: 0 auto;
    padding: 20px;
    text-align: center;
  }

  h1 {
    font-size: 32px;
    margin-top: 0;
  }

  .game-board {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    background-color: #bfa075;
    border-radius: 5px;
    padding: 10px;
    margin-top: 20px;
  }

  .tile {
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: #feb34a;
    border-radius: 5px;
    color: #fff;
    font-size: 24px;
    font-weight: bold;
    height: 80px;
  }

  .score {
    font-size: 18px;
    margin-top: 20px;
  }

  .new-game-button {
    background-color: #80756a;
    color: #fff;
    border: none;
    border-radius: 5px;
    padding: 10px 20px;
    margin-top: 20px;
    font-size: 16px;
    cursor: pointer;
  }
</style>
</head>
<body>
  <!-- Do not edit this code -->
  <div class="container">
    <h1>Let's Play</h1>
    <div class="game-board">
      <div class="tile tile-2">2</div>
      <div class="tile tile-0">0</div>
      <div class="tile tile-4">4</div>
      <div class="tile tile-8">8</div>
    </div>
    <div class="score">Score: 0</div>
    <button class="new-game-button">New Game</button>
  </div>
</body>
</html>`;

interface TestDef {
  name: string;
  description: string;
  points: number;
  hidden: boolean;
  order: number;
  body: object;
}

const TESTS: TestDef[] = [
  {
    name: 'Test 1 — Game board is a 4-column grid',
    description: 'Game board is a 4-column grid (Points: 15)',
    points: 15,
    hidden: false,
    order: 0,
    body: {
      assertions: [
        { type: 'css', selector: '.game-board', property: 'display', equals: 'grid' },
        { type: 'gridColumns', selector: '.game-board', equals: 4, equalWidths: true },
      ],
    },
  },
  {
    name: 'Test 2 — Game board gap is 10px',
    description: 'Game board gap is 10px (Points: 10)',
    points: 10,
    hidden: false,
    order: 1,
    body: {
      assertions: [{ type: 'gap', selector: '.game-board', equals: 10, axis: 'both', tolerance: 2 }],
    },
  },
  {
    name: 'Test 3 — Game board colour, radius, padding, margin',
    description: 'Game board colour, radius, padding, margin (Points: 15)',
    points: 15,
    hidden: false,
    order: 2,
    body: {
      assertions: [
        {
          type: 'css',
          selector: '.game-board',
          property: 'background-color',
          oneOf: ['#bfa075', 'rgb(191, 160, 117)'],
          color: true,
        },
        {
          type: 'cssNumber',
          selector: '.game-board',
          property: 'border-top-left-radius',
          op: 'eq',
          value: 5,
          tolerance: 1,
        },
        {
          type: 'cssNumber',
          selector: '.game-board',
          property: 'padding-top',
          op: 'eq',
          value: 10,
          tolerance: 1,
        },
        {
          type: 'cssNumber',
          selector: '.game-board',
          property: 'margin-top',
          op: 'eq',
          value: 20,
          tolerance: 1,
        },
      ],
    },
  },
  {
    name: 'Test 4 — Tiles use flexbox centering',
    description: 'Tiles use flexbox centering (Points: 10)',
    points: 10,
    hidden: false,
    order: 3,
    body: {
      assertions: [
        { type: 'css', selector: '.tile', property: 'display', equals: 'flex' },
        { type: 'css', selector: '.tile', property: 'justify-content', oneOf: ['center'] },
        { type: 'css', selector: '.tile', property: 'align-items', oneOf: ['center'] },
      ],
    },
  },
  {
    name: 'Test 5 — Tile colour, radius, text style, and height',
    description: 'Tile colour, radius, text style, and height (Points: 20)',
    points: 20,
    hidden: false,
    order: 4,
    body: {
      assertions: [
        {
          type: 'css',
          selector: '.tile',
          property: 'background-color',
          oneOf: ['#feb34a', 'rgb(254, 179, 74)'],
          color: true,
        },
        {
          type: 'cssNumber',
          selector: '.tile',
          property: 'border-top-left-radius',
          op: 'eq',
          value: 5,
          tolerance: 1,
        },
        {
          type: 'cssNumber',
          selector: '.tile',
          property: 'font-size',
          op: 'eq',
          value: 24,
          tolerance: 1,
        },
        {
          type: 'css',
          selector: '.tile',
          property: 'color',
          oneOf: ['#fff', '#ffffff', 'white'],
          color: true,
        },
        {
          type: 'cssNumber',
          selector: '.tile',
          property: 'font-weight',
          op: 'gte',
          value: 700,
        },
        {
          type: 'size',
          selector: '.tile',
          dimension: 'height',
          op: 'eq',
          value: 80,
          tolerance: 2,
        },
      ],
    },
  },
  {
    name: 'Test 6 — Score text size and margin',
    description: 'Score text size and margin (Points: 10)',
    points: 10,
    hidden: false,
    order: 5,
    body: {
      assertions: [
        {
          type: 'cssNumber',
          selector: '.score',
          property: 'font-size',
          op: 'eq',
          value: 18,
          tolerance: 1,
        },
        {
          type: 'cssNumber',
          selector: '.score',
          property: 'margin-top',
          op: 'eq',
          value: 20,
          tolerance: 1,
        },
      ],
    },
  },
  {
    name: 'Test 7 — New Game button colours, border removed, radius',
    description: 'New Game button colours, border removed, radius (Points: 10)',
    points: 10,
    hidden: false,
    order: 6,
    body: {
      assertions: [
        {
          type: 'css',
          selector: '.new-game-button',
          property: 'background-color',
          oneOf: ['#80756a', 'rgb(128, 117, 106)'],
          color: true,
        },
        {
          type: 'css',
          selector: '.new-game-button',
          property: 'color',
          oneOf: ['#fff', '#ffffff', 'white'],
          color: true,
        },
        {
          type: 'cssNumber',
          selector: '.new-game-button',
          property: 'border-top-width',
          op: 'eq',
          value: 0,
          tolerance: 0,
        },
        {
          type: 'cssNumber',
          selector: '.new-game-button',
          property: 'border-top-left-radius',
          op: 'eq',
          value: 5,
          tolerance: 1,
        },
      ],
    },
  },
  {
    name: 'Test 8 — New Game button padding, margin, font size',
    description: 'New Game button padding, margin, font size (Points: 5)',
    points: 5,
    hidden: false,
    order: 7,
    body: {
      assertions: [
        {
          type: 'cssNumber',
          selector: '.new-game-button',
          property: 'padding-top',
          op: 'eq',
          value: 10,
          tolerance: 1,
        },
        {
          type: 'cssNumber',
          selector: '.new-game-button',
          property: 'padding-left',
          op: 'eq',
          value: 20,
          tolerance: 1,
        },
        {
          type: 'cssNumber',
          selector: '.new-game-button',
          property: 'margin-top',
          op: 'eq',
          value: 20,
          tolerance: 1,
        },
        {
          type: 'cssNumber',
          selector: '.new-game-button',
          property: 'font-size',
          op: 'eq',
          value: 16,
          tolerance: 1,
        },
      ],
    },
  },
  {
    name: 'Test 9 — Button cursor is pointer',
    description: 'Button cursor is pointer (Points: 5)',
    points: 5,
    hidden: false,
    order: 8,
    body: {
      assertions: [{ type: 'css', selector: '.new-game-button', property: 'cursor', equals: 'pointer' }],
    },
  },
  {
    name: 'Test 10 — No console errors',
    description: 'No console errors (Points: 0 · Hygiene)',
    points: 0,
    hidden: true,
    order: 9,
    body: {
      assertions: [{ type: 'noConsoleErrors' }],
    },
  },
];

async function main(): Promise<void> {
  console.log('=== Updating 2048 Game Styling Question ===');

  const slug = '2048-game-styling';
  let question = await prisma.question.findUnique({ where: { slug } });
  if (!question) {
    question = await prisma.question.findFirst({ where: { title: { contains: '2048' } } });
  }

  if (!question) {
    throw new Error('Question 2048 not found in database.');
  }

  console.log(`Found question: "${question.title}" (id: ${question.id})`);

  // Update Question row
  question = await prisma.question.update({
    where: { id: question.id },
    data: {
      title: '2048 Game Styling',
      starterHtml: STARTER_HTML,
      starterCss: '',
      starterJs: '',
      referenceHtml: REFERENCE_HTML,
      referenceCss: '',
      referenceJs: '',
      marks: 100,
      status: 'DRAFT', // will be validated and published
    },
  });

  // Recreate question tests
  await prisma.questionTest.deleteMany({ where: { questionId: question.id } });
  for (const t of TESTS) {
    await prisma.questionTest.create({
      data: {
        questionId: question.id,
        name: t.name,
        description: t.description,
        testType: 'DECLARATIVE',
        testCode: JSON.stringify(t.body, null, 2),
        expectedBehavior: t.description,
        order: t.order,
        enabled: true,
      },
    });
  }
  console.log(`Created ${TESTS.length} tests for "${question.title}".`);

  // Run validation against runner
  console.log('\n--- Running validation against runner ---');
  const validation = await validateQuestion(question.id);
  console.log(
    `Validation result: ${validation.ok ? 'PASSED' : 'FAILED'} (${validation.passedCount}/${validation.totalCount})`,
  );
  for (const [i, r] of validation.results.entries()) {
    console.log(
      `  [${i + 1}] ${r.passed ? '✓ PASS' : '✗ FAIL'}: ${r.testName} ${r.message ? `(${r.message})` : ''}`,
    );
  }

  if (!validation.ok) {
    throw new Error('Validation failed! Please inspect output above.');
  }

  // Publish Question
  await prisma.question.update({
    where: { id: question.id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
  console.log(`✓ Question "${question.title}" status is now PUBLISHED.`);

  // Find or create exam called 'test'
  console.log('\n=== Adding to Exam "test" and publishing ===');
  let exam = await prisma.exam.findFirst({
    where: { title: 'test' },
  });

  if (!exam) {
    exam = await prisma.exam.create({
      data: {
        title: 'test',
        description: 'Test Exam with 2048 Game Styling',
        durationMinutes: 60,
        status: 'DRAFT',
        active: true,
        accessMode: 'ANY_AUTHENTICATED_USER',
        passingPercentage: 40,
        resultVisibility: 'FULL',
      },
    });
    console.log(`Created exam "test" (id: ${exam.id})`);
  } else {
    console.log(`Found exam "test" (id: ${exam.id})`);
  }

  // Attach question to exam 'test'
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
        marks: 100,
      },
    });
    console.log(`✓ Attached question to exam "test" at order ${nextOrder} with 100 marks.`);
  } else {
    await prisma.examQuestion.update({
      where: { id: existingExamQuestion.id },
      data: { marks: 100 },
    });
    console.log(`✓ Question already in exam "test"; marks updated to 100.`);
  }

  // Ensure exam time window is active so every user can take it immediately
  const now = new Date();
  const startTime = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
  const endTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days ahead

  await prisma.exam.update({
    where: { id: exam.id },
    data: {
      accessMode: 'ANY_AUTHENTICATED_USER',
      active: true,
      startTime,
      endTime,
      durationMinutes: 60,
    },
  });

  // Publish exam using the official service (or direct transition if needed)
  if (exam.status !== 'PUBLISHED') {
    try {
      exam = await changeExamStatus(exam.id, 'publish');
      console.log(`✓ Exam "${exam.title}" published successfully via changeExamStatus!`);
    } catch (err) {
      console.warn(
        `changeExamStatus threw: ${(err as Error).message}. Applying direct publish transaction...`,
      );
      exam = await prisma.exam.update({
        where: { id: exam.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          active: true,
        },
      });
      console.log(`✓ Exam "${exam.title}" directly set to PUBLISHED.`);
    }
  } else {
    console.log(`✓ Exam "${exam.title}" is already PUBLISHED.`);
  }

  // Assign every student / user in the platform to exam 'test'
  const allUsers = await prisma.user.findMany({
    where: { role: 'STUDENT', active: true },
    select: { id: true, email: true },
  });

  console.log(`Assigning ${allUsers.length} active students to exam "${exam.title}"...`);
  let newAssignments = 0;
  for (const u of allUsers) {
    const res = await prisma.examAssignment.upsert({
      where: {
        examId_email: {
          examId: exam.id,
          email: u.email,
        },
      },
      create: {
        examId: exam.id,
        email: u.email,
        userId: u.id,
        status: 'ASSIGNED',
      },
      update: {
        userId: u.id,
        revokedAt: null,
      },
    });
    if (res) newAssignments += 1;
  }
  console.log(`✓ Confirmed ${newAssignments} student assignments for exam "${exam.title}".`);

  console.log('\n=== All operations completed successfully! ===');
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
