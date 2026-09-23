import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const spec = (body: unknown): string => JSON.stringify(body, null, 2);

async function main() {
  console.log('--- Setting up New Student Contest & Questions ---');

  // 1. Question 1: Arrange the divs
  const q1Slug = 'arrange-the-divs';
  const q1Title = 'Arrange the divs';
  const q1Description = `A boilerplate HTML page is provided that contains a div with the ID grid-container, and inside it, there are four div elements with the class grid-item and IDs item1, item2, item3, and item4.

Your task is to style the layout using CSS Grid to ensure the following:

- The grid-container is set up as a grid with two equal-width columns and two equal-height rows, each measuring 50px. The gap between the rows and columns should also be 10px.
- Each grid-item should have:
  - background color rgb(173, 216, 230)
  - border 2px solid rgb(0, 0, 0)
  - centered text
  - line-height: 50px
- The grid item with ID item1 must span 2 rows using the grid-row property.`;

  const q1StarterHtml = `<body>
  <div id="grid-container">
    <div class="grid-item" id="item1">Item 1</div>
    <div class="grid-item" id="item2">Item 2</div>
    <div class="grid-item" id="item3">Item 3</div>
    <div class="grid-item" id="item4">Item 4</div>
  </div>
</body>`;

  const q1StarterCss = `/* css code goes here */`;

  const q1ReferenceCss = `#grid-container {
  display: grid;
  grid-template-columns: repeat(2, 50px);
  grid-template-rows: repeat(2, 50px);
  gap: 10px;
}

.grid-item {
  background-color: rgb(173, 216, 230);
  border: 2px solid rgb(0, 0, 0);
  text-align: center;
  line-height: 50px;
}

#item1 {
  grid-row: span 2;
}`;

  const q1Tests = [
    {
      name: 'Styles the grid container correctly',
      description: 'Sets display to grid, 2 equal columns of 50px, 2 equal rows of 50px, and gap of 10px.',
      points: 10,
      order: 0,
      hidden: false,
      body: {
        assertions: [
          { type: 'css', selector: '#grid-container', property: 'display', equals: 'grid' },
          {
            type: 'css',
            selector: '#grid-container',
            property: 'grid-template-columns',
            oneOf: ['50px 50px', 'repeat(2, 50px)'],
          },
          {
            type: 'css',
            selector: '#grid-container',
            property: 'grid-template-rows',
            oneOf: ['50px 50px', 'repeat(2, 50px)'],
          },
          { type: 'css', selector: '#grid-container', property: 'gap', oneOf: ['10px', '10px 10px'] },
        ],
      },
    },
    {
      name: 'Styles the grid items correctly',
      description:
        'Sets background-color to rgb(173, 216, 230), border to 2px solid rgb(0, 0, 0), centered text, line-height: 50px.',
      points: 10,
      order: 1,
      hidden: false,
      body: {
        assertions: [
          {
            type: 'css',
            selector: '.grid-item',
            property: 'background-color',
            color: true,
            equals: 'rgb(173, 216, 230)',
          },
          { type: 'css', selector: '.grid-item', property: 'border', equals: '2px solid rgb(0, 0, 0)' },
          { type: 'css', selector: '.grid-item', property: 'text-align', equals: 'center' },
          { type: 'css', selector: '.grid-item', property: 'line-height', equals: '50px' },
        ],
      },
    },
    {
      name: 'Applies grid-row to item1 correctly',
      description: 'Item1 spans 2 rows using grid-row.',
      points: 10,
      order: 2,
      hidden: false,
      body: {
        assertions: [{ type: 'css', selector: '#item1', property: 'grid-row', equals: 'span 2' }],
      },
    },
  ];

  const q1 = await prisma.question.upsert({
    where: { slug: q1Slug },
    create: {
      title: q1Title,
      slug: q1Slug,
      description: q1Description,
      type: 'WEB',
      starterHtml: q1StarterHtml,
      starterCss: q1StarterCss,
      starterJs: '',
      referenceHtml: q1StarterHtml,
      referenceCss: q1ReferenceCss,
      referenceJs: '',
      difficulty: 'EASY',
      points: 30,
      active: true,
      validation: 'PASSED',
    },
    update: {
      title: q1Title,
      description: q1Description,
      starterHtml: q1StarterHtml,
      starterCss: q1StarterCss,
      starterJs: '',
      referenceHtml: q1StarterHtml,
      referenceCss: q1ReferenceCss,
      referenceJs: '',
      difficulty: 'EASY',
      points: 30,
      active: true,
      validation: 'PASSED',
    },
  });

  await prisma.questionTest.deleteMany({ where: { questionId: q1.id } });
  for (const t of q1Tests) {
    await prisma.questionTest.create({
      data: {
        questionId: q1.id,
        name: t.name,
        description: t.description,
        testType: 'DECLARATIVE',
        testCode: spec(t.body),
        points: t.points,
        order: t.order,
        hidden: t.hidden,
      },
    });
  }
  console.log(`Created/updated Q1: "${q1.title}" (${q1.id})`);

  // 2. Question 2: Grid layout
  const q2Slug = 'grid-layout';
  const q2Title = 'Grid layout';
  const q2Description = `Create a webpage containing 8 square boxes arranged in:
4 columns × 2 rows.

Your task is to write the CSS for .grid-container using CSS Grid.`;

  const q2StarterHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Grid Layout</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
  <div class="grid-container">
    <div class="box">Box 1</div>
    <div class="box">Box 2</div>
    <div class="box">Box 3</div>
    <div class="box">Box 4</div>
    <div class="box">Box 5</div>
    <div class="box">Box 6</div>
    <div class="box">Box 7</div>
    <div class="box">Box 8</div>
  </div>
</body>
</html>`;

  const q2StarterCss = `/* Write your grid CSS below */

.box {
  background-color: rgb(173, 216, 230);
  border: 1px solid black;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: sans-serif;
  font-size: 16px;
}`;

  const q2ReferenceCss = `.grid-container {
  display: grid;
  grid-template-columns: repeat(4, 100px);
  grid-template-rows: repeat(2, 100px);
  gap: 10px;
}

.box {
  background-color: rgb(173, 216, 230);
  border: 1px solid black;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: sans-serif;
  font-size: 16px;
}`;

  const q2Tests = [
    {
      name: 'Verify Grid Container Exists',
      description: 'Check that .grid-container exists in the DOM',
      points: 5,
      order: 0,
      hidden: false,
      body: { assertions: [{ type: 'exists', selector: '.grid-container' }] },
    },
    {
      name: 'Verify Number of Boxes',
      description: 'Check that exactly 8 boxes exist',
      points: 5,
      order: 1,
      hidden: false,
      body: { assertions: [{ type: 'count', selector: '.box', equals: 8 }] },
    },
    {
      name: 'Verify Box Text Sequence',
      description: 'Check that boxes contain Box 1 through Box 8',
      points: 5,
      order: 2,
      hidden: false,
      body: {
        assertions: [
          { type: 'text', selector: '.box:nth-child(1)', equals: 'Box 1' },
          { type: 'text', selector: '.box:nth-child(8)', equals: 'Box 8' },
        ],
      },
    },
    {
      name: 'Verify Grid Display Property',
      description: 'Check display: grid on .grid-container',
      points: 5,
      order: 3,
      hidden: false,
      body: {
        assertions: [{ type: 'css', selector: '.grid-container', property: 'display', equals: 'grid' }],
      },
    },
    {
      name: 'Verify Grid Columns Count',
      description: 'Check 4 columns on .grid-container',
      points: 5,
      order: 4,
      hidden: false,
      body: { assertions: [{ type: 'gridColumns', selector: '.grid-container', equals: 4 }] },
    },
    {
      name: 'Verify Gap Between Boxes',
      description: 'Check gap: 10px on .grid-container',
      points: 5,
      order: 5,
      hidden: false,
      body: { assertions: [{ type: 'gap', selector: '.grid-container', equals: 10 }] },
    },
    {
      name: 'Verify Box Square Shape',
      description: 'Check box dimensions are 100px width and 100px height',
      points: 5,
      order: 6,
      hidden: false,
      body: {
        assertions: [
          { type: 'size', selector: '.box', dimension: 'width', op: 'eq', value: 100, tolerance: 2 },
          { type: 'size', selector: '.box', dimension: 'height', op: 'eq', value: 100, tolerance: 2 },
        ],
      },
    },
  ];

  const q2 = await prisma.question.upsert({
    where: { slug: q2Slug },
    create: {
      title: q2Title,
      slug: q2Slug,
      description: q2Description,
      type: 'WEB',
      starterHtml: q2StarterHtml,
      starterCss: q2StarterCss,
      starterJs: '',
      referenceHtml: q2StarterHtml,
      referenceCss: q2ReferenceCss,
      referenceJs: '',
      difficulty: 'MEDIUM',
      points: 35,
      active: true,
      validation: 'PASSED',
    },
    update: {
      title: q2Title,
      description: q2Description,
      starterHtml: q2StarterHtml,
      starterCss: q2StarterCss,
      starterJs: '',
      referenceHtml: q2StarterHtml,
      referenceCss: q2ReferenceCss,
      referenceJs: '',
      difficulty: 'MEDIUM',
      points: 35,
      active: true,
      validation: 'PASSED',
    },
  });

  await prisma.questionTest.deleteMany({ where: { questionId: q2.id } });
  for (const t of q2Tests) {
    await prisma.questionTest.create({
      data: {
        questionId: q2.id,
        name: t.name,
        description: t.description,
        testType: 'DECLARATIVE',
        testCode: spec(t.body),
        points: t.points,
        order: t.order,
        hidden: t.hidden,
      },
    });
  }
  console.log(`Created/updated Q2: "${q2.title}" (${q2.id})`);

  // 3. Create the New Contest
  const contestTitle = 'Coding Contest';
  const existingExam = await prisma.exam.findFirst({ where: { title: contestTitle } });

  const exam = existingExam
    ? await prisma.exam.update({
        where: { id: existingExam.id },
        data: {
          description: 'Frontend Coding Contest: 1. Arrange the divs, 2. Grid layout.',
          durationMinutes: 90,
          status: 'PUBLISHED',
          active: true,
          startTime: new Date(Date.now() - 60 * 60 * 1000),
          endTime: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        },
      })
    : await prisma.exam.create({
        data: {
          title: contestTitle,
          description: 'Frontend Coding Contest: 1. Arrange the divs, 2. Grid layout.',
          durationMinutes: 90,
          status: 'PUBLISHED',
          active: true,
          startTime: new Date(Date.now() - 60 * 60 * 1000),
          endTime: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        },
      });

  await prisma.examQuestion.deleteMany({ where: { examId: exam.id } });
  await prisma.examQuestion.createMany({
    data: [
      { examId: exam.id, questionId: q1.id, order: 0 },
      { examId: exam.id, questionId: q2.id, order: 1 },
    ],
  });
  console.log(`Configured contest "${exam.title}" (${exam.id}) with 2 questions.`);

  // 4. Archive / Remove visibility of all OLD exams from student view
  const oldExams = await prisma.exam.findMany({
    where: { id: { not: exam.id } },
  });

  if (oldExams.length > 0) {
    await prisma.exam.updateMany({
      where: { id: { not: exam.id } },
      data: { status: 'ARCHIVED', active: false },
    });
    console.log(`Archived ${oldExams.length} old exam(s) so students only see the new contest.`);
  }

  // 5. Assign the new contest to EVERY student
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT' },
    select: { id: true, email: true },
  });

  const assignmentCount = await prisma.examAssignment.createMany({
    data: students.map((s) => ({ examId: exam.id, userId: s.id })),
    skipDuplicates: true,
  });

  console.log(
    `Assigned contest to ${students.length} student(s) (${assignmentCount.count} new assignments created).`,
  );
  console.log('--- Setup Complete ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
