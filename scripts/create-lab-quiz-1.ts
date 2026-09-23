import { PrismaClient } from '@prisma/client';
import type { TestCaseBody } from '../shared/test-spec';

const prisma = new PrismaClient();

const spec = (body: unknown): string => JSON.stringify(body, null, 2);

export interface ExamQuestionDef {
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
  tests: {
    name: string;
    description: string | null;
    hidden: boolean;
    points: number;
    order: number;
    body: TestCaseBody;
  }[];
}

export const labQuestions: ExamQuestionDef[] = [
  // --------------------------------------------------------------------------
  // Q1: 2048 Game Styling
  // --------------------------------------------------------------------------
  {
    title: '2048 Game Styling',
    slug: '2048-game-styling',
    description: `Style the supplied 2048 game interface according to the requirements below.

![2048 Game Reference](https://d3dyfaf3iutrxo.cloudfront.net/thumbnail/assignment/question/cadc9666c939403998fc4b7153c5b350.png)

### Requirements

#### \`.game-board\`
- Use CSS Grid (\`display: grid;\`).
- Have 4 columns, each \`1fr\` (\`grid-template-columns: repeat(4, 1fr);\`).
- Set gap: \`10px\` (\`gap: 10px;\`).
- Background color: \`#bfa075\` (\`rgb(191, 160, 117)\`).
- Border radius: \`5px\` (\`border-radius: 5px;\`).
- Padding: \`10px\` (\`padding: 10px;\`).
- Top margin: \`20px\` (\`margin-top: 20px;\`).

#### \`.tile\`
- Use Flexbox (\`display: flex;\`).
- Center its content horizontally and vertically (\`justify-content: center; align-items: center;\`).
- Background color: \`#feb34a\` (\`rgb(254, 179, 74)\`).
- Border radius: \`5px\` (\`border-radius: 5px;\`).
- Height: \`80px\` (\`height: 80px;\`).
- Text color: \`#fff\` (white).
- Font size: \`24px\` (\`font-size: 24px;\`).
- Font weight: \`bold\` (\`font-weight: bold;\`).

#### \`.score\`
- Font size: \`18px\` (\`font-size: 18px;\`).
- Top margin: \`20px\` (\`margin-top: 20px;\`).

#### \`.new-game-button\`
- Background color: \`#80756a\`.
- Text color: \`#fff\`.
- Remove default border (\`border: none;\`).
- Border radius: \`5px\` (\`border-radius: 5px;\`).
- Padding: \`10px 20px\` (\`padding: 10px 20px;\`).
- Top margin: \`20px\` (\`margin-top: 20px;\`).
- Font size: \`16px\` (\`font-size: 16px;\`).
- Cursor must become pointer on hover (\`cursor: pointer;\`).`,
    instructions: `Do not modify the HTML structure. Add the required CSS in the CSS editor tab. Tests evaluate computed styling rules and layout metrics.`,
    starterHtml: `<div class="container">
  <h1>Let's Play</h1>
  <div class="game-board">
    <div class="tile tile-2">2</div>
    <div class="tile tile-0">0</div>
    <div class="tile tile-4">4</div>
    <div class="tile tile-8">8</div>
  </div>
  <div class="score">Score: 0</div>
  <button class="new-game-button">New Game</button>
</div>`,
    starterCss: `body {
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

/* Write your CSS code below */
`,
    starterJs: '',
    referenceHtml: `<div class="container">
  <h1>Let's Play</h1>
  <div class="game-board">
    <div class="tile tile-2">2</div>
    <div class="tile tile-0">0</div>
    <div class="tile tile-4">4</div>
    <div class="tile tile-8">8</div>
  </div>
  <div class="score">Score: 0</div>
  <button class="new-game-button">New Game</button>
</div>`,
    referenceCss: `body {
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
  height: 80px;
  color: #fff;
  font-size: 24px;
  font-weight: bold;
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
}`,
    referenceJs: '',
    tests: [
      {
        name: '.game-board layout: display grid with 4 equal 1fr columns and 10px gap',
        description: 'Checks that .game-board is a CSS grid with 4 columns and 10px gap.',
        hidden: false,
        points: 5,
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
        points: 5,
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
        points: 5,
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
        points: 5,
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
    ],
  },

  // --------------------------------------------------------------------------
  // Q2: Arrange the divs
  // --------------------------------------------------------------------------
  {
    title: 'Arrange the divs',
    slug: 'arrange-the-divs',
    description: `Use CSS Grid to reproduce the supplied reference layout.

![Arrange the divs Reference](https://d3dyfaf3iutrxo.cloudfront.net/thumbnail/assignment/question/03020e7d3ddd47cb9d80a2fc91821a39.jpeg)

### Requirements

#### \`#grid-container\`
- \`display: grid;\`
- Two equal-width columns of 50px each (\`grid-template-columns: 50px 50px;\` or \`repeat(2, 50px);\`).
- Two equal-height rows of 50px each (\`grid-template-rows: 50px 50px;\` or \`repeat(2, 50px);\`).
- Gap: \`10px\` (\`gap: 10px;\`).

#### \`.grid-item\`
- Background color: \`rgb(173, 216, 230)\` (or \`#add8e6\`).
- Border: \`2px solid rgb(0, 0, 0)\` (or \`#000\`).
- Line height: \`50px\` (\`line-height: 50px;\`).
- Text centered (\`text-align: center;\`).

#### \`#item1\`
- Must span both rows (\`grid-row: span 2;\` or \`grid-row: 1 / span 2;\` or \`1 / 3;\`).`,
    instructions: `Write your styles in the CSS editor. Do not alter the HTML container or item IDs.`,
    starterHtml: `<div id="grid-container">
  <div class="grid-item" id="item1">Item 1</div>
  <div class="grid-item" id="item2">Item 2</div>
  <div class="grid-item" id="item3">Item 3</div>
  <div class="grid-item" id="item4">Item 4</div>
</div>`,
    starterCss: `/* css code goes here */\n`,
    starterJs: '',
    referenceHtml: `<div id="grid-container">
  <div class="grid-item" id="item1">Item 1</div>
  <div class="grid-item" id="item2">Item 2</div>
  <div class="grid-item" id="item3">Item 3</div>
  <div class="grid-item" id="item4">Item 4</div>
</div>`,
    referenceCss: `#grid-container {
  display: grid;
  grid-template-columns: 50px 50px;
  grid-template-rows: 50px 50px;
  gap: 10px;
}

.grid-item {
  background-color: rgb(173, 216, 230);
  border: 2px solid rgb(0, 0, 0);
  line-height: 50px;
  text-align: center;
}

#item1 {
  grid-row: span 2;
}`,
    referenceJs: '',
    tests: [
      {
        name: '#grid-container is a CSS Grid with 10px gap',
        description: 'Verifies #grid-container uses display: grid and gap: 10px.',
        hidden: false,
        points: 5,
        order: 0,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '#grid-container',
              property: 'display',
              equals: 'grid',
              message: 'Expected #grid-container to have display: grid',
            },
            {
              type: 'gap',
              selector: '#grid-container',
              equals: 10,
              message: 'Expected #grid-container to have gap: 10px',
            },
          ],
        },
      },
      {
        name: '#grid-container has two 50px columns and two 50px rows',
        description: 'Verifies grid-template-columns and grid-template-rows are 50px 50px.',
        hidden: true,
        points: 5,
        order: 1,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '#grid-container',
              property: 'grid-template-columns',
              equals: '50px 50px',
              message: 'Expected grid-template-columns to be 50px 50px',
            },
            {
              type: 'css',
              selector: '#grid-container',
              property: 'grid-template-rows',
              equals: '50px 50px',
              message: 'Expected grid-template-rows to be 50px 50px',
            },
          ],
        },
      },
      {
        name: '.grid-item styling: rgb(173, 216, 230) background, 2px solid border, 50px line-height, centered text',
        description: 'Checks background, border, line-height, and text alignment on .grid-item.',
        hidden: true,
        points: 5,
        order: 2,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '.grid-item',
              property: 'background-color',
              equals: 'rgb(173, 216, 230)',
              color: true,
              message: 'Expected .grid-item background-color to be rgb(173, 216, 230)',
            },
            {
              type: 'css',
              selector: '.grid-item',
              property: 'border',
              equals: '2px solid rgb(0, 0, 0)',
              message: 'Expected .grid-item border to be 2px solid rgb(0, 0, 0)',
            },
            {
              type: 'css',
              selector: '.grid-item',
              property: 'line-height',
              equals: '50px',
              message: 'Expected .grid-item line-height to be 50px',
            },
            {
              type: 'css',
              selector: '.grid-item',
              property: 'text-align',
              equals: 'center',
              message: 'Expected .grid-item text-align to be center',
            },
          ],
        },
      },
      {
        name: '#item1 spans two grid rows',
        description: 'Verifies #item1 has grid-row: span 2.',
        hidden: true,
        points: 5,
        order: 3,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '#item1',
              property: 'grid-row',
              equals: 'span 2',
              message: 'Expected #item1 to span two rows (grid-row: span 2)',
            },
          ],
        },
      },
    ],
  },

  // --------------------------------------------------------------------------
  // Q3: Profile Building
  // --------------------------------------------------------------------------
  {
    title: 'Profile Building',
    slug: 'profile-building',
    description: `Style the supplied profile card according to the specifications and reference image.

![Profile Building Reference](https://d3dyfaf3iutrxo.cloudfront.net/ckeditor_uploads/2025/11/15/27a5774778a44e9794ccdfa6419f6fd6.png)

### Requirements

#### \`.profile-card\`
- Width: \`300px\`.
- Background: \`#f4f4f4\`.
- Border: \`1px groove #ccc\`.
- Border radius: \`10px\`.
- Centered horizontally using margin (\`margin: 20px auto;\`).
- Vertical margin: \`20px\`.
- Padding: \`15px\`.
- All text centered horizontally (\`text-align: center;\`).

#### \`.profile-image\`
- Width: \`100px\`.
- Circular shape (\`border-radius: 50%;\`).
- Border: \`2px outset #555\`.

#### \`.profile-name\`
- Font weight: \`600\`.
- Font size: \`1.5em\` (or \`24px\`).
- Color: \`#333\`.
- Line height: \`1.2\`.

#### \`.profile-bio\`
- Color: \`#666\`.
- Vertical margin: \`10px\`.
- Horizontal margin: \`0\`.

#### \`.social-icons\`
- Use Flexbox (\`display: flex;\`).
- Horizontally center the icons on the main axis (\`justify-content: center;\`).

#### Social icons (\`span\` inside \`.social-icons\`)
- Dimensions: \`30px\` width and \`30px\` height.
- Circular (\`border-radius: 50%;\`).
- Background: \`#ddd\`.
- Text centered horizontally and vertically.`,
    instructions: `Style the HTML structure provided. Ensure all classes match the requirements.`,
    starterHtml: `<div class="profile-card">
    <div>
        <img class="profile-image" src="https://d3dyfaf3iutrxo.cloudfront.net/general/upload/c7a480e5f6aa4ded81227e6c4547a6b3-avatar-1577909_1280.webp" alt="Profile Picture" />
    </div>
    <span class="profile-name">John Doe</span>
    <div class="profile-bio">Web Developer | Tech Enthusiast | Blogger</div>
    <div class="social-icons">
        <span>FB</span>
        <span>TW</span>
        <span>IG</span>
    </div>
</div>`,
    starterCss: `/* css code goes here */\n`,
    starterJs: '',
    referenceHtml: `<div class="profile-card">
    <div>
        <img class="profile-image" src="https://d3dyfaf3iutrxo.cloudfront.net/general/upload/c7a480e5f6aa4ded81227e6c4547a6b3-avatar-1577909_1280.webp" alt="Profile Picture" />
    </div>
    <span class="profile-name">John Doe</span>
    <div class="profile-bio">Web Developer | Tech Enthusiast | Blogger</div>
    <div class="social-icons">
        <span>FB</span>
        <span>TW</span>
        <span>IG</span>
    </div>
</div>`,
    referenceCss: `.profile-card {
  width: 300px;
  background-color: #f4f4f4;
  border: 1px groove #ccc;
  border-radius: 10px;
  margin: 20px auto;
  padding: 15px;
  text-align: center;
}

.profile-image {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border: 2px outset #555;
  object-fit: cover;
}

.profile-name {
  font-weight: 600;
  font-size: 1.5em;
  color: #333;
  line-height: 1.2;
  display: block;
}

.profile-bio {
  color: #666;
  margin: 10px 0;
}

.social-icons {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.social-icons span {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background-color: #ddd;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}`,
    referenceJs: '',
    tests: [
      {
        name: '.profile-card width is 300px',
        description: 'Checks that .profile-card width is 300px.',
        hidden: false,
        points: 2,
        order: 0,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '.profile-card',
              property: 'width',
              equals: '300px',
              message: 'Expected .profile-card to have width: 300px',
            },
          ],
        },
      },
      {
        name: '.profile-card background is #f4f4f4',
        description: 'Checks background color of .profile-card.',
        hidden: true,
        points: 2,
        order: 1,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '.profile-card',
              property: 'background-color',
              equals: '#f4f4f4',
              color: true,
              message: 'Expected .profile-card background to be #f4f4f4',
            },
          ],
        },
      },
      {
        name: '.profile-card border is 1px groove #ccc',
        description: 'Checks border width, style, and color of .profile-card.',
        hidden: true,
        points: 2,
        order: 2,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '.profile-card',
              property: 'border-width',
              equals: '1px',
              message: 'Expected .profile-card border-width to be 1px',
            },
            {
              type: 'css',
              selector: '.profile-card',
              property: 'border-style',
              equals: 'groove',
              message: 'Expected .profile-card border-style to be groove',
            },
            {
              type: 'css',
              selector: '.profile-card',
              property: 'border-color',
              equals: '#cccccc',
              color: true,
              message: 'Expected .profile-card border-color to be #ccc',
            },
          ],
        },
      },
      {
        name: '.profile-card border-radius is 10px',
        description: 'Checks border-radius of .profile-card.',
        hidden: true,
        points: 2,
        order: 3,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '.profile-card',
              property: 'border-radius',
              equals: '10px',
              message: 'Expected .profile-card border-radius to be 10px',
            },
          ],
        },
      },
      {
        name: '.profile-card margin and padding',
        description: 'Checks margin centering and padding of .profile-card.',
        hidden: true,
        points: 2,
        order: 4,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '.profile-card',
              property: 'margin-top',
              equals: '20px',
              message: 'Expected .profile-card margin-top to be 20px',
            },
            {
              type: 'css',
              selector: '.profile-card',
              property: 'margin-bottom',
              equals: '20px',
              message: 'Expected .profile-card margin-bottom to be 20px',
            },
            {
              type: 'css',
              selector: '.profile-card',
              property: 'padding-top',
              equals: '15px',
              message: 'Expected .profile-card padding to be 15px',
            },
          ],
        },
      },
      {
        name: '.profile-card text-align is center',
        description: 'Checks horizontal text centering of .profile-card.',
        hidden: true,
        points: 2,
        order: 5,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '.profile-card',
              property: 'text-align',
              equals: 'center',
              message: 'Expected .profile-card text-align to be center',
            },
          ],
        },
      },
      {
        name: '.profile-image width is 100px',
        description: 'Checks width of .profile-image.',
        hidden: true,
        points: 2,
        order: 6,
        body: {
          assertions: [
            {
              type: 'cssNumber',
              selector: '.profile-image',
              property: 'width',
              op: 'eq',
              value: 100,
              tolerance: 10,
              message: 'Expected .profile-image width to be approximately 100px',
            },
          ],
        },
      },
      {
        name: '.profile-image circular shape (border-radius 50%)',
        description: 'Checks circular border-radius of .profile-image.',
        hidden: true,
        points: 2,
        order: 7,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '.profile-image',
              property: 'border-radius',
              equals: '50%',
              message: 'Expected .profile-image border-radius to be 50%',
            },
          ],
        },
      },
      {
        name: '.profile-image border: 2px outset #555',
        description: 'Checks .profile-image 2px outset #555 border.',
        hidden: true,
        points: 1,
        order: 8,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '.profile-image',
              property: 'border-width',
              equals: '2px',
              message: 'Expected .profile-image border-width to be 2px',
            },
            {
              type: 'css',
              selector: '.profile-image',
              property: 'border-style',
              equals: 'outset',
              message: 'Expected .profile-image border-style to be outset',
            },
            {
              type: 'css',
              selector: '.profile-image',
              property: 'border-color',
              equals: '#555555',
              color: true,
              message: 'Expected .profile-image border-color to be #555',
            },
          ],
        },
      },
      {
        name: '.profile-name font styling',
        description: 'Checks typography, font weight 600, and color for .profile-name.',
        hidden: true,
        points: 1,
        order: 9,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '.profile-name',
              property: 'font-weight',
              oneOf: ['600', 'bold'],
              message: 'Expected .profile-name to have font-weight: 600',
            },
            {
              type: 'css',
              selector: '.profile-name',
              property: 'color',
              equals: '#333333',
              color: true,
              message: 'Expected .profile-name color to be #333',
            },
          ],
        },
      },
      {
        name: '.profile-bio styling',
        description: 'Checks typography, color #666, and vertical margin for .profile-bio.',
        hidden: true,
        points: 1,
        order: 10,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '.profile-bio',
              property: 'color',
              equals: '#666666',
              color: true,
              message: 'Expected .profile-bio color to be #666',
            },
            {
              type: 'css',
              selector: '.profile-bio',
              property: 'margin-top',
              equals: '10px',
              message: 'Expected .profile-bio vertical margin to be 10px',
            },
          ],
        },
      },
      {
        name: '.social-icons layout and icon styling',
        description: 'Checks Flexbox centering and social icon size, shape, and background.',
        hidden: true,
        points: 1,
        order: 11,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '.social-icons',
              property: 'display',
              equals: 'flex',
              message: 'Expected .social-icons to use display: flex',
            },
            {
              type: 'css',
              selector: '.social-icons',
              property: 'justify-content',
              equals: 'center',
              message: 'Expected .social-icons to center items horizontally',
            },
            {
              type: 'css',
              selector: '.social-icons span',
              property: 'width',
              equals: '30px',
              message: 'Expected social icon width to be 30px',
            },
            {
              type: 'css',
              selector: '.social-icons span',
              property: 'height',
              equals: '30px',
              message: 'Expected social icon height to be 30px',
            },
            {
              type: 'css',
              selector: '.social-icons span',
              property: 'border-radius',
              equals: '50%',
              message: 'Expected social icon border-radius to be 50%',
            },
            {
              type: 'css',
              selector: '.social-icons span',
              property: 'background-color',
              equals: '#dddddd',
              color: true,
              message: 'Expected social icon background to be #ddd',
            },
          ],
        },
      },
    ],
  },

  // --------------------------------------------------------------------------
  // Q4: HTML Feedback Form
  // --------------------------------------------------------------------------
  {
    title: 'HTML Feedback Form',
    slug: 'html-feedback-form',
    description: `Build the required HTML feedback form. Focus on semantic HTML, correct input types, IDs, labels, validation attributes, and form submission method.

![HTML Feedback Form Reference](https://d3dyfaf3iutrxo.cloudfront.net/thumbnail/assignment/question/d3b2d52946ae4423a3e6c567eaf7c8e8.png)

### Requirements

1. **Heading**: Create a heading with text \`Feedback Form\`.
2. **Form**: Must use \`method="POST"\`.
3. **Name input**:
   - ID: \`name\`
   - Appropriate text input type (\`type="text"\`).
   - Must be \`required\`.
   - Minimum length: \`3\` (\`minlength="3"\`).
   - Maximum length: \`50\` (\`maxlength="50"\`).
4. **Portfolio input**:
   - ID: \`portfolio\`
   - Appropriate URL input type (\`type="url"\`).
   - Must be \`required\`.
5. **Favourite color**:
   - ID: \`favColor\`
   - Must allow the user to select a color (\`type="color"\`).
6. **Likeness**:
   - ID: \`likeness\`
   - Must be a slider/range input (\`type="range"\`).
   - Minimum: \`1\` (\`min="1"\`).
   - Maximum: \`100\` (\`max="100"\`).
7. **Labels**:
   - Every input must have an associated \`<label>\` whose \`for\` attribute exactly matches the input ID (\`for="name"\`, \`for="portfolio"\`, \`for="favColor"\`, \`for="likeness"\`).
8. **Submit Button**:
   - \`type="submit"\`
   - Text: \`Submit\``,
    instructions: `Write complete, valid HTML inside the HTML editor. Focus on attributes, IDs, and semantic elements.`,
    starterHtml: `<!-- html code goes here -->\n`,
    starterCss: '',
    starterJs: '',
    referenceHtml: `<h1>Feedback Form</h1>
<form method="POST">
  <div>
    <label for="name">Name:</label>
    <input type="text" id="name" name="name" required minlength="3" maxlength="50" />
  </div>
  <div>
    <label for="portfolio">Portfolio:</label>
    <input type="url" id="portfolio" name="portfolio" required />
  </div>
  <div>
    <label for="favColor">Favourite Color:</label>
    <input type="color" id="favColor" name="favColor" />
  </div>
  <div>
    <label for="likeness">Likeness:</label>
    <input type="range" id="likeness" name="likeness" min="1" max="100" />
  </div>
  <div>
    <button type="submit">Submit</button>
  </div>
</form>`,
    referenceCss: '',
    referenceJs: '',
    tests: [
      {
        name: 'Form element exists with method="POST" and heading',
        description: 'Checks form method="POST" and heading element with text Feedback Form.',
        hidden: false,
        points: 4,
        order: 0,
        body: {
          assertions: [
            { type: 'exists', selector: 'form', message: 'Expected a <form> element on the page.' },
            {
              type: 'attribute',
              selector: 'form',
              name: 'method',
              equals: 'POST',
              message: 'Expected form to have method="POST".',
            },
            {
              type: 'text',
              selector: 'h1, h2, h3',
              contains: 'Feedback Form',
              message: 'Expected a heading with text "Feedback Form".',
            },
          ],
        },
      },
      {
        name: 'Name input exists with type="text", required, minlength="3", maxlength="50"',
        description: 'Validates input#name element attributes.',
        hidden: true,
        points: 4,
        order: 1,
        body: {
          assertions: [
            { type: 'exists', selector: 'input#name', message: 'Expected an input with id="name".' },
            {
              type: 'attribute',
              selector: 'input#name',
              name: 'type',
              equals: 'text',
              message: 'Expected input#name to have type="text".',
            },
            {
              type: 'exists',
              selector: 'input#name[required]',
              message: 'Expected input#name to have required attribute.',
            },
            {
              type: 'attribute',
              selector: 'input#name',
              name: 'minlength',
              equals: '3',
              message: 'Expected input#name to have minlength="3".',
            },
            {
              type: 'attribute',
              selector: 'input#name',
              name: 'maxlength',
              equals: '50',
              message: 'Expected input#name to have maxlength="50".',
            },
          ],
        },
      },
      {
        name: 'Portfolio input has type="url" and required',
        description: 'Validates input#portfolio type and required attribute.',
        hidden: true,
        points: 4,
        order: 2,
        body: {
          assertions: [
            {
              type: 'exists',
              selector: 'input#portfolio',
              message: 'Expected an input with id="portfolio".',
            },
            {
              type: 'attribute',
              selector: 'input#portfolio',
              name: 'type',
              equals: 'url',
              message: 'Expected input#portfolio to have type="url".',
            },
            {
              type: 'exists',
              selector: 'input#portfolio[required]',
              message: 'Expected input#portfolio to have required attribute.',
            },
          ],
        },
      },
      {
        name: 'favColor is type="color" and likeness is type="range" with min="1" max="100"',
        description: 'Validates color picker and range slider attributes.',
        hidden: true,
        points: 4,
        order: 3,
        body: {
          assertions: [
            { type: 'exists', selector: 'input#favColor', message: 'Expected an input with id="favColor".' },
            {
              type: 'attribute',
              selector: 'input#favColor',
              name: 'type',
              equals: 'color',
              message: 'Expected input#favColor to have type="color".',
            },
            { type: 'exists', selector: 'input#likeness', message: 'Expected an input with id="likeness".' },
            {
              type: 'attribute',
              selector: 'input#likeness',
              name: 'type',
              equals: 'range',
              message: 'Expected input#likeness to have type="range".',
            },
            {
              type: 'attribute',
              selector: 'input#likeness',
              name: 'min',
              equals: '1',
              message: 'Expected input#likeness to have min="1".',
            },
            {
              type: 'attribute',
              selector: 'input#likeness',
              name: 'max',
              equals: '100',
              message: 'Expected input#likeness to have max="100".',
            },
          ],
        },
      },
      {
        name: 'Labels with matching for attributes and submit button',
        description: 'Validates associated labels and submit button.',
        hidden: true,
        points: 4,
        order: 4,
        body: {
          assertions: [
            { type: 'exists', selector: 'label[for="name"]', message: 'Expected a label with for="name".' },
            {
              type: 'exists',
              selector: 'label[for="portfolio"]',
              message: 'Expected a label with for="portfolio".',
            },
            {
              type: 'exists',
              selector: 'label[for="favColor"]',
              message: 'Expected a label with for="favColor".',
            },
            {
              type: 'exists',
              selector: 'label[for="likeness"]',
              message: 'Expected a label with for="likeness".',
            },
            {
              type: 'exists',
              selector: 'button[type="submit"], input[type="submit"]',
              message: 'Expected a submit button.',
            },
            {
              type: 'text',
              selector: 'button[type="submit"], input[type="submit"]',
              contains: 'Submit',
              message: 'Expected submit button text to be "Submit".',
            },
          ],
        },
      },
    ],
  },

  // --------------------------------------------------------------------------
  // Q5: Pricing Table
  // --------------------------------------------------------------------------
  {
    title: 'Pricing Table',
    slug: 'pricing-table',
    description: `Create a pricing table containing three subscription plans: Basic, Pro, and Premium. Arrange the plans horizontally using Flexbox and preserve all supplied class names.

![Pricing Table Reference](https://d3dyfaf3iutrxo.cloudfront.net/thumbnail/assignment/question/46ae3a1867874a0ba15777ac1c369571.png)

### Required HTML structure

Inside \`.pricing-table\`, create exactly three plan containers:
- \`.plan1\` → Basic
- \`.plan2\` → Pro
- \`.plan3\` → Premium

Each plan must contain, in this exact order:
1. \`<h2 class="plan-name">...</h2>\`
2. \`<p class="plan-price">...</p>\`
3. \`<ul class="plan-features">...</ul>\`
4. \`<button class="btn-select">Select Plan</button>\`

#### Feature counts:
- **Basic**: 3 items — \`<li>Package 1</li>\`, \`<li>Package 2</li>\`, \`<li>Package 3</li>\`
- **Pro**: 4 items — \`<li>Package 1</li>\`, \`<li>Package 2</li>\`, \`<li>Package 3</li>\`, \`<li>Package 4</li>\`
- **Premium**: 5 items — \`<li>Package 1</li>\`, \`<li>Package 2</li>\`, \`<li>Package 3</li>\`, \`<li>Package 4</li>\`, \`<li>Package 5</li>\`

### CSS requirements
- \`.pricing-table\` must use Flexbox (\`display: flex;\`).
- Plans must be arranged horizontally (\`flex-direction: row;\`).
- Use \`justify-content\` to create appropriate spacing between plans (\`justify-content: space-around;\` or \`space-between;\`).
- All plan text must be center aligned (\`text-align: center;\`).
- Remove default bullets from \`.plan-features\` (\`list-style: none;\`).
- \`.btn-select\` must have \`cursor: pointer;\` on hover.
- Do not remove or overwrite the supplied boilerplate styles.`,
    instructions: `Add the plans into the HTML editor and add your missing CSS properties in the CSS editor.`,
    starterHtml: `<div class="pricing-table">

</div>`,
    starterCss: `.plan1, .plan2, .plan3 {
  padding: 20px;
  background-color: #f2f2f2;
  border-radius: 5px;
}

.plan-name {
  font-size: 24px;
  margin-bottom: 10px;
}

.plan-price {
  font-size: 18px;
  margin-bottom: 20px;
}

.plan-features {
  padding: 0;
  margin-bottom: 20px;
}

.plan-features li {
  margin-bottom: 10px;
}

.btn-select {
  background-color: #7289DA;
  color: #fff;
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
}

/* Add your missing CSS properties below */
`,
    starterJs: '',
    referenceHtml: `<div class="pricing-table">
  <div class="plan1">
    <h2 class="plan-name">Basic</h2>
    <p class="plan-price">$9.99/mo</p>
    <ul class="plan-features">
      <li>Package 1</li>
      <li>Package 2</li>
      <li>Package 3</li>
    </ul>
    <button class="btn-select">Select Plan</button>
  </div>
  <div class="plan2">
    <h2 class="plan-name">Pro</h2>
    <p class="plan-price">$19.99/mo</p>
    <ul class="plan-features">
      <li>Package 1</li>
      <li>Package 2</li>
      <li>Package 3</li>
      <li>Package 4</li>
    </ul>
    <button class="btn-select">Select Plan</button>
  </div>
  <div class="plan3">
    <h2 class="plan-name">Premium</h2>
    <p class="plan-price">$29.99/mo</p>
    <ul class="plan-features">
      <li>Package 1</li>
      <li>Package 2</li>
      <li>Package 3</li>
      <li>Package 4</li>
      <li>Package 5</li>
    </ul>
    <button class="btn-select">Select Plan</button>
  </div>
</div>`,
    referenceCss: `.plan1, .plan2, .plan3 {
  padding: 20px;
  background-color: #f2f2f2;
  border-radius: 5px;
  text-align: center;
}

.plan-name {
  font-size: 24px;
  margin-bottom: 10px;
}

.plan-price {
  font-size: 18px;
  margin-bottom: 20px;
}

.plan-features {
  padding: 0;
  margin-bottom: 20px;
  list-style: none;
}

.plan-features li {
  margin-bottom: 10px;
}

.btn-select {
  background-color: #7289DA;
  color: #fff;
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.pricing-table {
  display: flex;
  flex-direction: row;
  justify-content: space-around;
  gap: 20px;
  text-align: center;
}`,
    referenceJs: '',
    tests: [
      {
        name: '.plan1 layout, required elements, and exactly 3 features',
        description: 'Checks Basic plan structure, h2, p, button, and 3 list items.',
        hidden: false,
        points: 4,
        order: 0,
        body: {
          assertions: [
            {
              type: 'exists',
              selector: '.pricing-table .plan1',
              message: 'Expected .plan1 inside .pricing-table.',
            },
            {
              type: 'text',
              selector: '.plan1 .plan-name',
              contains: 'Basic',
              message: 'Expected .plan1 .plan-name to contain "Basic".',
            },
            {
              type: 'exists',
              selector: '.plan1 .plan-price',
              message: 'Expected .plan1 to have .plan-price.',
            },
            {
              type: 'count',
              selector: '.plan1 .plan-features li',
              equals: 3,
              message: 'Expected .plan1 to have exactly 3 feature items.',
            },
            {
              type: 'text',
              selector: '.plan1 .btn-select',
              contains: 'Select Plan',
              message: 'Expected .plan1 .btn-select to say "Select Plan".',
            },
          ],
        },
      },
      {
        name: '.plan2 layout, required elements, and exactly 4 features',
        description: 'Checks Pro plan structure, h2, p, button, and 4 list items.',
        hidden: true,
        points: 4,
        order: 1,
        body: {
          assertions: [
            {
              type: 'exists',
              selector: '.pricing-table .plan2',
              message: 'Expected .plan2 inside .pricing-table.',
            },
            {
              type: 'text',
              selector: '.plan2 .plan-name',
              contains: 'Pro',
              message: 'Expected .plan2 .plan-name to contain "Pro".',
            },
            {
              type: 'exists',
              selector: '.plan2 .plan-price',
              message: 'Expected .plan2 to have .plan-price.',
            },
            {
              type: 'count',
              selector: '.plan2 .plan-features li',
              equals: 4,
              message: 'Expected .plan2 to have exactly 4 feature items.',
            },
            {
              type: 'text',
              selector: '.plan2 .btn-select',
              contains: 'Select Plan',
              message: 'Expected .plan2 .btn-select to say "Select Plan".',
            },
          ],
        },
      },
      {
        name: '.plan3 layout, required elements, and exactly 5 features',
        description: 'Checks Premium plan structure, h2, p, button, and 5 list items.',
        hidden: true,
        points: 4,
        order: 2,
        body: {
          assertions: [
            {
              type: 'exists',
              selector: '.pricing-table .plan3',
              message: 'Expected .plan3 inside .pricing-table.',
            },
            {
              type: 'text',
              selector: '.plan3 .plan-name',
              contains: 'Premium',
              message: 'Expected .plan3 .plan-name to contain "Premium".',
            },
            {
              type: 'exists',
              selector: '.plan3 .plan-price',
              message: 'Expected .plan3 to have .plan-price.',
            },
            {
              type: 'count',
              selector: '.plan3 .plan-features li',
              equals: 5,
              message: 'Expected .plan3 to have exactly 5 feature items.',
            },
            {
              type: 'text',
              selector: '.plan3 .btn-select',
              contains: 'Select Plan',
              message: 'Expected .plan3 .btn-select to say "Select Plan".',
            },
          ],
        },
      },
      {
        name: '.pricing-table uses Flexbox, horizontal arrangement, and center-aligned text',
        description: 'Verifies flex container styling and text alignment.',
        hidden: true,
        points: 4,
        order: 3,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '.pricing-table',
              property: 'display',
              equals: 'flex',
              message: 'Expected .pricing-table to have display: flex.',
            },
            {
              type: 'css',
              selector: '.pricing-table',
              property: 'flex-direction',
              equals: 'row',
              message: 'Expected .pricing-table to have flex-direction: row.',
            },
            {
              type: 'css',
              selector: '.plan1',
              property: 'text-align',
              equals: 'center',
              message: 'Expected plan text to be center aligned.',
            },
          ],
        },
      },
      {
        name: '.plan-features has no bullets and .btn-select has cursor: pointer',
        description: 'Checks list-style: none and cursor: pointer interaction.',
        hidden: true,
        points: 4,
        order: 4,
        body: {
          assertions: [
            {
              type: 'css',
              selector: '.plan-features',
              property: 'list-style-type',
              equals: 'none',
              message: 'Expected .plan-features to have list-style: none.',
            },
            {
              type: 'css',
              selector: '.btn-select',
              property: 'cursor',
              equals: 'pointer',
              message: 'Expected .btn-select to have cursor: pointer.',
            },
          ],
        },
      },
    ],
  },
];

