/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { validateQuestion } from '../src/server/services/validation-runs';

const prisma = new PrismaClient();

const spec = (body: unknown): string => JSON.stringify(body, null, 2);

const Q2048_4_TESTS = [
  {
    name: '.game-board layout: display grid with 4 equal 1fr columns and 10px gap',
    description: 'Checks that .game-board is a CSS grid with 4 columns and 10px gap.',
    hidden: false,
    order: 0,
    body: {
      assertions: [
        {
          type: 'css',
          selector: '.game-board',
          property: 'display',
          equals: 'grid',
          message: 'Expected .game-board to have display: grid',
        },
        {
          type: 'gridColumns',
          selector: '.game-board',
          equals: 4,
          equalWidths: true,
          message: 'Expected .game-board to have 4 equal-width columns',
        },
        {
          type: 'gap',
          selector: '.game-board',
          equals: 10,
          message: 'Expected .game-board to have gap: 10px',
        },
      ],
    },
  },
  {
    name: '.game-board styling: background #bfa075, 5px radius, 10px padding, 20px margin-top',
    description: 'Checks .game-board colors, borders, and spacing.',
    hidden: true,
    order: 1,
    body: {
      assertions: [
        {
          type: 'css',
          selector: '.game-board',
          property: 'background-color',
          equals: '#bfa075',
          color: true,
          message: 'Expected .game-board background-color to be #bfa075',
        },
        {
          type: 'css',
          selector: '.game-board',
          property: 'border-radius',
          equals: '5px',
          message: 'Expected .game-board border-radius to be 5px',
        },
        {
          type: 'css',
          selector: '.game-board',
          property: 'padding-top',
          equals: '10px',
          message: 'Expected .game-board padding to be 10px',
        },
        {
          type: 'css',
          selector: '.game-board',
          property: 'margin-top',
          equals: '20px',
          message: 'Expected .game-board margin-top to be 20px',
        },
      ],
    },
  },
  {
    name: '.tile styling: flexbox, centered content, #feb34a background, 80px height, 24px bold white text',
    description: 'Checks .tile flexbox layout, dimensions, and typography.',
    hidden: true,
    order: 2,
    body: {
      assertions: [
        {
          type: 'css',
          selector: '.tile',
          property: 'display',
          equals: 'flex',
          message: 'Expected .tile to have display: flex',
        },
        {
          type: 'css',
          selector: '.tile',
          property: 'justify-content',
          equals: 'center',
          message: 'Expected .tile to have justify-content: center',
        },
        {
          type: 'css',
          selector: '.tile',
          property: 'align-items',
          equals: 'center',
          message: 'Expected .tile to have align-items: center',
        },
        {
          type: 'css',
          selector: '.tile',
          property: 'background-color',
          equals: '#feb34a',
          color: true,
          message: 'Expected .tile background-color to be #feb34a',
        },
        {
          type: 'css',
          selector: '.tile',
          property: 'border-radius',
          equals: '5px',
          message: 'Expected .tile border-radius to be 5px',
        },
        {
          type: 'size',
          selector: '.tile',
          dimension: 'height',
          op: 'eq',
          value: 80,
          tolerance: 1,
          message: 'Expected .tile height to be 80px',
        },
        {
          type: 'css',
          selector: '.tile',
          property: 'color',
          equals: '#ffffff',
          color: true,
          message: 'Expected .tile text color to be #fff',
        },
        {
          type: 'css',
          selector: '.tile',
          property: 'font-size',
          equals: '24px',
          message: 'Expected .tile font-size to be 24px',
        },
        {
          type: 'css',
          selector: '.tile',
          property: 'font-weight',
          oneOf: ['700', 'bold'],
          message: 'Expected .tile font-weight to be bold',
        },
      ],
    },
  },
  {
    name: '.score and .new-game-button styling',
    description: 'Checks .score font size and margin, and .new-game-button styling with cursor: pointer.',
    hidden: true,
    order: 3,
    body: {
      assertions: [
        {
          type: 'css',
          selector: '.score',
          property: 'font-size',
          equals: '18px',
          message: 'Expected .score to have font-size: 18px',
        },
        {
          type: 'css',
          selector: '.score',
          property: 'margin-top',
          equals: '20px',
          message: 'Expected .score to have margin-top: 20px',
        },
        {
          type: 'css',
          selector: '.new-game-button',
          property: 'background-color',
          equals: '#80756a',
          color: true,
          message: 'Expected .new-game-button background-color to be #80756a',
        },
        {
          type: 'css',
          selector: '.new-game-button',
          property: 'color',
          equals: '#ffffff',
          color: true,
          message: 'Expected .new-game-button text color to be #fff',
        },
        {
          type: 'css',
          selector: '.new-game-button',
          property: 'border-radius',
          equals: '5px',
          message: 'Expected .new-game-button border-radius to be 5px',
        },
        {
          type: 'css',
          selector: '.new-game-button',
          property: 'font-size',
          equals: '16px',
          message: 'Expected .new-game-button font-size to be 16px',
        },
        {
          type: 'css',
          selector: '.new-game-button',
          property: 'cursor',
          equals: 'pointer',
          message: 'Expected .new-game-button to have cursor: pointer',
        },
      ],
    },
  },
];

