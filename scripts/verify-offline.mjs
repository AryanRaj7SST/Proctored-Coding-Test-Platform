#!/usr/bin/env node
/**
 * Offline verification.
 *
 * Runs everything that can be honestly verified on a machine with NO npm
 * install, NO database, NO Docker and NO network:
 *
 *   1. repository structure   -- every file the app expects is present
 *   2. JSON / config sanity   -- package.json, tsconfig, seed data parse
 *   3. import hygiene         -- no server-only module leaks into a client
 *                                component, no forbidden patterns
 *   4. REAL execution of the pure unit tests (shared/test-spec.ts and the
 *      dependency-free helpers in src/lib) through Node's TypeScript type
 *      stripping and the resolver hook in scripts/offline-harness/loader.mjs
 *
 * What it explicitly does NOT prove: that `npm install`, `prisma generate`,
 * `next build`, the runner container or the e2e suite work. Those need the
 * network and a database -- run `npm run validate:stack` on a connected
 * machine for that. See BUILD_REPORT.md.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
let checks = 0;
const problems = [];

function check(name, fn) {
  checks += 1;
  try {
    const result = fn();
    if (result === false) throw new Error('returned false');
    process.stdout.write(`  ok    ${name}\n`);
  } catch (err) {
    failures += 1;
    problems.push(`${name}: ${err.message}`);
    process.stdout.write(`  FAIL  ${name} -- ${err.message}\n`);
  }
}

function section(title) {
  process.stdout.write(`\n${title}\n${'-'.repeat(title.length)}\n`);
}

function readText(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

/**
 * Strip comments before scanning for forbidden patterns.
 *
 * Without this the checks below fire on the very comments that explain why the
 * pattern is banned (e.g. "never dangerouslySetInnerHTML"). Only block comments
 * and whole-line `//` comments are removed, so URLs inside strings survive.
 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function readCode(rel) {
  return stripComments(readText(rel));
}

function walk(dir, out = []) {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const rel = path.join(dir, entry);
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

/* ------------------------------------------------------------ 1. structure */

section('1. Repository structure');

const REQUIRED = [
  'package.json',
  'tsconfig.json',
  'next.config.mjs',
  'tailwind.config.ts',
  'vitest.config.ts',
  'prisma/schema.prisma',
  'prisma/seed.ts',
  'prisma/seed-data.ts',
  'prisma/migrations/0001_init/migration.sql',
  'shared/test-spec.ts',
  'src/middleware.ts',
  'src/lib/auth.ts',
  'src/lib/authz.ts',
  'src/lib/prisma.ts',
  'src/lib/runner-client.ts',
  'src/lib/outcome.ts',
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/app/api/health/route.ts',
  'src/app/api/auth/[...nextauth]/route.ts',
  'src/app/api/exams/[id]/start/route.ts',
  'src/app/api/attempts/[id]/run/route.ts',
  'src/app/api/attempts/[id]/submit/route.ts',
  'src/app/api/heartbeat/route.ts',
  'src/app/api/proctor-events/route.ts',
  'src/app/api/admin/monitor/stream/route.ts',
  'src/components/exam/ExamWorkspace.tsx',
  'src/components/editor/CodeEditor.tsx',
  'runner/src/index.ts',
  'runner/src/executor.ts',
  'runner/src/page-script.ts',
  'runner/Dockerfile',
  'docker-compose.yml',
];

for (const file of REQUIRED) {
  check(`exists ${file}`, () => {
    if (!existsSync(path.join(root, file))) throw new Error('missing');
  });
}

check('every API route directory contains a route.ts', () => {
  const dirs = new Set();
  for (const file of walk('src/app/api')) dirs.add(path.dirname(file));
  const missing = [...dirs].filter((d) => !existsSync(path.join(root, d, 'route.ts')));
  if (missing.length) throw new Error(`no route.ts in ${missing.join(', ')}`);
});

check('every page directory contains a page.tsx', () => {
  const pages = walk('src/app').filter((f) => f.endsWith('page.tsx'));
  if (pages.length < 12) throw new Error(`only ${pages.length} pages found`);
});

/* ------------------------------------------------------------ 2. JSON/config */

section('2. Configuration sanity');

check('package.json is valid JSON with the expected scripts', () => {
  const pkg = JSON.parse(readText('package.json'));
  for (const script of ['dev', 'build', 'test', 'db:seed', 'verify:offline', 'validate:stack']) {
    if (!pkg.scripts[script]) throw new Error(`missing script "${script}"`);
  }
  if (!pkg.dependencies.next) throw new Error('next is not a dependency');
});

