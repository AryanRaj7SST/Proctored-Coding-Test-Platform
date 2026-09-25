/* eslint-disable no-console */
/**
 * Add six sample web-development questions to the question bank, one per
 * lifecycle state, through the same services the admin UI uses:
 *
 *   PUBLISHED x2, VALIDATED x1, ARCHIVED x1, DRAFT x2 (one complete, one unfinished)
 *
 * "Validated" and "Published" are earned, not written: every question that is
 * meant to get past Draft is validated by the real runner against its
 * reference solution first, and the script reports any that fail.
 *
 * Additive and idempotent: a question whose slug already exists is skipped, so
 * nothing you wrote (or edited) is ever overwritten.
 *
 *   set -a; . ./.env; set +a      # DATABASE_URL, RUNNER_URL, RUNNER_SECRET
 *   npx tsx scripts/seed-sample-questions.ts
 */
import { prisma } from '../src/lib/prisma';
import { questionCreateInput } from '../src/lib/validation';
import { changeQuestionStatus, createQuestion } from '../src/server/services/questions';
import { validateQuestion } from '../src/server/services/validation-runs';

type Target = 'DRAFT' | 'VALIDATED' | 'PUBLISHED' | 'ARCHIVED';

interface Sample {
  target: Target;
  title: string;
  slug: string;
  category: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  marks: string;
  tags: string[];
  description: string;
  instructions?: string;
  expectedBehavior?: string;
  starterHtml: string;
  starterCss?: string;
  starterJs?: string;
  referenceHtml?: string;
  referenceCss?: string;
  referenceJs?: string;
  tests: { name: string; expectedBehavior: string; body: Record<string, unknown> }[];
}

