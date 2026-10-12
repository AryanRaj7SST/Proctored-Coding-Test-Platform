import type { TestCaseBody } from '@shared/test-spec';

/**
 * Starting points for common web-development checks. Each one is ordinary
 * DSL JSON the admin then adapts (selectors, texts, values) in the builder.
 */
export interface TestTemplate {
  id: string;
  label: string;
  summary: string;
  name: string;
  expectedBehavior: string;
  body: TestCaseBody;
}

export const TEST_TEMPLATES: TestTemplate[] = [
  {
    id: 'exists',
    label: 'Element exists',
    summary: 'A required element is on the page.',
    name: 'Heading is present',
    expectedBehavior: 'The page contains a main heading.',
    body: { assertions: [{ type: 'exists', selector: 'h1' }] },
  },
  {
    id: 'click-text',
    label: 'Button click changes text',
    summary: 'Clicking a button updates the text of another element.',
    name: 'Clicking the button updates the message',
    expectedBehavior: 'After clicking the button, the message reads "Hello!".',
    body: {
      steps: [{ action: 'click', selector: '#greet-btn' }],
      assertions: [{ type: 'text', selector: '#message', equals: 'Hello!' }],
    },
  },
  {
    id: 'css',
    label: 'CSS property value',
    summary: 'An element has a specific computed style.',
    name: 'Box has the right background colour',
    expectedBehavior: 'The box has a tomato background.',
    body: {
      assertions: [
        { type: 'css', selector: '#box', property: 'background-color', equals: 'tomato', color: true },
      ],
    },
  },
  {
    id: 'class-toggle',
    label: 'Class added on click',
    summary: 'Clicking toggles a class on an element.',
    name: 'Clicking the toggle activates the card',
    expectedBehavior: 'Clicking the toggle button adds the "active" class to the card.',
    body: {
      steps: [{ action: 'click', selector: '#toggle' }],
      assertions: [{ type: 'hasClass', selector: '.card', className: 'active' }],
    },
  },
  {
    id: 'visibility',
    label: 'Element visibility',
    summary: 'An element becomes visible (or hidden) after an interaction.',
    name: 'Opening the menu shows it',
    expectedBehavior: 'The menu is hidden at first and becomes visible after clicking the menu button.',
    body: {
      steps: [{ action: 'click', selector: '#menu-btn' }],
      assertions: [{ type: 'visible', selector: '#menu' }],
    },
  },
  {
    id: 'form-validation',
    label: 'Form validation',
    summary: 'Invalid input is rejected by the field’s validation rules.',
    name: 'Email field rejects an invalid address',
    expectedBehavior: 'Typing "not-an-email" into the email field leaves it invalid.',
    body: {
      steps: [{ action: 'fill', selector: '#email', value: 'not-an-email' }],
      assertions: [{ type: 'validity', selector: '#email', valid: false }],
    },
  },
  {
    id: 'input-value',
    label: 'Input value',
    summary: 'An input holds the expected value after an interaction.',
    name: 'Clear button empties the input',
    expectedBehavior: 'After typing a name and clicking Clear, the input is empty.',
    body: {
      steps: [
        { action: 'fill', selector: '#name', value: 'Asha' },
        { action: 'click', selector: '#clear' },
      ],
      assertions: [{ type: 'value', selector: '#name', equals: '' }],
    },
  },
  {
    id: 'dom-count',
    label: 'DOM manipulation (count)',
    summary: 'Clicking "add" creates new elements.',
    name: 'Adding an item appends it to the list',
    expectedBehavior: 'Typing a task and clicking Add adds one item to the list.',
    body: {
      steps: [
        { action: 'fill', selector: '#task-input', value: 'Buy milk' },
        { action: 'click', selector: '#add-btn' },
      ],
      assertions: [
        { type: 'count', selector: '#task-list li', equals: 1 },
        { type: 'text', selector: '#task-list li', contains: 'Buy milk' },
      ],
    },
  },
  {
    id: 'js',
    label: 'JavaScript behaviour',
    summary: 'Call the student’s function and check the result.',
    name: 'add() returns the sum',
    expectedBehavior: 'A global function add(a, b) returns a + b.',
    body: {
      assertions: [
        {
          type: 'js',
          expression: "typeof window.add === 'function' && window.add(2, 3) === 5",
        },
      ],
    },
  },
  {
    id: 'multi-step',
    label: 'Multiple interactions',
    summary: 'Several steps followed by several checks.',
    name: 'Counter increments and resets',
    expectedBehavior: 'Clicking + twice and then Reset brings the counter back to 0 without errors.',
    body: {
      steps: [
        { action: 'click', selector: '#increment' },
        { action: 'click', selector: '#increment' },
        { action: 'click', selector: '#reset' },
      ],
      assertions: [
        { type: 'text', selector: '#count', equals: '0' },
        { type: 'visible', selector: '#reset' },
        { type: 'noConsoleErrors' },
      ],
    },
  },
  {
    id: 'responsive',
    label: 'Responsive layout',
    summary: 'Cards stack one per row on a small screen.',
    name: 'Cards stack on mobile',
    expectedBehavior: 'On a 480px-wide screen, each card takes a full row.',
    body: {
      viewport: { width: 480, height: 800 },
      assertions: [{ type: 'boxesPerRow', selector: '.card', equals: 1 }],
    },
  },
  {
    id: 'no-console-errors',
    label: 'No console errors',
    summary: 'The page runs without JavaScript errors.',
    name: 'Page runs without errors',
    expectedBehavior: 'Loading the page does not log any errors to the console.',
    body: { assertions: [{ type: 'noConsoleErrors' }] },
  },
];

export const BLANK_BODY: TestCaseBody = { assertions: [{ type: 'exists', selector: 'body' }] };
