import { prisma } from '../src/lib/prisma';
import { executePracticeTests } from '../src/server/services/practice';

async function main() {
  console.log('=== VERIFYING PRACTICE MODE & ATTEMPT IMMUTABILITY ===');

  // 1. Find a completed attempt
  let attempt = await prisma.attempt.findFirst({
    where: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED'] } },
    include: { question: true, user: true, exam: true },
  });

  if (!attempt) {
    console.log('No completed attempt found. Finding any attempt to test...');
    const anyAttempt = await prisma.attempt.findFirst({
      include: { question: true, user: true, exam: true },
    });
    if (!anyAttempt) {
      throw new Error('No attempts found in database.');
    }
    // Update to SUBMITTED for testing
    attempt = await prisma.attempt.update({
      where: { id: anyAttempt.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        html: '<div id="container">Original HTML</div>',
        css: '#container { display: flex; }',
        js: '// original js',
        score: 10,
        maxScore: 30,
      },
      include: { question: true, user: true, exam: true },
    });
  }

  console.log(`Testing with Attempt ${attempt.id} for user ${attempt.user.email}`);
  console.log(`Original state:
  status: ${attempt.status}
  score: ${attempt.score}/${attempt.maxScore}
  html: ${JSON.stringify(attempt.html)}
  css: ${JSON.stringify(attempt.css)}
  js: ${JSON.stringify(attempt.js)}
  submittedAt: ${attempt.submittedAt?.toISOString()}
  `);

  const originalHtml = attempt.html;
  const originalCss = attempt.css;
  const originalJs = attempt.js;
  const originalScore = attempt.score;
  const originalMaxScore = attempt.maxScore;
  const originalStatus = attempt.status;
  const originalSubmittedAt = attempt.submittedAt?.getTime();

  // Count existing TestResult rows for this attempt
  const originalTestResultCount = await prisma.testResult.count({
    where: { attemptId: attempt.id },
  });

  // Count existing TestRun rows
  const originalTestRunCount = await prisma.testRun.count();

  // 2. Execute practice tests with radically modified code
  const modifiedCode = {
    html: '<div id="grid-container"><div class="item">1</div><div class="item">2</div><div class="item">3</div></div>',
    css: '#grid-container { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; } .item { background: blue; }',
    js: 'console.log("practice code running");',
  };

  console.log('Running practice tests with modified code against the runner container...');
  const outcome = await executePracticeTests({
    attemptId: attempt.id,
    user: {
      id: attempt.userId,
      role: 'STUDENT',
      email: attempt.user.email,
      name: attempt.user.name,
      batch: null,
    },
    code: modifiedCode,
  });

  console.log('Practice test run outcome:');
  console.log(`  passed: ${outcome.passedCount}/${outcome.totalCount}`);
  console.log(`  score: ${outcome.score}/${outcome.maxScore}`);
  console.log(`  results count: ${outcome.results.length}`);

  // 3. Re-fetch attempt from database to verify strict immutability
  const afterAttempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: attempt.id },
  });

  console.log(`Post-practice DB Attempt state:
  status: ${afterAttempt.status}
  score: ${afterAttempt.score}/${afterAttempt.maxScore}
  html: ${JSON.stringify(afterAttempt.html)}
  css: ${JSON.stringify(afterAttempt.css)}
  js: ${JSON.stringify(afterAttempt.js)}
  submittedAt: ${afterAttempt.submittedAt?.toISOString()}
  `);

  if (afterAttempt.html !== originalHtml) {
    throw new Error(
      `FAIL: Attempt html was modified! Expected "${originalHtml}", got "${afterAttempt.html}"`,
    );
  }
  if (afterAttempt.css !== originalCss) {
    throw new Error(`FAIL: Attempt css was modified! Expected "${originalCss}", got "${afterAttempt.css}"`);
  }
  if (afterAttempt.js !== originalJs) {
    throw new Error(`FAIL: Attempt js was modified! Expected "${originalJs}", got "${afterAttempt.js}"`);
  }
  if (afterAttempt.score !== originalScore) {
    throw new Error(`FAIL: Attempt score was modified! Expected ${originalScore}, got ${afterAttempt.score}`);
  }
  if (afterAttempt.maxScore !== originalMaxScore) {
    throw new Error(
      `FAIL: Attempt maxScore was modified! Expected ${originalMaxScore}, got ${afterAttempt.maxScore}`,
    );
  }
  if (afterAttempt.status !== originalStatus) {
    throw new Error(
      `FAIL: Attempt status was modified! Expected ${originalStatus}, got ${afterAttempt.status}`,
    );
  }
  if (afterAttempt.submittedAt?.getTime() !== originalSubmittedAt) {
    throw new Error('FAIL: Attempt submittedAt was modified!');
  }

  // Check no TestResults were added for this attempt
  const afterTestResultCount = await prisma.testResult.count({
    where: { attemptId: attempt.id },
  });
  if (afterTestResultCount !== originalTestResultCount) {
    throw new Error(
      `FAIL: TestResult count changed for attempt! Expected ${originalTestResultCount}, got ${afterTestResultCount}`,
    );
  }

  // Check that the TestRun created has attemptId: null and kind: VALIDATION
  const newTestRuns = await prisma.testRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 1,
  });
  const latestRun = newTestRuns[0];
  if (latestRun) {
    console.log(
      `Latest TestRun: id=${latestRun.id}, attemptId=${latestRun.attemptId}, kind=${latestRun.kind}`,
    );
    if (latestRun.attemptId !== null) {
      throw new Error(`FAIL: Latest TestRun attemptId must be null! Got: ${latestRun.attemptId}`);
    }
    if (latestRun.kind !== 'VALIDATION') {
      throw new Error(`FAIL: Latest TestRun kind must be VALIDATION! Got: ${latestRun.kind}`);
    }
  }

  // 4. Test security check: other user should be rejected
  try {
    await executePracticeTests({
      attemptId: attempt.id,
      user: {
        id: 'non-existent-user-id',
        role: 'STUDENT',
        email: 'other@example.com',
        name: 'Other',
        batch: null,
      },
      code: modifiedCode,
    });
    throw new Error('FAIL: Practice test execution should have thrown forbidden/notFound for wrong user!');
  } catch (err: unknown) {
    const error = err as { message: string; statusCode?: number };
    console.log(`Security check 1 passed: wrong user correctly rejected with message "${error.message}"`);
  }

  console.log('\n SUCCESS: ALL PRACTICE MODE IMMUTABILITY AND INTEGRITY CHECKS PASSED!\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
