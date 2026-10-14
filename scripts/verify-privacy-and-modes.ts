#!/usr/bin/env node
/**
 * Privacy Audit & Mode Matrix Verification for Leaderboard Feature.
 *
 * 1. Privacy Audit: Authenticates as a standard student, calls GET /api/exams/[id]/leaderboard
 *    and GET /api/exams/[id]/me/rank, capturing full network responses and rigorously asserting
 *    zero leakage of email, userId, code, internal test names, or expected values.
 * 2. Mode Matrix: Exhaustively validates LIVE, AFTER_END, and HIDDEN across Before, During,
 *    and After contest windows.
 */

import { prisma } from '../src/lib/prisma';
import { provisionStudents, resolveAuthSecret } from './loadtest/session';
import { invalidateLeaderboardCache } from '../src/server/services/leaderboard';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`\x1b[31m[FAIL] ${msg}\x1b[0m`);
    throw new Error(msg);
  }
}

async function runPrivacyAudit(examId: string, student: { cookieHeader: string; id: string; email: string }) {
  console.log('\n========================================================================');
  console.log('PART 1: PRIVACY AUDIT (Student Network Responses)');
  console.log('========================================================================');

  // Set exam to LIVE mode and invalidate cache first to ensure clean fetch
  await prisma.exam.update({
    where: { id: examId },
    data: {
      leaderboardMode: 'LIVE',
      startTime: new Date(Date.now() - 3600 * 1000),
      endTime: new Date(Date.now() + 3600 * 1000),
    },
  });
  invalidateLeaderboardCache(examId);

  // 1. GET /api/exams/[id]/leaderboard
  console.log(`[Audit] Fetching GET ${BASE_URL}/api/exams/${examId}/leaderboard as normal student...`);
  const lbRes = await fetch(`${BASE_URL}/api/exams/${examId}/leaderboard`, {
    headers: {
      cookie: student.cookieHeader,
      accept: 'application/json',
    },
  });

  assert(lbRes.ok, `Leaderboard API returned ${lbRes.status}`);
  const lbText = await lbRes.text();
  const lbJson = JSON.parse(lbText);

  console.log('\n--- Captured Leaderboard API Response Sample ---');
  console.log(JSON.stringify(lbJson, null, 2).slice(0, 800) + '...\n');

  // 2. GET /api/exams/[id]/me/rank
  console.log(`[Audit] Fetching GET ${BASE_URL}/api/exams/${examId}/me/rank as normal student...`);
  const rankRes = await fetch(`${BASE_URL}/api/exams/${examId}/me/rank`, {
    headers: {
      cookie: student.cookieHeader,
      accept: 'application/json',
    },
  });

  assert(rankRes.ok, `Rank API returned ${rankRes.status}`);
  const rankText = await rankRes.text();
  const rankJson = JSON.parse(rankText);

  console.log('\n--- Captured Rank API Response ---');
  console.log(JSON.stringify(rankJson, null, 2));

  // Rigorous Privacy Assertions
  console.log('\n[Audit] Performing Privacy Checks:');

  // Check 1: No email in response
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emailsInLb = lbText.match(emailRegex) ?? [];
  const emailsInRank = rankText.match(emailRegex) ?? [];
  assert(emailsInLb.length === 0, `Forbidden emails found in leaderboard response: ${emailsInLb.join(', ')}`);
  assert(emailsInRank.length === 0, `Forbidden emails found in rank response: ${emailsInRank.join(', ')}`);
  console.log('  [PASS] 0 student or instructor emails exposed');

  // Check 2: No user IDs exposed
  assert(
    !lbText.includes(student.id),
    `Requesting student userId (${student.id}) found in leaderboard response`,
  );
  assert(!rankText.includes(student.id), `Requesting student userId (${student.id}) found in rank response`);
  assert(!lbText.includes('"userId"'), 'Key "userId" found in leaderboard JSON');
  assert(!lbText.includes('"id":'), 'Field "id" found in leaderboard JSON');
  console.log('  [PASS] 0 user IDs (or internal record IDs) exposed');

  // Check 3: No source code or solutions
  const codePatterns = ['function', 'const ', 'let ', 'var ', '<script', '<style', '<html>', 'return ', '=>'];
  for (const pat of codePatterns) {
    assert(!lbText.includes(`"${pat}`), `Potential source code snippet found containing "${pat}"`);
  }
  assert(!lbText.includes('"code"'), 'Key "code" found in leaderboard JSON');
  assert(!lbText.includes('"html"'), 'Key "html" found in leaderboard JSON');
  assert(!lbText.includes('"css"'), 'Key "css" found in leaderboard JSON');
  assert(!lbText.includes('"js"'), 'Key "js" found in leaderboard JSON');
  console.log('  [PASS] 0 student code, html, css, or js strings exposed');

  // Check 4: No internal test names or expected values
  assert(!lbText.includes('"expected"'), 'Key "expected" found in leaderboard JSON');
  assert(!lbText.includes('"actual"'), 'Key "actual" found in leaderboard JSON');
  assert(!lbText.includes('"testSuite"'), 'Key "testSuite" found in leaderboard JSON');
  assert(!lbText.includes('"testName"'), 'Key "testName" found in leaderboard JSON');
  assert(!lbText.includes('"hidden"'), 'Key "hidden" found in leaderboard JSON');
  console.log('  [PASS] 0 internal test names or expected values exposed');

  // Check 5: Only whitelisted row fields
  if (lbJson.rows?.length > 0) {
    const rowKeys = Object.keys(lbJson.rows[0]).sort();
    const allowedRowKeys = [
      'attemptsCount',
      'effectiveSeconds',
      'handle',
      'questions',
      'rank',
      'score',
    ].sort();
    assert(
      JSON.stringify(rowKeys) === JSON.stringify(allowedRowKeys),
      `Unexpected row keys: ${rowKeys.join(', ')}`,
    );
    console.log(`  [PASS] Row schema strictly matches whitelist: ${rowKeys.join(', ')}`);
  }

  console.log('\n>>> PRIVACY AUDIT: 100% PASSED <<<\n');
}

