#!/usr/bin/env node
/**
 * Dedicated cleanup script for Midterm 5Q load test.
 *
 * Safely removes only load-test artifacts:
 *   1. Students tagged with `loadtest-<runId>-`
 *   2. Associated attempts, sessions, assignments, proctor events, test runs & results
 *   3. Exam titled "LOADTEST Mid-term 5Q 220"
 *   4. Questions with titles starting with "LOADTEST " created for load test
 *
 * Usage:
 *   npx tsx scripts/loadtest/cleanup-5q.ts --run-id <runId>           # Dry run (default)
 *   npx tsx scripts/loadtest/cleanup-5q.ts --run-id <runId> --execute # Performs deletion
 */

import { prisma } from '../../src/lib/prisma';

export interface Cleanup5QReport {
  runId: string;
  usersCount: number;
  attemptsCount: number;
  testRunsCount: number;
  testResultsCount: number;
  sessionsCount: number;
  assignmentsCount: number;
  examsCount: number;
  questionsCount: number;
}

export async function inspectCleanup(runId: string): Promise<Cleanup5QReport> {
  const userPrefix = `loadtest-${runId}-`;

  const users = await prisma.user.findMany({
    where: { email: { startsWith: userPrefix } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  const attempts = await prisma.attempt.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const attemptIds = attempts.map((a) => a.id);

  const testRuns = await prisma.testRun.findMany({
    where: { attemptId: { in: attemptIds } },
    select: { id: true },
  });
  const testRunIds = testRuns.map((r) => r.id);

  const testResultsCount = await prisma.testResult.count({
    where: { testRunId: { in: testRunIds } },
  });

  const sessionsCount = await prisma.examSession.count({
    where: { userId: { in: userIds } },
  });

  const assignmentsCount = await prisma.examAssignment.count({
    where: { userId: { in: userIds } },
  });

  const exams = await prisma.exam.findMany({
    where: { title: 'LOADTEST Mid-term 5Q 220' },
    select: { id: true },
  });

  const questions = await prisma.question.findMany({
    where: {
      title: { startsWith: 'LOADTEST ' },
      slug: { startsWith: 'loadtest-5q-' },
    },
    select: { id: true },
  });

  return {
    runId,
    usersCount: userIds.length,
    attemptsCount: attemptIds.length,
    testRunsCount: testRunIds.length,
    testResultsCount,
    sessionsCount,
    assignmentsCount,
    examsCount: exams.length,
    questionsCount: questions.length,
  };
}

export async function executeCleanup5Q(runId: string, deleteExamAndQuestions = false): Promise<Cleanup5QReport> {
  const report = await inspectCleanup(runId);
  const userPrefix = `loadtest-${runId}-`;

  const users = await prisma.user.findMany({
    where: { email: { startsWith: userPrefix } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  await prisma.$transaction(
    async (tx) => {
      if (userIds.length > 0) {
        const attempts = await tx.attempt.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const attemptIds = attempts.map((a) => a.id);

        if (attemptIds.length > 0) {
          const testRuns = await tx.testRun.findMany({
            where: { attemptId: { in: attemptIds } },
            select: { id: true },
          });
          const testRunIds = testRuns.map((r) => r.id);

          if (testRunIds.length > 0) {
            await tx.testResult.deleteMany({ where: { testRunId: { in: testRunIds } } });
            await tx.testRun.deleteMany({ where: { id: { in: testRunIds } } });
          }

          await tx.attemptFlag.deleteMany({ where: { attemptId: { in: attemptIds } } });
          await tx.attemptScoreHistory.deleteMany({ where: { attemptId: { in: attemptIds } } });
          await tx.attempt.deleteMany({ where: { id: { in: attemptIds } } });
        }

        await tx.proctorEvent.deleteMany({ where: { userId: { in: userIds } } });
        await tx.examSession.deleteMany({ where: { userId: { in: userIds } } });
        await tx.examAssignment.deleteMany({ where: { userId: { in: userIds } } });
        await tx.auditLog.deleteMany({ where: { userId: { in: userIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      }

      if (deleteExamAndQuestions) {
        const exams = await tx.exam.findMany({
          where: { title: 'LOADTEST Mid-term 5Q 220' },
          select: { id: true },
        });
        for (const ex of exams) {
          await tx.examQuestion.deleteMany({ where: { examId: ex.id } });
          await tx.examAssignment.deleteMany({ where: { examId: ex.id } });
          await tx.examSession.deleteMany({ where: { examId: ex.id } });
          await tx.attempt.deleteMany({ where: { examId: ex.id } });
          await tx.exam.delete({ where: { id: ex.id } });
        }

        const questions = await tx.question.findMany({
          where: {
            title: { startsWith: 'LOADTEST ' },
            slug: { startsWith: 'loadtest-5q-' },
          },
          select: { id: true },
        });
        for (const q of questions) {
          await tx.questionTestCase.deleteMany({ where: { questionId: q.id } });
          await tx.questionValidationRun.deleteMany({ where: { questionId: q.id } });
          await tx.examQuestion.deleteMany({ where: { questionId: q.id } });
          await tx.question.delete({ where: { id: q.id } });
        }
      }
    },
    { timeout: 60000 }
  );

  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };
  const runId = getArg('--run-id');
  const execute = args.includes('--execute');
  const withExam = args.includes('--with-exam');

  if (!runId) {
    console.error('Usage: npx tsx scripts/loadtest/cleanup-5q.ts --run-id <runId> [--execute] [--with-exam]');
    process.exit(1);
  }

  (async () => {
    if (!execute) {
      console.log(`\n[DRY RUN] Inspecting records for run-id: "${runId}"...`);
      const r = await inspectCleanup(runId);
      console.log('----------------------------------------------------------------------------------------');
      console.log(`Users (loadtest-${runId}-*):        ${r.usersCount}`);
      console.log(`Exam Assignments:                   ${r.assignmentsCount}`);
      console.log(`Exam Sessions:                      ${r.sessionsCount}`);
      console.log(`Attempts:                           ${r.attemptsCount}`);
      console.log(`Test Runs:                          ${r.testRunsCount}`);
      console.log(`Test Results:                       ${r.testResultsCount}`);
      console.log(`Exam (LOADTEST Mid-term 5Q 220):    ${r.examsCount} (will delete if --with-exam passed)`);
      console.log(`Questions (LOADTEST *):             ${r.questionsCount} (will delete if --with-exam passed)`);
      console.log('----------------------------------------------------------------------------------------');
      console.log('No rows modified. Pass --execute to delete student records.');
    } else {
      console.log(`\n[EXECUTE] Deleting records for run-id: "${runId}"...`);
      const r = await executeCleanup5Q(runId, withExam);
      console.log(`Deleted ${r.usersCount} users, ${r.attemptsCount} attempts, ${r.testRunsCount} runs.`);
      if (withExam) {
        console.log(`Deleted ${r.examsCount} exam and ${r.questionsCount} questions.`);
      }
    }
  })()
    .catch((err) => {
      console.error('Cleanup failed:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
