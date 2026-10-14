#!/usr/bin/env node
/**
 * Load test for GET /api/exams/[id]/leaderboard at 200 concurrent students refreshing every 15s.
 */

import { prisma } from '../../src/lib/prisma';
import { MetricsCollector } from './metrics';
import { provisionStudents, resolveAuthSecret } from './session';

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  return {
    baseUrl: getArg('--base-url') ?? 'http://localhost:3000',
    examId: getArg('--exam-id'),
    studentsCount: parseInt(getArg('--students') ?? '200', 10),
    refreshIntervalSec: parseInt(getArg('--refresh-interval') ?? '15', 10),
    durationSeconds: parseInt(getArg('--duration-seconds') ?? '45', 10),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getOrSeedExam(): Promise<string> {
  // Find an existing active LIVE or published exam or create one
  const existing = await prisma.exam.findFirst({
    where: {
      active: true,
      status: 'PUBLISHED',
      leaderboardMode: 'LIVE',
      questions: { some: {} },
    },
    select: { id: true, title: true },
  });

  if (existing) {
    console.log(`[Setup] Using existing active LIVE exam "${existing.title}" (${existing.id})`);
    return existing.id;
  }

  // Create an exam for the load test
  console.log('[Setup] Creating test contest with 3 questions for load test...');
  const exam = await prisma.exam.create({
    data: {
      title: 'Load Test ICPC Challenge',
      description: 'Automated 200-student load test contest',
      status: 'PUBLISHED',
      active: true,
      accessMode: 'ANY_AUTHENTICATED_USER',
      startTime: new Date(Date.now() - 30 * 60 * 1000), // started 30 mins ago
      endTime: new Date(Date.now() + 90 * 60 * 1000), // ends in 90 mins
      leaderboardMode: 'LIVE',
      wrongTryPenaltySeconds: 300,
    },
  });

  // Ensure 3 questions exist
  const existingQuestions = await prisma.question.findMany({ take: 3 });
  if (existingQuestions.length >= 3) {
    for (let i = 0; i < 3; i++) {
      const q = existingQuestions[i];
      if (!q) continue;
      await prisma.examQuestion.create({
        data: {
          examId: exam.id,
          questionId: q.id,
          order: i + 1,
          marks: 100,
        },
      });
    }
  } else {
    for (let q = 1; q <= 3; q++) {
      const stamp = Date.now();
      const question = await prisma.question.create({
        data: {
          slug: `loadtest-q-${stamp}-${q}`,
          title: `Problem ${String.fromCharCode(64 + q)}: Challenge ${q}`,
          description: `Description for problem ${q}`,
          starterHtml: '<div></div>',
          starterCss: '/* css */',
          starterJs: '// js',
        },
      });

      await prisma.examQuestion.create({
        data: {
          examId: exam.id,
          questionId: question.id,
          order: q,
          marks: 100,
        },
      });
    }
  }

  return exam.id;
}

async function getDbQueryStats(): Promise<number> {
  try {
    const res = await prisma.$queryRaw<Array<{ tup_returned: bigint }>>`
      SELECT sum(tup_returned)::bigint as tup_returned
      FROM pg_stat_database
      WHERE datname = current_database();
    `;
    return Number(res[0]?.tup_returned ?? 0);
  } catch {
    return 0;
  }
}

async function main() {
  const args = parseArgs();
  console.log('========================================================================');
  console.log('LEADERBOARD LOAD TEST (200 Students @ 15s refresh)');
  console.log('========================================================================');
  console.log(`Base URL:         ${args.baseUrl}`);
  console.log(`Concurrent Users: ${args.studentsCount}`);
  console.log(`Refresh Interval: ${args.refreshIntervalSec}s`);
  console.log(`Duration:         ${args.durationSeconds}s`);

  const authSecret = resolveAuthSecret();
  const examId = args.examId || (await getOrSeedExam());

  // Provision students
  const students = await provisionStudents({
    count: args.studentsCount,
    examId,
    baseUrl: args.baseUrl,
    authSecret,
  });

  const firstStudent = students[0];
  if (!firstStudent) {
    throw new Error('No students provisioned');
  }

  console.log(`\n[Warmup] Testing single request to warmup endpoint and database...`);
  const warmupStart = Date.now();
  const warmupRes = await fetch(`${args.baseUrl}/api/exams/${examId}/leaderboard`, {
    headers: {
      cookie: firstStudent.cookieHeader,
      accept: 'application/json',
    },
  });
  const warmupTime = Date.now() - warmupStart;
  console.log(`Warmup status: ${warmupRes.status} in ${warmupTime}ms`);

  if (!warmupRes.ok) {
    const text = await warmupRes.text();
    console.error(`Warmup request failed (${warmupRes.status}):`, text);
    process.exit(1);
  }

  const warmupJson = (await warmupRes.json()) as any;
  console.log(
    `Warmup verified: mode=${warmupJson.mode}, totalParticipants=${warmupJson.total}, questions=${warmupJson.questions?.length}`,
  );

  // Query baseline DB stats
  const initialDbStats = await getDbQueryStats();

  console.log(`\n[LoadTest] Spawning ${students.length} student workers...`);
  console.log(
    `Each worker refreshes every ${args.refreshIntervalSec}s over ${args.durationSeconds}s total duration.`,
  );

  const metrics = new MetricsCollector();
  const testStart = Date.now();
  const testEnd = testStart + args.durationSeconds * 1000;

  // Run each student worker
  const studentWorkers = students.map(async (student) => {
    // Stagger arrival within the 15s interval window to simulate real distributed traffic
    const initialDelayMs = Math.random() * (args.refreshIntervalSec * 1000);
    await sleep(initialDelayMs);

    while (Date.now() < testEnd) {
      const reqStart = Date.now();
      let status = 0;
      let ok = false;
      let error: string | undefined;

      try {
        const res = await fetch(`${args.baseUrl}/api/exams/${examId}/leaderboard`, {
          headers: {
            cookie: student.cookieHeader,
            accept: 'application/json',
          },
        });
        status = res.status;
        ok = res.ok;
        if (!ok) {
          error = `HTTP ${status}`;
        }
        // Consume body
        await res.text();
      } catch (err) {
        status = 0;
        ok = false;
        error = err instanceof Error ? err.message : 'Fetch error';
      }

      const durationMs = Date.now() - reqStart;
      metrics.record('GET /api/exams/[id]/leaderboard', durationMs, status, ok, error);

      // Wait for next refresh interval (15s) with a minor random jitter +/- 1s
      const jitterMs = (Math.random() - 0.5) * 2000;
      const sleepTime = Math.max(1000, args.refreshIntervalSec * 1000 + jitterMs);
      await sleep(sleepTime);
    }
  });

  await Promise.all(studentWorkers);

  const finalDbStats = await getDbQueryStats();
  const totalDbTuplesReturned = finalDbStats - initialDbStats;

  // Print results
  metrics.printReport();

  const summary = metrics.summary();
  const row = summary.rows.find((r) => r.endpoint === 'GET /api/exams/[id]/leaderboard');
  const p95 = row?.p95 ?? 0;
  const p50 = row?.p50 ?? 0;
  const p99 = row?.p99 ?? 0;
  const total = row?.total ?? 0;
  const errors = row?.errors ?? 0;

  console.log('\n========================================================================');
  console.log('LOAD TEST SUMMARY RESULTS:');
  console.log('========================================================================');
  console.log(`Total Requests:         ${total}`);
  console.log(`Successful:             ${total - errors}`);
  console.log(`Failed:                 ${errors}`);
  console.log(`Median Latency (p50):   ${p50} ms`);
  console.log(`95th Percentile (p95):  ${p95} ms`);
  console.log(`99th Percentile (p99):  ${p99} ms`);
  console.log(`DB Tuples Scanned/Ret:  ~${totalDbTuplesReturned}`);
  console.log(`Target p95:             <= 500 ms`);
  console.log(
    `Cache Status:           ${p95 <= 500 ? 'PASS (In-memory ~10s cache effective)' : 'FAIL (> 500ms)'}`,
  );
  console.log('========================================================================\n');

  if (p95 > 500) {
    console.error(`[FAIL] p95 latency (${p95}ms) exceeded 500ms threshold!`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL] Load test error:', err);
  process.exit(1);
});