async function runModeMatrix(examId: string, student: { cookieHeader: string }) {
  console.log('========================================================================');
  console.log('PART 2: CONTEST MODE MATRIX (LIVE | AFTER_END | HIDDEN)');
  console.log('========================================================================');

  const now = Date.now();
  const hour = 3600 * 1000;

  const windows = [
    {
      name: 'BEFORE_WINDOW',
      startTime: new Date(now + 2 * hour),
      endTime: new Date(now + 4 * hour),
      status: 'PUBLISHED',
    },
    {
      name: 'DURING_WINDOW',
      startTime: new Date(now - 1 * hour),
      endTime: new Date(now + 1 * hour),
      status: 'PUBLISHED',
    },
    {
      name: 'AFTER_WINDOW',
      startTime: new Date(now - 4 * hour),
      endTime: new Date(now - 2 * hour),
      status: 'ENDED',
    },
  ];

  const modes: ('LIVE' | 'AFTER_END' | 'HIDDEN')[] = ['LIVE', 'AFTER_END', 'HIDDEN'];

  console.log(
    'Mode        | Window         | Expected Status | Actual Status | Result\n' +
      '------------+----------------+-----------------+---------------+-------',
  );

  const sampleQuestion = await prisma.question.findFirst();

  for (const mode of modes) {
    for (const win of windows) {
      // Create dedicated exam for this exact mode and window combination
      const testExam = await prisma.exam.create({
        data: {
          title: `Matrix-${mode}-${win.name}`,
          status: win.status as any,
          active: true,
          accessMode: 'ANY_AUTHENTICATED_USER',
          leaderboardMode: mode,
          startTime: win.startTime,
          endTime: win.endTime,
          wrongTryPenaltySeconds: 300,
          questions: sampleQuestion
            ? {
                create: {
                  questionId: sampleQuestion.id,
                  order: 1,
                  marks: 100,
                },
              }
            : undefined,
        },
      });

      // Expected status:
      // HIDDEN -> 403 in all windows
      // AFTER_END -> 403 in BEFORE & DURING; 200 in AFTER
      // LIVE -> 200 in all windows
      let expectedStatus = 200;
      if (mode === 'HIDDEN') {
        expectedStatus = 403;
      } else if (mode === 'AFTER_END') {
        expectedStatus = win.name === 'AFTER_WINDOW' ? 200 : 403;
      } else if (mode === 'LIVE') {
        expectedStatus = 200;
      }

      const res = await fetch(`${BASE_URL}/api/exams/${testExam.id}/leaderboard`, {
        headers: {
          cookie: student.cookieHeader,
          accept: 'application/json',
        },
      });

      const actualStatus = res.status;
      const pass = actualStatus === expectedStatus;

      console.log(
        `${mode.padEnd(11)} | ${win.name.padEnd(14)} | ${String(expectedStatus).padEnd(15)} | ${String(actualStatus).padEnd(13)} | ${pass ? 'PASS' : 'FAIL'}`,
      );

      // Clean up test exam
      try {
        await prisma.examQuestion.deleteMany({ where: { examId: testExam.id } });
        await prisma.exam.delete({ where: { id: testExam.id } });
      } catch {
        // ignore cleanup error
      }

      assert(
        pass,
        `Mode matrix mismatch for ${mode} in ${win.name}: expected ${expectedStatus}, got ${actualStatus}`,
      );
    }
  }

  console.log('\n>>> MODE MATRIX AUDIT: 9/9 COMBINATIONS PASSED <<<\n');
}

async function main() {
  const authSecret = resolveAuthSecret();

  // Find or create an exam
  let exam = await prisma.exam.findFirst({
    where: {
      active: true,
      status: 'PUBLISHED',
      questions: { some: {} },
    },
    select: { id: true, title: true },
  });

  if (!exam) {
    throw new Error('No active and published exam found for privacy and mode verification');
  }

  // Provision student
  const students = await provisionStudents({
    count: 1,
    examId: exam.id,
    baseUrl: BASE_URL,
    authSecret,
  });

  const student = students[0];
  if (!student) {
    throw new Error('Failed to provision student');
  }

  await runPrivacyAudit(exam.id, student);
  await runModeMatrix(exam.id, student);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