check('tsconfig.json parses and declares both path aliases', () => {
  const text = readText('tsconfig.json').replace(/^\s*\/\/.*$/gm, '');
  const cfg = JSON.parse(text);
  const paths = cfg.compilerOptions.paths ?? {};
  if (!paths['@/*']) throw new Error('missing @/* alias');
  if (!paths['@shared/*']) throw new Error('missing @shared/* alias');
});

check('runner has its own package.json and tsconfig', () => {
  JSON.parse(readText('runner/package.json'));
  JSON.parse(readText('runner/tsconfig.json').replace(/^\s*\/\/.*$/gm, ''));
});

check('.env.example documents every variable src/lib/env.ts reads', () => {
  const env = readText('src/lib/env.ts');
  const example = readText('.env.example');
  const names = [...env.matchAll(/(?:required|int)\('([A-Z0-9_]+)'/g)].map((m) => m[1]);
  const missing = names.filter((n) => !example.includes(n));
  if (missing.length) throw new Error(`.env.example is missing ${missing.join(', ')}`);
});

check('prisma schema and the init migration agree on table names', () => {
  const schema = readText('prisma/schema.prisma');
  const sql = readText('prisma/migrations/0001_init/migration.sql');
  const tables = [...schema.matchAll(/@@map\("([a-z_]+)"\)/g)].map((m) => m[1]);
  const missing = tables.filter((t) => !sql.includes(`"${t}"`));
  if (missing.length) throw new Error(`migration does not create ${missing.join(', ')}`);
  if (tables.length < 10) throw new Error(`only ${tables.length} mapped tables found`);
});

/* ------------------------------------------------------- 3. import hygiene */

section('3. Import hygiene and forbidden patterns');

const clientFiles = walk('src')
  .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
  .filter((f) => readText(f).startsWith("'use client'"));

check(`no client component imports prisma (${clientFiles.length} client files scanned)`, () => {
  const bad = clientFiles.filter((f) => /from '@\/lib\/prisma'|@prisma\/client/.test(readText(f)));
  if (bad.length) throw new Error(bad.join(', '));
});

check('no client component imports a server service', () => {
  const bad = clientFiles.filter(
    (f) => /from '@\/server\//.test(readText(f)) && !/^import type/m.test(readText(f)),
  );
  const reallyBad = bad.filter((f) => {
    // `import type { X } from '@/server/...'` is erased at compile time and is fine.
    const text = readText(f);
    return [...text.matchAll(/^import\s+(?!type)[^;]*from '@\/server\/[^']+';/gm)].length > 0;
  });
  if (reallyBad.length) throw new Error(reallyBad.join(', '));
});

check('no client component imports the auth config or env helper', () => {
  const bad = clientFiles.filter((f) => /from '@\/lib\/(auth|env)'/.test(readText(f)));
  if (bad.length) throw new Error(bad.join(', '));
});

check('browser storage APIs are not used anywhere in the app', () => {
  const bad = walk('src')
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => /\b(localStorage|sessionStorage)\b/.test(readCode(f)));
  if (bad.length) throw new Error(`${bad.join(', ')} -- exam state must live on the server`);
});

check('no dangerouslySetInnerHTML anywhere', () => {
  const bad = walk('src').filter((f) => /\.tsx?$/.test(f) && readCode(f).includes('dangerouslySetInnerHTML'));
  if (bad.length) throw new Error(bad.join(', '));
});

check('the preview iframe never gets allow-same-origin', () => {
  const preview = readCode('src/components/editor/PreviewFrame.tsx');
  if (!preview.includes('sandbox=')) throw new Error('no sandbox attribute found');
  if (preview.includes('allow-same-origin'))
    throw new Error('allow-same-origin would break the origin boundary');
});

check('the test DSL has no source-inspection assertion', () => {
  const spec = readCode('shared/test-spec.ts');
  if (/sourceContains|sourceMatches|codeContains/.test(spec)) {
    throw new Error(
      'behaviour-based grading requires that source inspection does not exist in the vocabulary',
    );
  }
});

check('hidden test code is never selected into a student payload', () => {
  const questions = readCode('src/server/services/questions.ts');
  // What each projection RETURNS. Reading testCode to describe a check in
  // words is fine; returning it would hand students the grading spec.
  for (const fn of ['toStudentQuestion', 'toStudentTestCase']) {
    const start = questions.indexOf(`function ${fn}(`);
    if (start < 0) throw new Error(`${fn} not found`);
    const rest = questions.slice(start);
    const body = rest.slice(0, rest.indexOf('\n}\n'));
    const returned = body.slice(body.lastIndexOf('return {'));
    if (/\btestCode\b/.test(returned)) throw new Error(`${fn} returns testCode`);
  }
});

check('every API route wraps its handler or returns a Response directly', () => {
  const routes = walk('src/app/api').filter((f) => f.endsWith('route.ts'));
  const bad = routes.filter((f) => {
    const text = readText(f);
    if (f.includes('[...nextauth]')) return false; // re-exports NextAuth handlers
    return !/handler\(/.test(text) && !/export async function (GET|POST)/.test(text);
  });
  if (bad.length) throw new Error(bad.join(', '));
});

check('mutating admin routes call requireAdmin', () => {
  const routes = walk('src/app/api/admin').filter((f) => f.endsWith('route.ts'));
  const bad = routes.filter(
    (f) => !readText(f).includes('requireAdmin') && !readText(f).includes('role !== '),
  );
  if (bad.length) throw new Error(bad.join(', '));
});

/* ----------------------------------------------------- 4. real unit tests */

section('4. Executing pure unit tests (no npm install required)');

register(pathToFileURL(path.join(root, 'scripts/offline-harness/loader.mjs')));

const shim = await import(pathToFileURL(path.join(root, 'scripts/offline-harness/vitest-shim.mjs')).href);

const unitFiles = readdirSync(path.join(root, 'tests/unit'))
  .filter((f) => f.endsWith('.test.ts'))
  .sort();

let executed = 0;
let skipped = [];

for (const file of unitFiles) {
  shim.resetResults();
  try {
    await import(pathToFileURL(path.join(root, 'tests/unit', file)).href);
  } catch (err) {
    // A test that needs Prisma or a browser cannot run here; vitest will.
    skipped.push(`${file} (${err.message.split('\n')[0]})`);
    continue;
  }
  const results = shim.getResults();
  executed += 1;
  checks += results.passed + results.failed;
  failures += results.failed;
  process.stdout.write(
    `  ${results.failed === 0 ? 'ok   ' : 'FAIL '} ${file} -- ${results.passed} passed, ${results.failed} failed\n`,
  );
  for (const f of results.failures) {
    problems.push(`${file} › ${f.name}: ${f.message}`);
    process.stdout.write(`        ✕ ${f.name}\n          ${f.message}\n`);
  }
}

if (skipped.length) {
  process.stdout.write(`\n  skipped (need vitest / a database):\n`);
  for (const s of skipped) process.stdout.write(`    - ${s}\n`);
}

/* ------------------------------------------------------- 5. runner tests */

section("5. Executing the runner's pure unit tests (node --test, no npm install)");

{
  const { spawnSync } = await import('node:child_process');
  const runnerDir = path.join(root, 'runner');
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--no-warnings',
      '--import',
      './tests/register.mjs',
      '--test',
      'tests/queue.test.ts',
      'tests/auth.test.ts',
      'tests/page-script.test.ts',
    ],
    { cwd: runnerDir, encoding: 'utf8' },
  );

  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const summary = /(?:#|ℹ)\s*pass\s+(\d+)[\s\S]*?(?:#|ℹ)\s*fail\s+(\d+)/i.exec(out);
  if (result.status === 0 && summary) {
    checks += Number(summary[1]) + Number(summary[2]);
    process.stdout.write(`  ok    runner/tests -- ${summary[1]} passed, ${summary[2]} failed\n`);
  } else {
    checks += 1;
    failures += 1;
    const tail = out.trim().split('\n').slice(-15).join('\n    ');
    problems.push(`runner/tests exited ${result.status}`);
    process.stdout.write(`  FAIL  runner/tests -- exit code ${result.status}\n    ${tail}\n`);
  }
}

/* ----------------------------------------------------------------- report */

section('Summary');
process.stdout.write(`  test files executed : ${executed}/${unitFiles.length}\n`);
process.stdout.write(`  assertions + checks : ${checks}\n`);
process.stdout.write(`  failures            : ${failures}\n`);

if (failures > 0) {
  process.stdout.write('\nProblems:\n');
  for (const p of problems) process.stdout.write(`  - ${p}\n`);
  process.stdout.write('\nOFFLINE VERIFICATION: FAIL\n');
  process.exit(1);
}

process.stdout.write('\nOFFLINE VERIFICATION: PASS\n');
process.stdout.write(
  'Note: this does NOT cover npm install, prisma generate, next build, the runner\n' +
    'container or the e2e suite. Run `npm run validate:stack` on a networked machine.\n',
);
