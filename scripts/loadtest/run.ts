#!/usr/bin/env node
/**
 * Load Test Runner for Proctored Coding Platform (~250 simulated students).
 *
 * Uses plain Node 20 global fetch. Zero third-party dependencies.
 * Mints authentic Auth.js session cookies via next-auth/jwt and exercises the full
 * student flow:
 *   1. GET /dashboard
 *   2. POST /api/exams/[id]/start
 *   3. PATCH /api/attempts/[id] (autosave) every 1.5-4s with changing code
 *   4. POST /api/heartbeat every 12s
 *   5. POST /api/attempts/[id]/run (periodic test runs)
 *   6. POST /api/attempts/[id]/submit (final submission)
 *
 * Verifies zero lost answers by comparing the database state against each student's
 * last autosaved code.
 */

import { prisma } from '../../src/lib/prisma';
import { MetricsCollector } from './metrics';
import { provisionStudents, resolveAuthSecret } from './session';

const KNOWN_PRODUCTION_HOSTS = new Set([
  'proctored-coding-test-platform.vercel.app',
]);

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };
  const hasFlag = (flag: string): boolean => args.includes(flag);

  const baseUrl = getArg('--base-url');
  const examId = getArg('--exam-id');
  const studentsCount = parseInt(getArg('--students') ?? '250', 10);
  const rampSeconds = parseInt(getArg('--ramp-seconds') ?? '30', 10);
  const durationSeconds = parseInt(getArg('--duration-seconds') ?? '45', 10);
  const simultaneousFinish = hasFlag('--simultaneous-finish');
  const skipDbVerify = hasFlag('--skip-db-verify');
  const help = hasFlag('--help') || hasFlag('-h');

  return {
    baseUrl,
    examId,
    studentsCount,
    rampSeconds,
    durationSeconds,
    simultaneousFinish,
    skipDbVerify,
    help,
  };
}

