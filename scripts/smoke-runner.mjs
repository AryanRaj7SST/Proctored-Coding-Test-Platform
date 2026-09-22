#!/usr/bin/env node
/**
 * Loop 6 helper for scripts/validate-stack.sh.
 *
 * Sends ONE real signed request to the runner container (must already be up
 * and healthy) with a tiny known-good HTML/CSS/JS payload and a single
 * assertion, and checks that the result is exactly what a correct browser
 * would report. This is the one step in the whole validation pipeline that
 * proves the Playwright-in-Docker path actually renders a page and reads its
 * computed style back -- nothing earlier in the pipeline exercises a real
 * browser.
 */

import { createHmac } from 'node:crypto';

const RUNNER_URL = process.env.RUNNER_URL ?? 'http://localhost:4000';
const RUNNER_SECRET = process.env.RUNNER_SECRET;

if (!RUNNER_SECRET) {
  console.error('RUNNER_SECRET is not set in the environment. Source .env first.');
  process.exit(1);
}

const spec = {
  version: 1,
  viewport: { width: 1280, height: 720 },
  tests: [
    {
      id: 'smoke-1',
      name: 'box turns tomato on click',
      points: 10,
      hidden: false,
      steps: [{ action: 'click', selector: '#add' }],
      assertions: [
        { type: 'css', selector: '#box', property: 'background-color', equals: 'tomato', color: true },
      ],
    },
  ],
};

const body = JSON.stringify({
  runId: `smoke-${Date.now()}`,
  html: '<div id="box"></div><button id="add">Add</button>',
  css: '#box { width: 40px; height: 40px; }',
  js: "document.getElementById('add').addEventListener('click', () => { document.getElementById('box').style.backgroundColor = 'tomato'; });",
  spec,
});

const timestamp = String(Date.now());
const signature = createHmac('sha256', RUNNER_SECRET).update(`${timestamp}.${body}`).digest('hex');

const res = await fetch(`${RUNNER_URL}/run`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${RUNNER_SECRET}`,
    'X-Runner-Timestamp': timestamp,
    'X-Runner-Signature': signature,
  },
  body,
});

if (!res.ok) {
  console.error(`Runner responded ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const result = await res.json();
const test = result.results?.[0];

if (result.status !== 'COMPLETED' || !test?.passed) {
  console.error('Smoke test did not pass:', JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(`Runner smoke test passed: "${test.testName}" in ${test.durationMs}ms (run ${result.durationMs}ms total).`);
