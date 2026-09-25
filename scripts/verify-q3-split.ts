import { PrismaClient } from '@prisma/client';
import { runOnRunner } from '../src/lib/runner-client';
import { compileRunnerSpec } from '../src/server/services/questions';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Step 1: Verify Q3 in Database ===');
  const question = await prisma.question.findUnique({
    where: { slug: 'profile-building' },
    include: {
      tests: { orderBy: { order: 'asc' } },
      _count: { select: { tests: true, examQuestions: true, attempts: true } },
    },
  });

  if (!question) {
    throw new Error('Question "profile-building" not found in database!');
  }

  console.log(`Question: "${question.title}" (slug: ${question.slug})`);
  console.log(`Marks: ${question.marks}`);
  console.log(`Database Test Count: ${question.tests.length}`);
  console.log(`_count.tests (as shown in Admin Questions table): ${question._count.tests}`);

  console.log('\nAll 12 Tests in Database:');
  question.tests.forEach((t, i) => {
    console.log(`  [Test ${i + 1}/12] order=${t.order} | enabled=${t.enabled} | "${t.name}"`);
  });

  if (question.tests.length !== 12) {
    throw new Error(`Expected exactly 12 tests, got ${question.tests.length}`);
  }

  // Build the runner spec from DB tests, exactly as the app does
  const spec = compileRunnerSpec(question.tests);

  const correctHtml = question.referenceHtml || '';
  const correctCss = question.referenceCss || '';

  console.log('\n=== Step 2: Submission 1 - Fully Correct Answer ===');
  console.log('Submitting 100% correct solution matching every requirement...');

  const passRun = await runOnRunner({
    runId: `q3-verify-pass-${Date.now()}`,
    html: correctHtml,
    css: correctCss,
    js: question.referenceJs || '',
    spec,
  });

  console.log(`Run Status: ${passRun.status} (Duration: ${passRun.durationMs}ms)`);
  console.log('Individual Test Results:');
  let passedCount = 0;
  for (const r of passRun.results) {
    const mark = r.passed ? '✓ PASS' : '✗ FAIL';
    if (r.passed) passedCount++;
    console.log(`  ${mark} - "${r.testName}" (${r.durationMs}ms)${r.message ? ` -> ${r.message}` : ''}`);
  }
  console.log(`Result: ${passedCount}/${passRun.results.length} tests passed`);

  if (passedCount !== 12) {
    throw new Error(`Expected all 12 tests to pass, but only ${passedCount} passed!`);
  }

  console.log('\n=== Step 3: Submission 2 - Single Mutation (border-color is #000 instead of #555) ===');
  // Mutate ONLY .profile-image border-color from #555 to #000
  const wrongBorderColorCss = correctCss.replace('border: 2px outset #555;', 'border: 2px outset #000;');

  console.log('Mutated CSS excerpt:');
  console.log(
    '  .profile-image { border: 2px outset #000; }  <-- Deliberately wrong color (#000 instead of #555)',
  );

  const failRun = await runOnRunner({
    runId: `q3-verify-single-fail-${Date.now()}`,
    html: correctHtml,
    css: wrongBorderColorCss,
    js: question.referenceJs || '',
    spec,
  });

  console.log(`Run Status: ${failRun.status} (Duration: ${failRun.durationMs}ms)`);
  console.log('Individual Test Results:');
  let singleFailPassCount = 0;
  const failedTests: string[] = [];

  for (const r of failRun.results) {
    const mark = r.passed ? '✓ PASS' : '✗ FAIL';
    if (r.passed) {
      singleFailPassCount++;
    } else {
      failedTests.push(r.testName);
    }
    console.log(`  ${mark} - "${r.testName}" (${r.durationMs}ms)${r.message ? ` -> ${r.message}` : ''}`);
  }

  console.log(
    `Result: ${singleFailPassCount}/${failRun.results.length} passed, ${failedTests.length} failed`,
  );
  console.log('Failed test(s):', failedTests);

  if (failedTests.length !== 1 || !failedTests[0]?.includes('.profile-image border')) {
    throw new Error(
      `Expected ONLY the .profile-image border test to fail, but failed: ${JSON.stringify(failedTests)}`,
    );
  }

  console.log('\nSUCCESS! Fine-grained test suite isolated the single failure exactly as expected!');
}

main()
  .catch((e) => {
    console.error('Fatal verification error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
