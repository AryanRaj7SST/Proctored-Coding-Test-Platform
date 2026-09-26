/* eslint-disable no-console */
/**
 * Seed script for "Campus Product Card — Selectors and Box Model"
 *
 * Adds the question with 14 declarative test cases totaling 100 points,
 * following the Question + QuestionTest schema established in scripts/create-lab-quiz-1.ts.
 *
 * Usage:
 *   npx tsx scripts/seed-campus-product-card.ts
 */

import { PrismaClient } from '@prisma/client';
import type { TestCaseBody } from '../shared/test-spec';

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

export const campusProductCardQuestion: QuestionDef = {
  title: 'Campus Product Card — Selectors and Box Model',
  slug: 'campus-product-card-selectors-and-box-model',
  description: `**Problem Description:**
Create a product card for a student product such as a backpack, notebook, or laptop sleeve.

### Requirements
Use CSS selectors and box-model properties to style the card.

The card must include:
- Product image/visual area
- Product name
- Description
- Price
- Add to Cart button
- Border
- Border radius
- Padding
- Margin
- Width
- Background color
- Text styling
- Box shadow

**Use a combination of:**
- Element selectors
- Class selectors
- ID selector where appropriate
- Pseudo-class such as :hover

![Campus Product Card reference](https://res.cloudinary.com/vrwhzinu/image/upload/v1788887160/Screenshot_2026-09-08_223536.png)`,
  instructions:
    'Build the HTML elements with the required class names inside the body and style them in CSS. Tests verify element existence, visibility, box-model properties, colors, and hover states.',
  starterHtml: `<!DOCTYPE html>
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

    <!-- Create and style the product card here -->

</body>
</html>`,
  starterCss: '',
  starterJs: '',
  referenceHtml: `<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="product-card">
        <img class="product-image" src="profile.png" alt="Campus Backpack" />
        <h2 class="product-name">Campus Backpack</h2>
        <p class="product-description">A durable and stylish backpack perfect for campus life.</p>
        <p class="product-price">₹999</p>
        <button class="add-to-cart">Add to Cart</button>
    </div>
</body>
</html>`,
  referenceCss: `body {
    font-family: Arial, sans-serif;
    background-color: #f5f5f5;
    margin: 0;
    padding: 20px;
}

.product-card {
    width: 280px;
    margin: 20px auto;
    padding: 16px;
    background-color: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    text-align: center;
}

.product-image {
    width: 100%;
    height: 160px;
    object-fit: cover;
    border-radius: 6px;
    background-color: #f3f4f6;
    display: block;
    margin-bottom: 12px;
}

.product-name {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: #1f2937;
}

.product-description {
    font-size: 14px;
    color: #4b5563;
    margin: 0 0 12px 0;
    line-height: 1.4;
}

.product-price {
    font-size: 20px;
    font-weight: bold;
    color: #16a34a;
    margin: 0 0 16px 0;
}

.add-to-cart {
    display: inline-block;
    width: 100%;
    padding: 10px 16px;
    background-color: #2563eb;
    color: #ffffff;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
}

.add-to-cart:hover {
    background-color: #1d4ed8;
}
`,
  referenceJs: '',
  tests: [
    {
      name: 'Structure: all required elements exist',
      description:
        'Checks that .product-card, .product-image, .product-name, .product-description, .product-price, and .add-to-cart elements exist.',
      hidden: false,
      points: 15,
      order: 0,
      body: {
        assertions: [
          { type: 'exists', selector: '.product-card' },
          { type: 'exists', selector: '.product-image' },
          { type: 'exists', selector: '.product-name' },
          { type: 'exists', selector: '.product-description' },
          { type: 'exists', selector: '.product-price' },
          { type: 'exists', selector: '.add-to-cart' },
        ],
      },
    },
    {
      name: 'Elements are visible',
      description:
        'Checks that .product-image, .product-name, .product-description, .product-price, and .add-to-cart are visible.',
      hidden: false,
      points: 10,
      order: 1,
      body: {
        assertions: [
          { type: 'visible', selector: '.product-image' },
          { type: 'visible', selector: '.product-name' },
          { type: 'visible', selector: '.product-description' },
          { type: 'visible', selector: '.product-price' },
          { type: 'visible', selector: '.add-to-cart' },
        ],
      },
    },
    {
      name: 'Card has a visible border',
      description: 'Checks that .product-card has border-top-width > 0.',
      hidden: false,
      points: 10,
      order: 2,
      body: {
        assertions: [
          {
            type: 'cssNumber',
            selector: '.product-card',
            property: 'border-top-width',
            op: 'gt',
            value: 0,
            tolerance: 0,
          },
        ],
      },
    },
    {
      name: 'Border radius applied',
      description: 'Checks that .product-card has border-top-left-radius > 0.',
      hidden: false,
      points: 5,
      order: 3,
      body: {
        assertions: [
          {
            type: 'cssNumber',
            selector: '.product-card',
            property: 'border-top-left-radius',
            op: 'gt',
            value: 0,
            tolerance: 0,
          },
        ],
      },
    },
    {
      name: 'Padding applied',
      description: 'Checks that .product-card has padding-top >= 12 and padding-left >= 12.',
      hidden: false,
      points: 10,
      order: 4,
      body: {
        assertions: [
          {
            type: 'cssNumber',
            selector: '.product-card',
            property: 'padding-top',
            op: 'gte',
            value: 12,
            tolerance: 2,
          },
          {
            type: 'cssNumber',
            selector: '.product-card',
            property: 'padding-left',
            op: 'gte',
            value: 12,
            tolerance: 2,
          },
        ],
      },
    },
    {
      name: 'Margin applied',
      description: 'Checks that .product-card has margin-bottom >= 8.',
      hidden: false,
      points: 5,
      order: 5,
      body: {
        assertions: [
          {
            type: 'cssNumber',
            selector: '.product-card',
            property: 'margin-bottom',
            op: 'gte',
            value: 8,
            tolerance: 2,
          },
        ],
      },
    },
    {
      name: 'Width constrained',
      description: 'Checks that .product-card width is between 220px and 360px.',
      hidden: false,
      points: 5,
      order: 6,
      body: {
        assertions: [
          {
            type: 'cssNumber',
            selector: '.product-card',
            property: 'width',
            op: 'gte',
            value: 220,
            tolerance: 0,
          },
          {
            type: 'cssNumber',
            selector: '.product-card',
            property: 'width',
            op: 'lte',
            value: 360,
            tolerance: 0,
          },
        ],
      },
    },
    {
      name: 'Background color set',
      description: 'Checks that .product-card has a valid light background color.',
      hidden: false,
      points: 5,
      order: 7,
      body: {
        assertions: [
          {
            type: 'css',
            selector: '.product-card',
            property: 'background-color',
            oneOf: ['#ffffff', 'white', '#f9fafb', '#f8f9fa'],
            color: true,
          },
        ],
      },
    },
    {
      name: 'Product name is bold and legible',
      description: 'Checks that .product-name has font-weight >= 600 and font-size >= 16px.',
      hidden: false,
      points: 5,
      order: 8,
      body: {
        assertions: [
          {
            type: 'cssNumber',
            selector: '.product-name',
            property: 'font-weight',
            op: 'gte',
            value: 600,
            tolerance: 0,
          },
          {
            type: 'cssNumber',
            selector: '.product-name',
            property: 'font-size',
            op: 'gte',
            value: 16,
            tolerance: 0,
          },
        ],
      },
    },
    {
      name: 'Price is styled distinctly (green)',
      description: 'Checks that .product-price is styled in green.',
      hidden: false,
      points: 5,
      order: 9,
      body: {
        assertions: [
          {
            type: 'css',
            selector: '.product-price',
            property: 'color',
            oneOf: ['#16a34a', 'green', 'rgb(22, 163, 74)'],
            color: true,
          },
        ],
      },
    },
    {
      name: 'Box shadow present',
      description:
        'Checks that .product-card has box shadow. Note: computed box-shadow string may vary across browsers and can be refined during admin validation.',
      hidden: false,
      points: 5,
      order: 10,
      body: {
        assertions: [
          {
            type: 'css',
            selector: '.product-card',
            property: 'box-shadow',
            oneOf: ['rgba(0, 0, 0, 0.08) 0px 4px 12px 0px'],
          },
        ],
      },
    },
    {
      name: 'Add to Cart: default color',
      description: 'Checks that .add-to-cart has blue background color.',
      hidden: false,
      points: 5,
      order: 11,
      body: {
        assertions: [
          {
            type: 'css',
            selector: '.add-to-cart',
            property: 'background-color',
            oneOf: ['#2563eb', 'rgb(37, 99, 235)'],
            color: true,
          },
        ],
      },
    },
    {
      name: 'Add to Cart: hover state changes color',
      description: 'Checks that hovering over .add-to-cart changes its background color.',
      hidden: false,
      points: 10,
      order: 12,
      body: {
        steps: [{ action: 'hover', selector: '.add-to-cart' }],
        assertions: [
          {
            type: 'css',
            selector: '.add-to-cart',
            property: 'background-color',
            oneOf: ['#1d4ed8', 'rgb(29, 78, 216)'],
            color: true,
          },
        ],
      },
    },
    {
      name: 'No console errors',
      description: 'Ensures execution produces no console errors.',
      hidden: true,
      points: 5,
      order: 13,
      body: {
        assertions: [{ type: 'noConsoleErrors' }],
      },
    },
  ],
};

async function main(): Promise<void> {
  console.log('--- Seeding Question: Campus Product Card — Selectors and Box Model ---');

  const q = campusProductCardQuestion;
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
    tags: ['html', 'css', 'box-model', 'selectors'],
    status: 'DRAFT' as const,
    validation: 'NOT_VALIDATED' as const,
    validationMessage:
      'Reference solution required. Must be completed and validated via admin UI "Save & validate" before publishing.',
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

  console.log('\n--- Seeding Complete ---');
  console.log('Next step: Human author must open Question in admin UI, add reference CSS,');
  console.log('and run "Save & validate". Note: Test 11 (box-shadow) is flagged as brittle');
  console.log('and may need its computed string adjusted based on browser runner output.');
}

if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].replace(/\\/g, '/').endsWith('seed-campus-product-card.ts')
) {
  main()
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
