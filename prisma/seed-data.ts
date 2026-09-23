/**
 * Seed question definitions.
 *
 * Kept free of any Prisma import so the specs can be imported and validated by
 * tooling (see scripts/verify-offline.mjs and tests/unit/seed-data.test.ts)
 * without a database or a generated client.
 */
import type { TestCaseBody } from '../shared/test-spec';

export interface SeedTest {
  name: string;
  description: string | null;
  hidden: boolean;
  points: number;
  order: number;
  body: TestCaseBody;
}

export interface SeedQuestion {
  title: string;
  slug: string;
  description: string;
  instructions: string;
  starterHtml: string;
  starterCss: string;
  starterJs: string;
  referenceHtml: string;
  referenceCss: string;
  referenceJs: string;
  tests: SeedTest[];
}

/* ------------------------------------------------------------------ */
/* Question 1: Click the button to color a box                         */
/* ------------------------------------------------------------------ */

export const boxQuestion: SeedQuestion = {
  title: 'Click the button to color a box',
  slug: 'click-the-button-to-color-a-box',
  description: `**Basic HTML code is given.**

- There is one box (\`div\`) and two buttons.
- When the first button ("Add color") is clicked, the box's background colour should become **tomato**.
- When the second button ("Remove color") is clicked, the box's background colour should become **white**.

**Important:** use JavaScript (DOM) only to change the colour.`,
  instructions: `Your solution is graded on what the page *does*, not on how you write it.
Any approach works -- \`style.backgroundColor\`, toggling a CSS class, \`setProperty\`,
or anything else -- as long as the rendered background colour ends up correct.`,
  starterHtml: `<div>
  <div id="box"></div>
  <button onclick="showText()">Add color</button>
  <button onclick="deleteText()">Remove color</button>
</div>`,
  starterCss: `#box {
  width: 100px;
  height: 100px;
  border: 1px solid black;
  margin: 0 40px 10px;
  border-radius: 4px;
  background-color: white;
}

button {
  padding: 5px 10px;
  border: none;
  color: white;
  border-radius: 3px;
  background-color: rgb(232, 169, 114);
  cursor: pointer;
}`,
  starterJs: `// function to add the color to the box
const mahi = document.querySelector("#box");

function showText() {
    // write your code here
}

// function to reset it to white
function deleteText() {
    // write your code here
}`,
  // Reference solution -- used by "Validate Question". Never shown to students.
  referenceHtml: `<div>
  <div id="box"></div>
  <button onclick="showText()">Add color</button>
  <button onclick="deleteText()">Remove color</button>
</div>`,
  referenceCss: `#box {
  width: 100px;
  height: 100px;
  border: 1px solid black;
  margin: 0 40px 10px;
  border-radius: 4px;
  background-color: white;
}

button {
  padding: 5px 10px;
  border: none;
  color: white;
  border-radius: 3px;
  background-color: rgb(232, 169, 114);
  cursor: pointer;
}`,
  referenceJs: `const mahi = document.querySelector("#box");

function showText() {
  mahi.style.backgroundColor = "tomato";
}

function deleteText() {
  mahi.style.backgroundColor = "white";
}`,
  tests: [
    {
      name: 'The box and both buttons are present',
      description: 'Checks the page still contains #box and the two buttons.',
      hidden: false,
      points: 5,
      order: 0,
      body: {
        assertions: [
          { type: 'exists', selector: '#box', message: 'Expected an element with id "box" on the page.' },
          { type: 'exists', selector: 'button', message: 'Expected the buttons to still be present.' },
          { type: 'count', selector: 'button', equals: 2, message: 'Expected exactly two buttons.' },
        ],
      } satisfies TestCaseBody,
    },
    {
      name: 'The box starts white',
      description: 'Before any click, the box background should be white.',
      hidden: true,
      points: 5,
      order: 1,
      body: {
        assertions: [
          {
            type: 'css',
            selector: '#box',
            property: 'background-color',
            equals: 'white',
            message: 'Before any button is clicked, the box background should be white.',
          },
        ],
      } satisfies TestCaseBody,
    },
    {
      name: 'Add color changes the box to tomato',
      description: null,
      hidden: true,
      points: 15,
      order: 2,
      body: {
        steps: [{ action: 'clickText', role: 'button', text: 'Add color' }],
        assertions: [
          {
            type: 'css',
            selector: '#box',
            property: 'background-color',
            equals: 'tomato',
            message: 'After clicking "Add color", the box background should be tomato (rgb(255, 99, 71)).',
          },
        ],
      } satisfies TestCaseBody,
    },
    {
      name: 'Remove color changes the box back to white',
      description: null,
      hidden: true,
      points: 10,
      order: 3,
      body: {
        steps: [
          { action: 'clickText', role: 'button', text: 'Add color' },
          { action: 'clickText', role: 'button', text: 'Remove color' },
        ],
        assertions: [
          {
            type: 'css',
            selector: '#box',
            property: 'background-color',
            equals: 'white',
            message: 'After clicking "Remove color", the box background should be white.',
          },
        ],
      } satisfies TestCaseBody,
    },
    {
      name: 'Both buttons work independently and repeatedly',
      description: null,
      hidden: true,
      points: 5,
      order: 4,
      body: {
        steps: [
          { action: 'clickText', role: 'button', text: 'Remove color' },
          { action: 'clickText', role: 'button', text: 'Add color' },
          { action: 'clickText', role: 'button', text: 'Add color' },
          { action: 'clickText', role: 'button', text: 'Remove color' },
          { action: 'clickText', role: 'button', text: 'Add color' },
        ],
        assertions: [
          {
            type: 'css',
            selector: '#box',
            property: 'background-color',
            equals: 'tomato',
            message: 'The buttons should keep working after being clicked several times.',
          },
        ],
      } satisfies TestCaseBody,
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Question 2: Responsive product grid                                 */
/* ------------------------------------------------------------------ */

const gridHtml = `<div class="container">
  <div class="item">iPad</div>
  <div class="item">MacBook</div>
  <div class="item">Apple Pencil</div>
  <div class="item">Apple Watch</div>
  <div class="item">AirPods</div>
  <div class="item">AirMax</div>
  <div class="item">Mac Mini</div>
  <div class="item">iPhone</div>
  <div class="item">Apple Tag</div>
</div>`;

export const gridQuestion: SeedQuestion = {
  title: 'Responsive product showcase',
  slug: 'responsive-product-showcase',
  description: `You are working on the **Everyday Essentials Showcase**.

You are given an HTML structure. **Do not modify the HTML.**
Write **CSS only**, using **CSS Grid and media queries**.

**Desktop (default -- no media query)**
- \`.container\`: CSS Grid, 3 equal columns, 20px gap
- \`.item\`: background \`#63af34\`, padding 20px, border-radius 6px, bold text, centre-aligned

**Tablet (max-width: 767px and min-width: 480px)**
- \`.container\`: 2 equal columns

**Mobile (max-width: 479px)**
- \`.container\`: a single column with a 25px gap`,
  instructions:
    'Tests measure the rendered layout at each viewport size, so any CSS that produces the required result passes.',
  starterHtml: gridHtml,
  starterCss: `/* Write your code here */
.container {
}

.item {
}`,
  starterJs: '',
  referenceHtml: gridHtml,
  referenceCss: `.container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.item {
  background-color: #63af34;
  padding: 20px;
  border-radius: 6px;
  font-weight: bold;
  text-align: center;
}

@media (max-width: 767px) and (min-width: 480px) {
  .container {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 479px) {
  .container {
    grid-template-columns: 1fr;
    gap: 25px;
  }
}`,
  referenceJs: '',
  tests: [
    {
      name: 'Displays 3 equal columns on large screens',
      description: 'Desktop layout at 1280x720.',
      hidden: false,
      points: 10,
      order: 0,
      body: {
        viewport: { width: 1280, height: 720 },
        assertions: [
          {
            type: 'gridColumns',
            selector: '.container',
            equals: 3,
            equalWidths: true,
            message: 'On desktop the container should render 3 equal columns.',
          },
          {
            type: 'gap',
            selector: '.container',
            equals: 20,
            message: 'On desktop the grid gap should be 20px.',
          },
        ],
      } satisfies TestCaseBody,
    },
    {
      name: 'Applies correct item background, padding, radius and weight',
      description: null,
      hidden: true,
      points: 10,
      order: 1,
      body: {
        viewport: { width: 1280, height: 720 },
        assertions: [
          { type: 'css', selector: '.item', property: 'background-color', equals: '#63af34' },
          { type: 'cssNumber', selector: '.item', property: 'padding-top', op: 'eq', value: 20 },
          { type: 'cssNumber', selector: '.item', property: 'border-top-left-radius', op: 'eq', value: 6 },
          { type: 'css', selector: '.item', property: 'font-weight', oneOf: ['700', 'bold'] },
          { type: 'css', selector: '.item', property: 'text-align', equals: 'center' },
        ],
      } satisfies TestCaseBody,
    },
    {
      name: 'Displays 2 columns on medium screens',
      description: null,
      hidden: true,
      points: 10,
      order: 2,
      body: {
        viewport: { width: 768, height: 1024 },
        assertions: [
          {
            type: 'boxesPerRow',
            selector: '.item',
            equals: 2,
            message: 'At 768px wide, two items should sit in the first row.',
          },
        ],
      } satisfies TestCaseBody,
    },
    {
      name: 'Displays a single column on screens 479px and below',
      description: null,
      hidden: true,
      points: 10,
      order: 3,
      body: {
        viewport: { width: 400, height: 800 },
        assertions: [
          {
            type: 'boxesPerRow',
            selector: '.item',
            equals: 1,
            message: 'At 400px wide, each item should be on its own row.',
          },
        ],
      } satisfies TestCaseBody,
    },
    {
      name: 'Uses a 25px gap on screens 479px and below',
      description: null,
      hidden: true,
      points: 10,
      order: 4,
      body: {
        viewport: { width: 400, height: 800 },
        assertions: [
          {
            type: 'gap',
            selector: '.container',
            equals: 25,
            message: 'On small screens the gap should be 25px.',
          },
        ],
      } satisfies TestCaseBody,
    },
  ],
};

export const seedQuestions: SeedQuestion[] = [boxQuestion, gridQuestion];
