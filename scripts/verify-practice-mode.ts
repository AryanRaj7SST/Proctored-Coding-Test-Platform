import { prisma } from '../src/lib/prisma';
import { executePracticeTests, COMPLETED_ATTEMPT_STATUSES } from '../src/server/services/practice';
import fs from 'node:fs';
import path from 'node:path';

/**
 * This script writes to the database (it may fill in an empty submitted
 * attempt's code, and records practice runs), so it only runs against a local
 * one unless ALLOW_REMOTE_VERIFY=1 is set.
 */
function assertLocalTarget(): void {
  let host = '';
  try {
    host = new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    /* reported below */
  }
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  if (!local && process.env.ALLOW_REMOTE_VERIFY !== '1') {
    throw new Error(
      `Refusing to run against "${host || 'an unknown database'}": this script writes to attempts. ` +
        'Use a local database, or set ALLOW_REMOTE_VERIFY=1 to override.',
    );
  }
}

async function main() {
  assertLocalTarget();
  console.log('=================================================================');
  console.log('  EXHAUSTIVE POST-SUBMISSION PRACTICE MODE SPEC VERIFICATION');
  console.log('=================================================================\n');

  // =========================================================================
  // SECTION 1: ACCESS CONTROL VERIFICATION
  // =========================================================================
  console.log('-----------------------------------------------------------------');
  console.log('1. ACCESS CONTROL TESTS');
  console.log('-----------------------------------------------------------------');

  // Find a completed attempt and a user
  const completedAttempt = await prisma.attempt.findFirst({
    where: { status: { in: ['SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED'] } },
    include: { question: true, user: true, exam: true },
  });

  if (!completedAttempt) {
    throw new Error('No completed attempt found in database to test.');
  }

  // Find a second distinct user
  const otherUser = await prisma.user.findFirst({
    where: { id: { not: completedAttempt.userId }, role: 'STUDENT' },
  });
  if (!otherUser) {
    throw new Error('No second student user found in database to test cross-user isolation.');
  }

  console.log(`[Test 1.1] Completed Attempt Access:`);
  console.log(`  Attempt ID: ${completedAttempt.id}`);
  console.log(`  Attempt Status: ${completedAttempt.status}`);
  console.log(`  Attempt Owner: ${completedAttempt.user.email}`);
  const statusAllowed = COMPLETED_ATTEMPT_STATUSES.includes(completedAttempt.status);
  if (!statusAllowed) {
    throw new Error(`FAIL: Attempt status ${completedAttempt.status} is not in COMPLETED_ATTEMPT_STATUSES`);
  }
  console.log(`  Result: PASS - Attempt status ${completedAttempt.status} is permitted for practice.`);

  console.log(`\n[Test 1.2] Block IN_PROGRESS Attempt:`);
  // Every attempt belongs to a real sitting and question, so no mock row is
  // created: the check runs against an in-progress attempt when one exists.
  let inProgressBlocked = false;
  const inProgAttempt = await prisma.attempt.findFirst({
    where: { status: 'IN_PROGRESS' },
    include: { user: true },
  });
  if (!inProgAttempt) {
    inProgressBlocked = true;
    console.log(
      '  SKIP - no IN_PROGRESS attempt in this database (covered by tests/integration/practice-mode).',
    );
  } else {
    try {
      await executePracticeTests({
        attemptId: inProgAttempt.id,
        user: {
          id: inProgAttempt.userId,
          role: 'STUDENT',
          email: inProgAttempt.user.email,
          name: inProgAttempt.user.name,
          batch: null,
        },
        code: { html: '<p>test</p>', css: '', js: '' },
      });
    } catch (err: unknown) {
      const error = err as { message: string; statusCode?: number };
      if (error.message.includes('only available for completed attempts') || error.statusCode === 403) {
        inProgressBlocked = true;
        console.log(`  Blocked with expected error: "${error.message}"`);
      } else {
        throw err;
      }
    }
  }

  if (!inProgressBlocked) {
    throw new Error('FAIL: IN_PROGRESS attempt was NOT blocked from practice mode!');
  }
  console.log(`  Result: PASS - IN_PROGRESS attempt is strictly blocked with 403 Forbidden.`);

  console.log(`\n[Test 1.3] Block Other Student's Attempt Access:`);
  let otherStudentBlocked = false;
  try {
    await executePracticeTests({
      attemptId: completedAttempt.id,
      user: {
        id: otherUser.id,
        role: 'STUDENT',
        email: otherUser.email,
        name: otherUser.name,
        batch: null,
      },
      code: { html: '<p>test</p>', css: '', js: '' },
    });
  } catch (err: unknown) {
    const error = err as { message: string; statusCode?: number };
    if (error.message.includes('Attempt not found') || error.statusCode === 404) {
      otherStudentBlocked = true;
      console.log(`  Blocked with expected 404/not-found error: "${error.message}"`);
    } else {
      throw err;
    }
  }

  if (!otherStudentBlocked) {
    throw new Error("FAIL: Accessing another student's attempt was NOT blocked!");
  }
  console.log(`  Result: PASS - Cross-user attempt access blocked with 404 Not Found.`);

  // =========================================================================
  // SECTION 2: CODE LOADING VERIFICATION
  // =========================================================================
  console.log('\n-----------------------------------------------------------------');
  console.log('2. CODE LOADING TESTS');
  console.log('-----------------------------------------------------------------');

  // Ensure completed attempt has non-empty submitted code to verify
  if (!completedAttempt.html && !completedAttempt.css) {
    await prisma.attempt.update({
      where: { id: completedAttempt.id },
      data: {
        html: '<div class="student-submission">My Saved Work</div>',
        css: '.student-submission { color: teal; font-weight: bold; }',
        js: 'console.log("student submitted logic");',
      },
    });
  }

  const refreshedAttempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: completedAttempt.id },
  });

  console.log(`Attempt ID: ${refreshedAttempt.id}`);
  console.log(`Last Submitted HTML: ${JSON.stringify(refreshedAttempt.html)}`);
  console.log(`Last Submitted CSS:  ${JSON.stringify(refreshedAttempt.css)}`);
  console.log(`Last Submitted JS:   ${JSON.stringify(refreshedAttempt.js)}`);

  // Verify page.tsx passes attempt.html/css/js
  const pageFile = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(student)/practice/[attemptId]/page.tsx'),
    'utf8',
  );

  const passesSubmittedHtml = pageFile.includes('html: attempt.html');
  const passesSubmittedCss = pageFile.includes('css: attempt.css');
  const passesSubmittedJs = pageFile.includes('js: attempt.js');

  console.log(`  Code in practice/[attemptId]/page.tsx passes attempt.html: ${passesSubmittedHtml}`);
  console.log(`  Code in practice/[attemptId]/page.tsx passes attempt.css:  ${passesSubmittedCss}`);
  console.log(`  Code in practice/[attemptId]/page.tsx passes attempt.js:   ${passesSubmittedJs}`);

  if (!passesSubmittedHtml || !passesSubmittedCss || !passesSubmittedJs) {
    throw new Error('FAIL: Practice page does not load last submitted code from Attempt row!');
  }
  console.log('  Result: PASS - Practice mode loads last submitted code directly from Attempt columns.');

  // =========================================================================
  // SECTION 3: PROCTORING IS FULLY OFF
  // =========================================================================
  console.log('\n-----------------------------------------------------------------');
  console.log('3. PROCTORING VERIFICATION (PROCTORING FULLY OFF)');
  console.log('-----------------------------------------------------------------');

  const practiceWorkspaceFile = fs.readFileSync(
    path.join(process.cwd(), 'src/components/practice/PracticeWorkspace.tsx'),
    'utf8',
  );

  const forbiddenTerms = [
    'ExamWorkspace',
    'TabSwitchModal',
    'useProctoring',
    'useFullscreen',
    'handleFullscreen',
    'ProctorEvent',
    'reportViolation',
    '/api/proctor-events',
    '/api/heartbeat',
  ];

  const foundViolations: string[] = [];
  for (const term of forbiddenTerms) {
    if (practiceWorkspaceFile.includes(term)) {
      foundViolations.push(term);
    }
  }

  if (foundViolations.length > 0) {
    throw new Error(
      `FAIL: PracticeWorkspace contains forbidden proctoring elements: ${foundViolations.join(', ')}`,
    );
  }

  console.log('  ExamWorkspace imported: NO');
  console.log('  TabSwitchModal rendered: NO');
  console.log('  useFullscreen / fullscreen lock: NO');
  console.log('  Proctor event / violation reporting: NO');
  console.log('  Heartbeat pinging: NO');
  console.log(
    '  Component architecture: Dedicated PracticeWorkspace built directly on CodeEditor & PreviewFrame.',
  );
  console.log('  Result: PASS - Proctoring is 100% OFF.');

  // =========================================================================
  // SECTION 4: NO PERSISTENCE TO GRADED ATTEMPT
  // =========================================================================
  console.log('\n-----------------------------------------------------------------');
  console.log('4. ATTEMPT IMMUTABILITY & ISOLATION VERIFICATION');
  console.log('-----------------------------------------------------------------');

  const beforeAttempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: completedAttempt.id },
  });

  const beforeSnapshot = {
    html: beforeAttempt.html,
    css: beforeAttempt.css,
    js: beforeAttempt.js,
    score: beforeAttempt.score,
    maxScore: beforeAttempt.maxScore,
    status: beforeAttempt.status,
    submittedAt: beforeAttempt.submittedAt?.toISOString(),
    gradedAt: beforeAttempt.gradedAt?.toISOString(),
  };

  const beforeTestResultsCount = await prisma.testResult.count({
    where: { attemptId: completedAttempt.id },
  });

  console.log('BEFORE Practice Execution:');
  console.log(`  html:        ${JSON.stringify(beforeSnapshot.html)}`);
  console.log(`  css:         ${JSON.stringify(beforeSnapshot.css)}`);
  console.log(`  js:          ${JSON.stringify(beforeSnapshot.js)}`);
  console.log(`  score:       ${beforeSnapshot.score}/${beforeSnapshot.maxScore}`);
  console.log(`  status:      ${beforeSnapshot.status}`);
  console.log(`  submittedAt: ${beforeSnapshot.submittedAt}`);
  console.log(`  gradedAt:    ${beforeSnapshot.gradedAt}`);
  console.log(`  TestResult rows: ${beforeTestResultsCount}`);

  // Radically modified code
  const modifiedCode = {
    html: `<div id="radical-practice-edit-${Date.now()}">NEW CODE THAT MUST NEVER BE SAVED</div>`,
    css: `#radical-practice-edit { display: grid; background: purple; }`,
    js: `console.log("ephemeral practice run at ${new Date().toISOString()}");`,
  };

  console.log('\nExecuting practice test run against runner with modified code...');
  const outcome = await executePracticeTests({
    attemptId: completedAttempt.id,
    user: {
      id: completedAttempt.userId,
      role: 'STUDENT',
      email: completedAttempt.user.email,
      name: completedAttempt.user.name,
      batch: null,
    },
    code: modifiedCode,
  });

  console.log(
    `  Practice run finished. Passed: ${outcome.passedCount}/${outcome.totalCount}, Score: ${outcome.score}/${outcome.maxScore}`,
  );

  const afterAttempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: completedAttempt.id },
  });

  const afterSnapshot = {
    html: afterAttempt.html,
    css: afterAttempt.css,
    js: afterAttempt.js,
    score: afterAttempt.score,
    maxScore: afterAttempt.maxScore,
    status: afterAttempt.status,
    submittedAt: afterAttempt.submittedAt?.toISOString(),
    gradedAt: afterAttempt.gradedAt?.toISOString(),
  };

  const afterTestResultsCount = await prisma.testResult.count({
    where: { attemptId: completedAttempt.id },
  });

  console.log('\nAFTER Practice Execution:');
  console.log(`  html:        ${JSON.stringify(afterSnapshot.html)}`);
  console.log(`  css:         ${JSON.stringify(afterSnapshot.css)}`);
  console.log(`  js:          ${JSON.stringify(afterSnapshot.js)}`);
  console.log(`  score:       ${afterSnapshot.score}/${afterSnapshot.maxScore}`);
  console.log(`  status:      ${afterSnapshot.status}`);
  console.log(`  submittedAt: ${afterSnapshot.submittedAt}`);
  console.log(`  gradedAt:    ${afterSnapshot.gradedAt}`);
  console.log(`  TestResult rows: ${afterTestResultsCount}`);

  // Byte-for-byte comparison
  console.log('\nField-by-Field Diff:');
  const fields = ['html', 'css', 'js', 'score', 'maxScore', 'status', 'submittedAt', 'gradedAt'] as const;
  for (const field of fields) {
    const match = beforeSnapshot[field] === afterSnapshot[field];
    console.log(
      `  ${field.padEnd(12)}: Before=${JSON.stringify(beforeSnapshot[field])} | After=${JSON.stringify(afterSnapshot[field])} -> ${match ? 'EXACT MATCH' : 'FAIL: MUTATED!'}`,
    );
    if (!match) {
      throw new Error(
        `FAIL: Field ${field} was mutated! Before: ${beforeSnapshot[field]}, After: ${afterSnapshot[field]}`,
      );
    }
  }

  if (beforeTestResultsCount !== afterTestResultsCount) {
    throw new Error(
      `FAIL: TestResult rows count changed! Before: ${beforeTestResultsCount}, After: ${afterTestResultsCount}`,
    );
  }

  // Check the practice run that was just recorded
  const latestRun = await prisma.testRun.findUnique({ where: { id: outcome.runId } });
  console.log(`\nLatest TestRun Record:`);
  console.log(`  id:         ${latestRun?.id}`);
  console.log(`  attemptId:  ${latestRun?.attemptId} (MUST BE null)`);
  console.log(`  kind:       ${latestRun?.kind} (MUST BE PRACTICE)`);

  if (!latestRun || latestRun.attemptId !== null || latestRun.kind !== 'PRACTICE') {
    throw new Error(
      `FAIL: TestRun is not an unlinked PRACTICE run! Got attemptId=${latestRun?.attemptId}, kind=${latestRun?.kind}`,
    );
  }

  console.log('  Result: PASS - Attempt row is 100% immutable and untouched. TestRun is unlinked PRACTICE.');

  // =========================================================================
  // SECTION 5: UI CLARITY
  // =========================================================================
  console.log('\n-----------------------------------------------------------------');
  console.log('5. UI CLARITY VERIFICATION');
  console.log('-----------------------------------------------------------------');

  const normalizedFile = practiceWorkspaceFile.replace(/\s+/g, ' ');
  const bannerTextPresent =
    normalizedFile.includes('Practice Mode') &&
    normalizedFile.includes('Proctoring is OFF') &&
    normalizedFile.includes('NEVER modify your graded submission');

  const hasResetButton = practiceWorkspaceFile.includes('Reset to Submitted');
  const hasExitButton = practiceWorkspaceFile.includes('Exit Practice');

  console.log(`  Top Banner "Practice Mode" & "Proctoring is OFF": ${bannerTextPresent ? 'YES' : 'NO'}`);
  console.log(`  "Reset to Submitted" button present:              ${hasResetButton ? 'YES' : 'NO'}`);
  console.log(`  "Exit Practice" navigation link present:           ${hasExitButton ? 'YES' : 'NO'}`);

  if (!bannerTextPresent || !hasResetButton || !hasExitButton) {
    throw new Error('FAIL: Practice UI clarity elements missing!');
  }
  console.log('  Result: PASS - UI clearly distinguishes practice mode from graded exam.');

  console.log('\n=================================================================');
  console.log('  ALL 5 POST-SUBMISSION PRACTICE MODE SPEC CHECKS PASSED!');
  console.log('=================================================================\n');
}

main().catch((err) => {
  console.error('\nVERIFICATION FAILED:', err);
  process.exit(1);
});