async function main() {
  console.log('Seeding "Lab Quiz 1" and 5 questions...');

  const questionIds: string[] = [];

  for (const q of labQuestions) {
    const totalPoints = q.tests.reduce((acc, t) => acc + t.points, 0);

    const question = await prisma.question.upsert({
      where: { slug: q.slug },
      create: {
        title: q.title,
        slug: q.slug,
        description: q.description,
        instructions: q.instructions,
        type: 'WEB',
        starterHtml: q.starterHtml,
        starterCss: q.starterCss,
        starterJs: q.starterJs,
        referenceHtml: q.referenceHtml,
        referenceCss: q.referenceCss,
        referenceJs: q.referenceJs,
        difficulty: 'MEDIUM',
        points: totalPoints,
        active: true,
        tags: ['html', 'css', 'practical'],
      },
      update: {
        title: q.title,
        description: q.description,
        instructions: q.instructions,
        type: 'WEB',
        starterHtml: q.starterHtml,
        starterCss: q.starterCss,
        starterJs: q.starterJs,
        referenceHtml: q.referenceHtml,
        referenceCss: q.referenceCss,
        referenceJs: q.referenceJs,
        points: totalPoints,
        active: true,
      },
    });

    questionIds.push(question.id);

    // Delete existing tests and re-insert
    await prisma.questionTest.deleteMany({ where: { questionId: question.id } });
    for (const t of q.tests) {
      await prisma.questionTest.create({
        data: {
          questionId: question.id,
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

    console.log(`  ✓ Question "${q.title}" saved (${totalPoints} points, ${q.tests.length} tests)`);
  }

  // Set up the exam "Lab Quiz 1"
  // Window: 3:30 PM - 5:30 PM today (2026-09-23)
  // Window start: 15:30 IST, Window end: 17:30 IST.
  // Allowed duration: 90 minutes.
  // Note: To ensure students joining up to 5:30 PM get their full 90 minutes,
  // we set the absolute closing time to 19:00 IST (5:30 PM + 90 min) so timing is strictly preserved.
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const date = today.getDate();

  // Create Date objects for 15:30 and 17:30 IST (+05:30)
  // Note: In local time or ISO, 15:30 IST is 10:00 UTC.
  const startTime = new Date(Date.UTC(year, month, date, 10, 0, 0)); // 15:30 IST
  const endTime = new Date(Date.UTC(year, month, date, 13, 30, 0)); // 19:00 IST (allows 90m for join at 17:30)

  const exam = await prisma.exam.upsert({
    where: { id: 'lab-quiz-1' },
    create: {
      id: 'lab-quiz-1',
      title: 'Lab Quiz 1',
      description:
        'HTML & CSS Practical Assessment. Join window: 3:30 PM – 5:30 PM. Duration: 90 minutes from join time.',
      durationMinutes: 90,
      status: 'PUBLISHED',
      active: true,
      batch: '2029',
      startTime,
      endTime,
    },
    update: {
      title: 'Lab Quiz 1',
      description:
        'HTML & CSS Practical Assessment. Join window: 3:30 PM – 5:30 PM. Duration: 90 minutes from join time.',
      durationMinutes: 90,
      status: 'PUBLISHED',
      active: true,
      batch: '2029',
      startTime,
      endTime,
    },
  });

  console.log(`\n  ✓ Exam "${exam.title}" created / updated.`);

  // Link questions to exam
  await prisma.examQuestion.deleteMany({ where: { examId: exam.id } });
  for (let i = 0; i < questionIds.length; i++) {
    const qId = questionIds[i];
    if (!qId) continue;
    await prisma.examQuestion.create({
      data: {
        examId: exam.id,
        questionId: qId,
        order: i,
      },
    });
  }
  console.log(`  ✓ Linked 5 questions to exam.`);

  // Assign to all students
  const students = await prisma.user.findMany({ where: { role: 'STUDENT' } });
  await prisma.examAssignment.createMany({
    data: students.map((s) => ({ examId: exam.id, userId: s.id })),
    skipDuplicates: true,
  });
  console.log(`  ✓ Assigned exam to all ${students.length} students.`);

  console.log('\nAll done! "Lab Quiz 1" is ready to go.');
}

if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].replace(/\\/g, '/').endsWith('create-lab-quiz-1.ts')
) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