const SAMPLES: Sample[] = [
  {
    target: 'PUBLISHED',
    title: 'Toggle Visibility',
    slug: 'sample-toggle-visibility',
    category: 'DOM',
    difficulty: 'EASY',
    marks: '10',
    tags: ['dom', 'events'],
    description:
      '# Show and hide details\nThe details panel starts hidden. Make the button show it, hide it again, and keep its label in sync.',
    instructions: 'Keep the ids `toggle` and `details`.',
    expectedBehavior: 'The button toggles #details and reads "Hide details" while the panel is shown.',
    starterHtml:
      '<button id="toggle">Show details</button>\n<div id="details" hidden>Shipping takes 3–5 working days.</div>',
    referenceHtml:
      '<button id="toggle">Show details</button>\n<div id="details" hidden>Shipping takes 3–5 working days.</div>',
    referenceJs: `const button = document.getElementById('toggle');
const details = document.getElementById('details');
button.addEventListener('click', () => {
  details.hidden = !details.hidden;
  button.textContent = details.hidden ? 'Show details' : 'Hide details';
});`,
    tests: [
      {
        name: 'Details start hidden',
        expectedBehavior: '#details is not visible when the page loads.',
        body: { assertions: [{ type: 'hidden', selector: '#details' }] },
      },
      {
        name: 'One click shows the details',
        expectedBehavior: 'Clicking the button once makes #details visible.',
        body: {
          steps: [{ action: 'click', selector: '#toggle' }],
          assertions: [{ type: 'visible', selector: '#details' }],
        },
      },
      {
        name: 'A second click hides them again',
        expectedBehavior: 'Clicking twice hides #details again.',
        body: {
          steps: [
            { action: 'click', selector: '#toggle' },
            { action: 'click', selector: '#toggle' },
          ],
          assertions: [{ type: 'hidden', selector: '#details' }],
        },
      },
      {
        name: 'The label follows the state',
        expectedBehavior: 'After one click the button reads "Hide details".',
        body: {
          steps: [{ action: 'click', selector: '#toggle' }],
          assertions: [{ type: 'text', selector: '#toggle', equals: 'Hide details' }],
        },
      },
    ],
  },
  {
    target: 'PUBLISHED',
    title: 'Live Character Counter',
    slug: 'sample-character-counter',
    category: 'Forms',
    difficulty: 'EASY',
    marks: '8',
    tags: ['forms', 'input'],
    description:
      '# Character counter\nShow how many characters have been typed into the bio, out of 100, as the user types.',
    expectedBehavior: '#count reads "<n> / 100" and updates on every keystroke.',
    starterHtml: '<textarea id="bio" maxlength="100"></textarea>\n<p id="count">0 / 100</p>',
    referenceHtml: '<textarea id="bio" maxlength="100"></textarea>\n<p id="count">0 / 100</p>',
    referenceJs: `const bio = document.getElementById('bio');
const count = document.getElementById('count');
bio.addEventListener('input', () => {
  count.textContent = bio.value.length + ' / 100';
});`,
    tests: [
      {
        name: 'Starts at zero',
        expectedBehavior: '#count reads "0 / 100" before anything is typed.',
        body: { assertions: [{ type: 'text', selector: '#count', equals: '0 / 100' }] },
      },
      {
        name: 'Counts a short word',
        expectedBehavior: 'Typing "hello" shows "5 / 100".',
        body: {
          steps: [{ action: 'fill', selector: '#bio', value: 'hello' }],
          assertions: [{ type: 'text', selector: '#count', equals: '5 / 100' }],
        },
      },
      {
        name: 'Counts spaces too',
        expectedBehavior: 'Typing "hi there you" shows "12 / 100".',
        body: {
          steps: [{ action: 'fill', selector: '#bio', value: 'hi there you' }],
          assertions: [{ type: 'text', selector: '#count', equals: '12 / 100' }],
        },
      },
      {
        name: 'Clearing resets the count',
        expectedBehavior: 'Typing and then clearing the bio shows "0 / 100" again.',
        body: {
          steps: [
            { action: 'fill', selector: '#bio', value: 'abc' },
            { action: 'fill', selector: '#bio', value: '' },
          ],
          assertions: [{ type: 'text', selector: '#count', equals: '0 / 100' }],
        },
      },
    ],
  },
  {
    target: 'VALIDATED',
    title: 'Email Signup Validation',
    slug: 'sample-email-signup',
    category: 'Forms',
    difficulty: 'MEDIUM',
    marks: '10',
    tags: ['forms', 'validation'],
    description:
      '# Validate the signup form\nOn submit, show an error for a missing or malformed email, and a thank-you message otherwise. Do not reload the page.',
    instructions:
      'The form has `novalidate`, so the browser will not block the submit: check the field yourself.',
    expectedBehavior:
      'Invalid: #msg reads "Please enter a valid email." Valid: #msg reads "Thanks for signing up!"',
    starterHtml:
      '<form id="signup" novalidate>\n  <input id="email" type="email" required placeholder="you@example.com" />\n  <button id="submit" type="submit">Sign up</button>\n</form>\n<p id="msg"></p>',
    referenceHtml:
      '<form id="signup" novalidate>\n  <input id="email" type="email" required placeholder="you@example.com" />\n  <button id="submit" type="submit">Sign up</button>\n</form>\n<p id="msg"></p>',
    referenceJs: `const form = document.getElementById('signup');
const email = document.getElementById('email');
const msg = document.getElementById('msg');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  msg.textContent = email.checkValidity() ? 'Thanks for signing up!' : 'Please enter a valid email.';
});`,
    tests: [
      {
        name: 'An empty email is rejected',
        expectedBehavior: 'Submitting with no email shows "Please enter a valid email."',
        body: {
          steps: [{ action: 'click', selector: '#submit' }],
          assertions: [{ type: 'text', selector: '#msg', equals: 'Please enter a valid email.' }],
        },
      },
      {
        name: 'A malformed email is invalid',
        expectedBehavior: '"abc" is not a valid email address.',
        body: {
          steps: [{ action: 'fill', selector: '#email', value: 'abc' }],
          assertions: [{ type: 'validity', selector: '#email', valid: false }],
        },
      },
      {
        name: 'A malformed email shows the error',
        expectedBehavior: 'Submitting "abc" shows "Please enter a valid email."',
        body: {
          steps: [
            { action: 'fill', selector: '#email', value: 'abc' },
            { action: 'click', selector: '#submit' },
          ],
          assertions: [{ type: 'text', selector: '#msg', equals: 'Please enter a valid email.' }],
        },
      },
      {
        name: 'A valid email is thanked',
        expectedBehavior: 'Submitting "asha@example.com" shows "Thanks for signing up!"',
        body: {
          steps: [
            { action: 'fill', selector: '#email', value: 'asha@example.com' },
            { action: 'click', selector: '#submit' },
          ],
          assertions: [{ type: 'text', selector: '#msg', equals: 'Thanks for signing up!' }],
        },
      },
    ],
  },
  {
    target: 'ARCHIVED',
    title: 'Tabbed Panels',
    slug: 'sample-tabbed-panels',
    category: 'DOM',
    difficulty: 'MEDIUM',
    marks: '6',
    tags: ['dom', 'classes'],
    description: '# Tabs\nClicking a tab shows its panel (class `active`) and hides the others.',
    starterHtml:
      '<button id="tab-1">One</button><button id="tab-2">Two</button><button id="tab-3">Three</button>\n<section id="panel-1" class="panel active">First</section>\n<section id="panel-2" class="panel">Second</section>\n<section id="panel-3" class="panel">Third</section>',
    starterCss: '.panel { display: none; }\n.panel.active { display: block; }',
    referenceHtml:
      '<button id="tab-1">One</button><button id="tab-2">Two</button><button id="tab-3">Three</button>\n<section id="panel-1" class="panel active">First</section>\n<section id="panel-2" class="panel">Second</section>\n<section id="panel-3" class="panel">Third</section>',
    referenceCss: '.panel { display: none; }\n.panel.active { display: block; }',
    referenceJs: `[1, 2, 3].forEach((n) => {
  document.getElementById('tab-' + n).addEventListener('click', () => {
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    document.getElementById('panel-' + n).classList.add('active');
  });
});`,
    tests: [
      {
        name: 'The first panel starts active',
        expectedBehavior: '#panel-1 has the class "active" on load.',
        body: { assertions: [{ type: 'hasClass', selector: '#panel-1', className: 'active' }] },
      },
      {
        name: 'Clicking tab two activates panel two',
        expectedBehavior: 'After clicking #tab-2, #panel-2 has the class "active".',
        body: {
          steps: [{ action: 'click', selector: '#tab-2' }],
          assertions: [{ type: 'hasClass', selector: '#panel-2', className: 'active' }],
        },
      },
      {
        name: 'Only one panel is active',
        expectedBehavior: 'After clicking #tab-2, #panel-1 is no longer active.',
        body: {
          steps: [{ action: 'click', selector: '#tab-2' }],
          assertions: [{ type: 'notHasClass', selector: '#panel-1', className: 'active' }],
        },
      },
    ],
  },
  {
    target: 'DRAFT',
    title: 'Dark Mode Checkbox',
    slug: 'sample-dark-mode-checkbox',
    category: 'DOM',
    difficulty: 'EASY',
    marks: '5',
    tags: ['dom', 'forms'],
    description: '# Dark mode\nTicking the checkbox adds the class `dark` to the body; unticking removes it.',
    starterHtml:
      '<label><input id="dark-toggle" type="checkbox" /> Dark mode</label>\n<p>Some page content.</p>',
    starterCss: 'body.dark { background: #111; color: #eee; }',
    referenceHtml:
      '<label><input id="dark-toggle" type="checkbox" /> Dark mode</label>\n<p>Some page content.</p>',
    referenceCss: 'body.dark { background: #111; color: #eee; }',
    referenceJs: `const toggle = document.getElementById('dark-toggle');
toggle.addEventListener('change', () => document.body.classList.toggle('dark', toggle.checked));`,
    tests: [
      {
        name: 'Light by default',
        expectedBehavior: 'The body does not have the class "dark" on load.',
        body: { assertions: [{ type: 'notHasClass', selector: 'body', className: 'dark' }] },
      },
      {
        name: 'Ticking enables dark mode',
        expectedBehavior: 'Checking #dark-toggle adds "dark" to the body.',
        body: {
          steps: [{ action: 'check', selector: '#dark-toggle' }],
          assertions: [{ type: 'hasClass', selector: 'body', className: 'dark' }],
        },
      },
      {
        name: 'Unticking disables it again',
        expectedBehavior: 'Checking then unchecking #dark-toggle removes "dark".',
        body: {
          steps: [
            { action: 'check', selector: '#dark-toggle' },
            { action: 'uncheck', selector: '#dark-toggle' },
          ],
          assertions: [{ type: 'notHasClass', selector: 'body', className: 'dark' }],
        },
      },
    ],
  },
  {
    target: 'DRAFT',
    title: 'Shopping Cart Total (work in progress)',
    slug: 'sample-cart-total-wip',
    category: 'State',
    difficulty: 'HARD',
    marks: '10',
    tags: ['state'],
    description:
      '# Cart total\nShow the cart total and update it when a quantity changes. _Unfinished draft: the reference solution has not been written yet._',
    starterHtml:
      '<ul>\n  <li>Pen <input id="qty-pen" type="number" value="1" min="0" /> × $10</li>\n  <li>Book <input id="qty-book" type="number" value="1" min="0" /> × $20</li>\n</ul>\n<p>Total: <span id="total"></span></p>',
    tests: [
      {
        name: 'Shows the starting total',
        expectedBehavior: '#total reads "$30.00" on load.',
        body: { assertions: [{ type: 'text', selector: '#total', equals: '$30.00' }] },
      },
      {
        name: 'Updates when a quantity changes',
        expectedBehavior: 'Setting the pen quantity to 3 shows "$50.00".',
        body: {
          steps: [{ action: 'fill', selector: '#qty-pen', value: '3' }],
          assertions: [{ type: 'text', selector: '#total', equals: '$50.00' }],
        },
      },
    ],
  },
];

