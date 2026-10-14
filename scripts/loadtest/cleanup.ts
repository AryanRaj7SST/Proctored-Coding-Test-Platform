#!/usr/bin/env node
/**
 * Cleanup script for load test runs.
 *
 * Removes only rows created for a specific load-test run:
 * - Users with email starting with "loadtest-<runId>-"
 * - Related records in: attempts, exam_sessions, exam_assignments, proctor_events,
 *   test_runs, test_results, attempt_flags, attempt_score_histories, audit_logs.
 * - Restricts attempt/session/assignment/proctor_event deletion to exams starting with "LOADTEST ".
 * - Preserves all exams, questions, and other users completely.
 *
 * Usage:
 *   npx tsx scripts/loadtest/cleanup.ts --run-id <runId>           # DRY RUN (default)
 *   npx tsx scripts/loadtest/cleanup.ts --run-id <runId> --execute # DELETION (one transaction)
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';

export interface CleanupCounts {
  users: number;
  exam_assignments: number;
  exam_sessions: number;
  attempts: number;
  test_results: number;
  test_runs: number;
  proctor_events: number;
  attempt_flags: number;
  attempt_score_histories: number;
  audit_logs: number;
  skipped_non_loadtest_records: number;
}

export async function getCleanupCounts(
  client: PrismaClient,
  runId: string,
): Promise<{
  counts: CleanupCounts;
  userIds: string[];
  attemptIds: string[];
  sessionIds: string[];
  assignmentIds: string[];
  proctorEventIds: string[];
}> {
  const prefix = `loadtest-${runId}-`;

  // 1. Identify users created for this run
  const users = await client.user.findMany({
    where: {
      email: { startsWith: prefix },
    },
    select: { id: true, email: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length === 0) {
    return {
      counts: {
        users: 0,
        exam_assignments: 0,
        exam_sessions: 0,
        attempts: 0,
        test_results: 0,
        test_runs: 0,
        proctor_events: 0,
        attempt_flags: 0,
        attempt_score_histories: 0,
        audit_logs: 0,
        skipped_non_loadtest_records: 0,
      },
      userIds: [],
      attemptIds: [],
      sessionIds: [],
      assignmentIds: [],
      proctorEventIds: [],
    };
  }

  // 2. Identify records strictly tied to LOADTEST exams
  const attempts = await client.attempt.findMany({
    where: {
      userId: { in: userIds },
      exam: { title: { startsWith: 'LOADTEST ' } },
    },
    select: { id: true },
  });
  const attemptIds = attempts.map((a) => a.id);

  const sessions = await client.examSession.findMany({
    where: {
      userId: { in: userIds },
      exam: { title: { startsWith: 'LOADTEST ' } },
    },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  const assignments = await client.examAssignment.findMany({
    where: {
      userId: { in: userIds },
      exam: { title: { startsWith: 'LOADTEST ' } },
    },
    select: { id: true },
  });
  const assignmentIds = assignments.map((a) => a.id);

  const proctorEvents = await client.proctorEvent.findMany({
    where: {
      userId: { in: userIds },
      exam: { title: { startsWith: 'LOADTEST ' } },
    },
    select: { id: true },
  });
  const proctorEventIds = proctorEvents.map((p) => p.id);

  // Check for any records on non-LOADTEST exams (safety check)
  const nonLoadtestAttempts = await client.attempt.count({
    where: {
      userId: { in: userIds },
      NOT: { exam: { title: { startsWith: 'LOADTEST ' } } },
    },
  });

  // Query child records linked to the identified attempts/users
  const testResultsCount =
    attemptIds.length > 0 ? await client.testResult.count({ where: { attemptId: { in: attemptIds } } }) : 0;

  const testRunsCount =
    attemptIds.length > 0 || userIds.length > 0
      ? await client.testRun.count({
          where: {
            OR: [
              ...(attemptIds.length > 0 ? [{ attemptId: { in: attemptIds } }] : []),
              ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
            ],
          },
        })
      : 0;

  const attemptFlagsCount =
    attemptIds.length > 0 ? await client.attemptFlag.count({ where: { attemptId: { in: attemptIds } } }) : 0;

  const attemptScoreHistoriesCount =
    attemptIds.length > 0
      ? await client.attemptScoreHistory.count({ where: { attemptId: { in: attemptIds } } })
      : 0;

  const auditLogsCount = await client.auditLog.count({
    where: { userId: { in: userIds } },
  });

  return {
    counts: {
      users: userIds.length,
      exam_assignments: assignmentIds.length,
      exam_sessions: sessionIds.length,
      attempts: attemptIds.length,
      test_results: testResultsCount,
      test_runs: testRunsCount,
      proctor_events: proctorEventIds.length,
      attempt_flags: attemptFlagsCount,
      attempt_score_histories: attemptScoreHistoriesCount,
      audit_logs: auditLogsCount,
      skipped_non_loadtest_records: nonLoadtestAttempts,
    },
    userIds,
    attemptIds,
    sessionIds,
    assignmentIds,
    proctorEventIds,
  };
}

export async function executeCleanup(
  client: PrismaClient,
  options: { runId: string; execute?: boolean },
): Promise<{ before: CleanupCounts; after: CleanupCounts }> {
  const { runId, execute = false } = options;

  const beforeData = await getCleanupCounts(client, runId);
  const before = beforeData.counts;

  if (!execute || before.users === 0) {
    return { before, after: before };
  }

  const { userIds, attemptIds, sessionIds, assignmentIds, proctorEventIds } = beforeData;

  // Single transaction ordered deletion
  await client.$transaction(async (tx) => {
    // 1. Delete leaf test results
    if (attemptIds.length > 0) {
      await tx.testResult.deleteMany({
        where: { attemptId: { in: attemptIds } },
      });

      // 2. Delete test runs
      await tx.testRun.deleteMany({
        where: {
          OR: [{ attemptId: { in: attemptIds } }, { userId: { in: userIds } }],
        },
      });

      // 3. Delete attempt flags & score histories
      await tx.attemptFlag.deleteMany({
        where: { attemptId: { in: attemptIds } },
      });
      await tx.attemptScoreHistory.deleteMany({
        where: { attemptId: { in: attemptIds } },
      });
    }

    // 4. Delete proctor events
    if (proctorEventIds.length > 0) {
      await tx.proctorEvent.deleteMany({
        where: { id: { in: proctorEventIds } },
      });
    }

    // 5. Delete attempts
    if (attemptIds.length > 0) {
      await tx.attempt.deleteMany({
        where: { id: { in: attemptIds } },
      });
    }

    // 6. Delete exam sessions
    if (sessionIds.length > 0) {
      await tx.examSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
    }

    // 7. Delete exam assignments
    if (assignmentIds.length > 0) {
      await tx.examAssignment.deleteMany({
        where: { id: { in: assignmentIds } },
      });
    }

    // 8. Delete audit logs
    if (userIds.length > 0) {
      await tx.auditLog.deleteMany({
        where: { userId: { in: userIds } },
      });

      // 9. Delete users
      await tx.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  });

  const afterData = await getCleanupCounts(client, runId);
  return { before, after: afterData.counts };
}

function printTable(rows: { table: string; before: number; after?: number }[], isExecuted: boolean) {
  if (isExecuted) {
    console.log('----------------------------------------------------------------------');
    console.log(
      `${'Table'.padEnd(28)} | ${'Before'.padStart(10)} | ${'After'.padStart(10)} | ${'Deleted'.padStart(10)}`,
    );
    console.log('----------------------------------------------------------------------');
    for (const row of rows) {
      const deleted = row.before - (row.after ?? 0);
      console.log(
        `${row.table.padEnd(28)} | ${String(row.before).padStart(10)} | ${String(row.after ?? 0).padStart(10)} | ${String(deleted).padStart(10)}`,
      );
    }
    console.log('----------------------------------------------------------------------');
  } else {
    console.log('----------------------------------------------------');
    console.log(`${'Table'.padEnd(28)} | ${'Target Records'.padStart(16)}`);
    console.log('----------------------------------------------------');
    for (const row of rows) {
      console.log(`${row.table.padEnd(28)} | ${String(row.before).padStart(16)}`);
    }
    console.log('----------------------------------------------------');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };
  const hasFlag = (flag: string): boolean => args.includes(flag);

  const runId = getArg('--run-id');
  const execute = hasFlag('--execute');
  const help = hasFlag('--help') || hasFlag('-h');

  if (help || !runId) {
    console.log(`
Usage: npx tsx scripts/loadtest/cleanup.ts --run-id <runId> [options]

Required:
  --run-id <id>      The load-test runId (e.g. "loadtest-<runId>-student-001@...")

Options:
  --execute          Actually delete the records (runs in a single atomic transaction).
                     Default is DRY RUN: counts are reported, nothing is deleted.
  --help, -h         Show this help message.
`);
    if (!runId && !help) {
      console.error('\x1b[31m[ERROR] --run-id is required.\x1b[0m');
      process.exit(1);
    }
    process.exit(0);
  }

  console.log('======================================================================');
  console.log(`LOAD TEST DATA CLEANUP: runId = "${runId}"`);
  console.log(
    `Mode: ${execute ? '\x1b[31mEXECUTE (DELETION ENABLED)\x1b[0m' : '\x1b[33mDRY RUN (NO RECORDS TOUCHED)\x1b[0m'}`,
  );
  console.log('======================================================================');
  console.log('Scope:');
  console.log(`  Users matching prefix:       "loadtest-${runId}-*"`);
  console.log('  Exams scoped:                Title starting with "LOADTEST "');
  console.log(
    '  Preserved tables (skipped):  exams, questions, question_tests, exam_questions, allowed_emails',
  );
  console.log('----------------------------------------------------------------------\n');

  try {
    const { before, after } = await executeCleanup(prisma, { runId, execute });

    if (before.skipped_non_loadtest_records > 0) {
      console.warn(
        `\x1b[33m[WARNING] Found ${before.skipped_non_loadtest_records} attempt(s) belonging to loadtest users on non-LOADTEST exams. These were NOT touched to protect non-loadtest data.\x1b[0m\n`,
      );
    }

    const rows = [
      { table: 'users', before: before.users, after: after.users },
      { table: 'exam_assignments', before: before.exam_assignments, after: after.exam_assignments },
      { table: 'exam_sessions', before: before.exam_sessions, after: after.exam_sessions },
      { table: 'attempts', before: before.attempts, after: after.attempts },
      { table: 'test_results', before: before.test_results, after: after.test_results },
      { table: 'test_runs', before: before.test_runs, after: after.test_runs },
      { table: 'proctor_events', before: before.proctor_events, after: after.proctor_events },
      { table: 'attempt_flags', before: before.attempt_flags, after: after.attempt_flags },
      {
        table: 'attempt_score_histories',
        before: before.attempt_score_histories,
        after: after.attempt_score_histories,
      },
      { table: 'audit_logs', before: before.audit_logs, after: after.audit_logs },
    ];

    printTable(rows, execute);

    if (!execute) {
      console.log('\n\x1b[33m[DRY RUN COMPLETE] No records were modified or deleted.\x1b[0m');
      console.log(
        `To delete the rows listed above, run:\n  npx tsx scripts/loadtest/cleanup.ts --run-id ${runId} --execute\n`,
      );
    } else {
      console.log(
        '\n\x1b[32m[EXECUTE COMPLETE] Successfully deleted all scoped load-test records in one transaction.\x1b[0m\n',
      );
    }
  } catch (err) {
    console.error('\x1b[31m[ERROR] Cleanup failed:\x1b[0m', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  process.argv[1].replace(/\\/g, '/').endsWith('scripts/loadtest/cleanup.ts') &&
  !process.env.VITEST
) {
  main().catch((err) => {
    console.error('Fatal cleanup error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