function printUsage() {
  console.log(`
Usage: npx tsx scripts/loadtest/run.ts --base-url <URL> --exam-id <ID> [options]

Required:
  --base-url <url>          Target application URL (e.g. http://localhost:3000 or https://preview-xyz.vercel.app)
                            HARD GUARD: Refuses to run against the production domain!
  --exam-id <id>            Target exam ID to run the load test against

Options:
  --students <N>            Number of simulated students (default: 250)
  --ramp-seconds <S>        Duration in seconds over which students are ramped up (default: 30)
  --duration-seconds <D>    Work duration in seconds for each student (default: 45)
  --simultaneous-finish     Barrier mode: all students submit their final code at the exact same instant
  --skip-db-verify          Skip verifying database attempt code match (only if DB is unreachable)
  --help, -h                Show this help message
`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface SavedCode {
  html: string;
  css: string;
  js: string;
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  // Hard safety guard: base-url must be explicitly supplied
  if (!args.baseUrl) {
    console.error('\x1b[31m[ERROR] --base-url is required. You must explicitly specify the load test target.\x1b[0m');
    printUsage();
    process.exit(1);
  }

  // Hard safety guard: refuse production URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(args.baseUrl);
  } catch {
    console.error(`\x1b[31m[ERROR] Invalid --base-url: "${args.baseUrl}"\x1b[0m`);
    process.exit(1);
  }

  if (KNOWN_PRODUCTION_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
    console.error('\x1b[31m[HARD GUARD REFUSAL] Refusing to run load test against production host:\x1b[0m');
    console.error(`  Target: ${args.baseUrl}`);
    console.error('  Load tests must be executed against local instances or isolated Vercel preview deployments.');
    process.exit(1);
  }

  if (process.env.PRODUCTION_URL) {
    try {
      const prodUrl = new URL(process.env.PRODUCTION_URL);
      if (prodUrl.hostname.toLowerCase() === parsedUrl.hostname.toLowerCase()) {
        console.error('\x1b[31m[HARD GUARD REFUSAL] Refusing to run load test against PRODUCTION_URL domain.\x1b[0m');
        process.exit(1);
      }
    } catch {
      /* ignore invalid PRODUCTION_URL env */
    }
  }

  if (!args.examId) {
    console.error('\x1b[31m[ERROR] --exam-id is required.\x1b[0m');
    printUsage();
    process.exit(1);
  }

  const authSecret = resolveAuthSecret();
  const metrics = new MetricsCollector();
  const normalizedBaseUrl = args.baseUrl.replace(/\/+$/, '');

  console.log('========================================================================================');
  console.log('PROCTORED CODING PLATFORM LOAD TEST');
  console.log('========================================================================================');
  console.log(`Target URL:           ${normalizedBaseUrl}`);
  console.log(`Target Exam:          ${args.examId}`);
  console.log(`Simulated Students:   ${args.studentsCount}`);
  console.log(`Ramp-up Duration:     ${args.rampSeconds}s`);
  console.log(`Work Duration:        ${args.durationSeconds}s`);
  console.log(`Simultaneous Finish:  ${args.simultaneousFinish ? 'YES (All students submit at once)' : 'NO'}`);
  console.log('========================================================================================\n');

  // Provision accounts and generate session tokens
  const students = await provisionStudents({
    count: args.studentsCount,
    examId: args.examId,
    baseUrl: normalizedBaseUrl,
    authSecret,
  });

  // Track the final autosaved code per attempt for data-integrity verification
  const studentAttemptIds = new Map<number, string>();
  const lastAutosavedCode = new Map<string, SavedCode>();

  // Simultaneous finish synchronization barrier
  const totalRampMs = args.rampSeconds * 1000;
  const totalDurationMs = args.durationSeconds * 1000;
  const simultaneousSubmitBarrierEpoch = Date.now() + totalRampMs + totalDurationMs;

  console.log(`\n[Execution] Starting simulation of ${students.length} students...`);
  const startTime = Date.now();

  const studentPromises = students.map(async (student) => {
    // 1. Stagger student start over ramp-up period
    const rampDelayMs = (student.index / students.length) * totalRampMs;
    await sleep(rampDelayMs);

    const headers: Record<string, string> = {
      Cookie: student.cookieHeader,
      'User-Agent': `LoadTest-Runner/1.0 (Student ${student.index})`,
    };

    // 2. Open /dashboard
    await timedFetch(metrics, 'GET /dashboard', `${normalizedBaseUrl}/dashboard`, {
      method: 'GET',
      headers,
    });

    // 3. POST /api/exams/[id]/start
    const startRes = await timedFetch(
      metrics,
      'POST /api/exams/[id]/start',
      `${normalizedBaseUrl}/api/exams/${args.examId}/start`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );

    if (!startRes.ok || !startRes.data) {
      console.warn(`[Student ${student.index}] Failed to start exam: HTTP ${startRes.status}`);
      return;
    }

    const questions = (startRes.data as { questions?: { attempt?: { id: string } }[] }).questions;
    const attemptId = questions?.[0]?.attempt?.id;
    if (!attemptId) {
      console.warn(`[Student ${student.index}] No attempt ID found in start response.`);
      return;
    }
    studentAttemptIds.set(student.index, attemptId);

    // 4. Student working loop: Autosave every 1.5-4s, Heartbeat every 12s, Run 1-2 times
    const studentEndTime = Date.now() + totalDurationMs;
    let nextHeartbeat = Date.now() + 12000;
    let nextRun = Date.now() + randomBetween(5000, 15000);
    let runCount = 0;
    let editSeq = 1;

    let currentCode: SavedCode = {
      html: `<!-- Student ${student.index} Initial -->\n<div id="root"><h1>Student ${student.index}</h1></div>`,
      css: `/* Student ${student.index} Initial */\nbody { font-family: sans-serif; background: #fff; }`,
      js: `// Student ${student.index} Initial\nconsole.log("Started student ${student.index}");`,
    };

    while (Date.now() < studentEndTime) {
      // Periodic Autosave every 1.5-4s with mutating code
      const autosaveInterval = randomBetween(1500, 4000);
      await sleep(autosaveInterval);

      editSeq += 1;
      currentCode = {
        html: `<!-- Student ${student.index} Edit #${editSeq} -->\n<div id="root"><h1>Student ${student.index} v${editSeq}</h1><p>Active</p></div>`,
        css: `/* Student ${student.index} Edit #${editSeq} */\nbody { font-family: sans-serif; color: #${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}; }`,
        js: `// Student ${student.index} Edit #${editSeq}\nconsole.log("Autosave ${editSeq} at ${new Date().toISOString()}");`,
      };

      const saveRes = await timedFetch(
        metrics,
        'PATCH /api/attempts/[id]',
        `${normalizedBaseUrl}/api/attempts/${attemptId}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(currentCode),
        }
      );

      if (saveRes.ok) {
        lastAutosavedCode.set(attemptId, currentCode);
      }

      // Heartbeat every 12 seconds
      if (Date.now() >= nextHeartbeat) {
        nextHeartbeat = Date.now() + 12000;
        await timedFetch(
          metrics,
          'POST /api/heartbeat',
          `${normalizedBaseUrl}/api/heartbeat`,
          {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ examId: args.examId }),
          }
        );
      }

      // Occasional Test Runs (1-2 runs)
      if (Date.now() >= nextRun && runCount < 2) {
        runCount += 1;
        nextRun = Date.now() + randomBetween(15000, 25000);
        await timedFetch(
          metrics,
          'POST /api/attempts/[id]/run',
          `${normalizedBaseUrl}/api/attempts/${attemptId}/run`,
          {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(currentCode),
          }
        );
      }
    }

    // 5. Final Submission
    if (args.simultaneousFinish) {
      // Wait for the synchronized instant barrier
      const waitMs = Math.max(0, simultaneousSubmitBarrierEpoch - Date.now());
      if (waitMs > 0) await sleep(waitMs);
    }

    // Perform final submit
    await timedFetch(
      metrics,
      'POST /api/attempts/[id]/submit',
      `${normalizedBaseUrl}/api/attempts/${attemptId}/submit`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(currentCode),
      }
    );
  });

  await Promise.all(studentPromises);
  const totalElapsedSeconds = Math.round((Date.now() - startTime) / 1000);
  console.log(`[Execution] Completed in ${totalElapsedSeconds}s.`);

  // Print latency percentiles and error report
  metrics.printReport();

  // 6. Data Integrity Verification: Verify zero lost answers
  if (!args.skipDbVerify) {
    await verifyZeroLostAnswers(lastAutosavedCode);
  } else {
    console.log('[Verification] Skipped database verification (--skip-db-verify passed).');
  }

  await prisma.$disconnect();
}

async function timedFetch(
  metrics: MetricsCollector,
  endpoint: string,
  url: string,
  init: RequestInit
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const start = performance.now();
  let status = 0;
  let ok = false;
  let data: unknown = null;
  let errorMsg: string | undefined;

  try {
    const res = await fetch(url, init);
    status = res.status;
    ok = res.ok;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!ok) {
      errorMsg = typeof data === 'object' && data !== null ? JSON.stringify(data) : text;
    }
  } catch (err) {
    status = 0;
    ok = false;
    errorMsg = err instanceof Error ? err.message : String(err);
  } finally {
    const durationMs = Math.round(performance.now() - start);
    metrics.record(endpoint, durationMs, status, ok, errorMsg);
  }

  return { ok, status, data };
}

async function verifyZeroLostAnswers(expectedCodeMap: Map<string, SavedCode>) {
  console.log('========================================================================================');
  console.log('DATA INTEGRITY VERIFICATION (Priority: Never lose a student\'s answer)');
  console.log('========================================================================================');

  const attemptIds = Array.from(expectedCodeMap.keys());
  if (attemptIds.length === 0) {
    console.log('\x1b[33m[Verification Warning] No attempts recorded to verify.\x1b[0m');
    return;
  }

  console.log(`Checking database state for ${attemptIds.length} submitted attempts...`);

  const attempts = await prisma.attempt.findMany({
    where: { id: { in: attemptIds } },
    select: { id: true, html: true, css: true, js: true, status: true },
  });

  const attemptMap = new Map(attempts.map((a) => [a.id, a]));
  let matched = 0;
  let mismatched = 0;
  let missingInDb = 0;

  for (const [id, expected] of expectedCodeMap.entries()) {
    const actual = attemptMap.get(id);
    if (!actual) {
      missingInDb += 1;
      console.error(`\x1b[31m[Missing] Attempt ${id} was not found in the database!\x1b[0m`);
      continue;
    }

    const htmlMatch = actual.html === expected.html;
    const cssMatch = actual.css === expected.css;
    const jsMatch = actual.js === expected.js;

    if (htmlMatch && cssMatch && jsMatch) {
      matched += 1;
    } else {
      mismatched += 1;
      console.error(`\x1b[31m[Data Mismatch] Attempt ${id} code differs from last sent autosave:\x1b[0m`);
      if (!htmlMatch) console.error(`  HTML Diff: Expected "${expected.html.slice(0, 50)}..." vs DB "${actual.html.slice(0, 50)}..."`);
      if (!cssMatch) console.error(`  CSS Diff: Expected "${expected.css.slice(0, 50)}..." vs DB "${actual.css.slice(0, 50)}..."`);
      if (!jsMatch) console.error(`  JS Diff: Expected "${expected.js.slice(0, 50)}..." vs DB "${actual.js.slice(0, 50)}..."`);
    }
  }

  console.log(`Total Attempt Checked:     ${attemptIds.length}`);
  console.log(`Exactly Matched:          ${matched} (${Math.round((matched / attemptIds.length) * 1000) / 10}%)`);
  console.log(`Mismatched / Lost Code:   ${mismatched}`);
  console.log(`Missing in Database:      ${missingInDb}`);

  if (mismatched === 0 && missingInDb === 0) {
    console.log('\x1b[32m[RESULT: PASSED] Verified 100% data integrity: zero lost answers!\x1b[0m');
  } else {
    console.error('\x1b[31m[RESULT: FAILED] Data integrity compromised: answers were lost or outdated in the database.\x1b[0m');
    process.exitCode = 1;
  }
  console.log('========================================================================================\n');
}

void main();