async function main() {
  console.log('=== Setting up Mid-term Practice Quiz ===\n');

  // 1. Refine Pricing Table: marks = 100 (5 tests @ 20 pts each)
  console.log('1. Refining Pricing Table points to 100 (20 pts per test)...');
  const pricingTable = await prisma.question.findUniqueOrThrow({ where: { slug: 'pricing-table' } });
  await prisma.question.update({
    where: { id: pricingTable.id },
    data: { marks: 100 },
  });
  console.log('   ✓ Pricing Table marks set to 100.');

  // 2. Refine 2048 Game Styling: restore 4 tests @ 25 pts each (marks = 100)
  console.log('2. Refining 2048 Game Styling to 4 bundled tests @ 25 pts each (100 total)...');
  const q2048 = await prisma.question.findUniqueOrThrow({ where: { slug: '2048-game-styling' } });
  await prisma.question.update({
    where: { id: q2048.id },
    data: { marks: 100 },
  });
  await prisma.questionTest.deleteMany({ where: { questionId: q2048.id } });
  for (const t of Q2048_4_TESTS) {
    await prisma.questionTest.create({
      data: {
        questionId: q2048.id,
        name: t.name,
        description: t.description,
        testType: 'DECLARATIVE',
        testCode: spec(t.body),
        order: t.order,
      },
    });
  }
  console.log('   ✓ 2048 Game Styling updated with 4 tests, marks set to 100.');

  // 3. Validate all 5 questions
  const orderedSlugs = [
    'campus-product-card-selectors-and-box-model',
    'student-team-section-flexbox',
    'digital-display-panels-consistent-box-model',
    'pricing-table',
    '2048-game-styling',
  ];

  console.log('\n3. Validating all 5 questions against the runner...');
  const validatedQuestions: { id: string; title: string; slug: string; marks: number }[] = [];
  for (const slug of orderedSlugs) {
    const q = await prisma.question.findUniqueOrThrow({ where: { slug } });
    console.log(`   Validating "${q.title}" (${slug})...`);
    const valResult = await validateQuestion(q.id);
    if (!valResult.ok) {
      console.error(`   ✗ Validation failed for ${q.title}!`, valResult.results.filter((r) => !r.passed));
      throw new Error(`Question ${q.title} failed validation.`);
    }
    console.log(`   ✓ Passed ${valResult.passedCount}/${valResult.totalCount} tests.`);
    validatedQuestions.push({
      id: q.id,
      title: q.title,
      slug: q.slug,
      marks: Number(q.marks),
    });
  }

  // 4. Create or update exam "Mid-term Practice Quiz"
  console.log('\n4. Checking for existing "Mid-term Practice Quiz" exam...');
  let exam = await prisma.exam.findFirst({
    where: { title: { equals: 'Mid-term Practice Quiz', mode: 'insensitive' } },
  });

  if (exam) {
    console.log(`   Found existing exam with ID: ${exam.id} (status: ${exam.status})`);
    // Ensure it remains in DRAFT
    if (exam.status !== 'DRAFT') {
      exam = await prisma.exam.update({
        where: { id: exam.id },
        data: { status: 'DRAFT' },
      });
    }
  } else {
    exam = await prisma.exam.create({
      data: {
        title: 'Mid-term Practice Quiz',
        description: 'Mid-term practical quiz covering CSS selectors, box model, and Flexbox layouts.',
        durationMinutes: 90,
        status: 'DRAFT',
        active: true,
        passingPercentage: 40,
        accessMode: 'ANY_AUTHENTICATED_USER',
      },
    });
    console.log(`   Created new exam with ID: ${exam.id} (status: DRAFT)`);
  }

  // 5. Attach the 5 questions in order
  console.log('\n5. Attaching questions in specified order...');
  await prisma.examQuestion.deleteMany({ where: { examId: exam.id } });
  for (let i = 0; i < validatedQuestions.length; i++) {
    const q = validatedQuestions[i];
    if (!q) continue;
    await prisma.examQuestion.create({
      data: {
        examId: exam.id,
        questionId: q.id,
        order: i,
        marks: 100,
      },
    });
    console.log(`   [${i + 1}] Attached "${q.title}" (marks: 100, order: ${i})`);
  }

  // 6. Verify final exam state
  const finalExam = await prisma.exam.findUniqueOrThrow({
    where: { id: exam.id },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: { question: { select: { slug: true, title: true, marks: true, validation: true } } },
      },
    },
  });

  console.log('\n=== Final Exam Summary ===');
  console.log(`Exam Title: "${finalExam.title}"`);
  console.log(`Status: ${finalExam.status}`);
  console.log(`Duration: ${finalExam.durationMinutes} minutes`);
  console.log(`Questions Attached (${finalExam.questions.length}):`);
  let totalPoints = 0;
  for (const eq of finalExam.questions) {
    const pts = Number(eq.marks);
    totalPoints += pts;
    console.log(
      `  ${eq.order + 1}. "${eq.question.title}" (slug: ${eq.question.slug}) -> ${pts} pts (validation: ${eq.question.validation})`,
    );
  }
  console.log(`Total Exam Points: ${totalPoints}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