async function main(): Promise<void> {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', active: true }, select: { id: true } });
  if (!admin) throw new Error('No active administrator in this database to own the sample questions.');

  const report: string[] = [];
  for (const sample of SAMPLES) {
    const existing = await prisma.question.findUnique({
      where: { slug: sample.slug },
      select: { status: true },
    });
    if (existing) {
      report.push(`skipped   ${sample.title} (already present, ${existing.status.toLowerCase()})`);
      continue;
    }
    const input = questionCreateInput.parse({
      ...sample,
      starterCss: sample.starterCss ?? '',
      starterJs: sample.starterJs ?? '',
      tests: sample.tests.map((t, order) => ({
        name: t.name,
        expectedBehavior: t.expectedBehavior,
        testCode: JSON.stringify(t.body),
        order,
      })),
    });
    const { id } = await createQuestion(input, admin.id);

    let status: string = 'DRAFT';
    if (sample.target !== 'DRAFT') {
      const result = await validateQuestion(id);
      if (!result.ok) {
        report.push(
          `DRAFT     ${sample.title} -- validation did not pass (${result.passedCount}/${result.totalCount}); left as a draft`,
        );
        continue;
      }
      status = 'VALIDATED';
      if (sample.target === 'PUBLISHED' || sample.target === 'ARCHIVED') {
        await changeQuestionStatus(id, 'publish');
        status = 'PUBLISHED';
      }
      if (sample.target === 'ARCHIVED') {
        await changeQuestionStatus(id, 'archive');
        status = 'ARCHIVED';
      }
    }
    report.push(
      `${status.padEnd(9)} ${sample.title} (${sample.marks} marks, ${sample.tests.length} test cases)`,
    );
  }
  console.log(report.join('\n'));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
