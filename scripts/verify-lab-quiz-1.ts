import { labQuestions } from './create-lab-quiz-1';
import { runOnRunner } from '../src/lib/runner-client';
import type { RunnerSpec } from '../shared/test-spec';

async function verifyAll() {
  console.log('Validating reference solutions for all 5 questions...');
  let failed = 0;

  for (const q of labQuestions) {
    const spec: RunnerSpec = {
      version: 1,
      viewport: { width: 1280, height: 720 },
      tests: q.tests.map((t, idx) => ({
        id: `test-${idx}`,
        name: t.name,
        points: t.points,
        hidden: t.hidden,
        ...t.body,
      })),
    };

    try {
      const outcome = await runOnRunner({
        runId: `verify-${q.slug}`,
        html: q.referenceHtml,
        css: q.referenceCss,
        js: q.referenceJs,
        spec,
      });

      const passedCount = outcome.results.filter((r) => r.passed).length;
      const totalCount = outcome.results.length;

      if (passedCount === totalCount) {
        console.log(`  ✓ ${q.title}: ${passedCount}/${totalCount} tests PASSED`);
      } else {
        console.error(`  ✗ ${q.title}: ONLY ${passedCount}/${totalCount} tests passed`);
        outcome.results
          .filter((r) => !r.passed)
          .forEach((r) => {
            console.error(`    - FAILED: "${r.testName}" -> ${r.message}`);
          });
        failed++;
      }
    } catch (err) {
      console.error(`  ✗ ${q.title}: Execution failed:`, err);
      failed++;
    }
  }

  if (failed > 0) {
    console.error(`\nValidation failed on ${failed} question(s)!`);
    process.exit(1);
  } else {
    console.log('\nAll 5 reference solutions verified and passing 100% of test cases! 🎉');
  }
}

verifyAll();
