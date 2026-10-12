import type { QuestionStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AppError, badRequest, conflict, notFound } from '@/lib/errors';
import { logger, sanitizeError } from '@/lib/logger';
import { runOnRunner } from '@/lib/runner-client';
import {
  adminRunnerHint,
  outcomeFromError,
  outcomeFromResult,
  type RunnerOutcome,
} from '@/server/grading/runner-result';
import { validateTestSuiteShape } from '@shared/test-spec';
import { compileRunnerSpec, isEnabled } from './questions';

export interface ValidationTestResult {
  testName: string;
  passed: boolean;
  message?: string;
  expected?: string;
  actual?: string;
  durationMs: number;
}

export interface QuestionValidationResult {
  ok: boolean;
  runId: string;
  results: ValidationTestResult[];
  passedCount: number;
  totalCount: number;
  durationMs: number;
  consoleLogs: string[];
  status: QuestionStatus;
}

/**
 * "Validate Question": run every enabled test case against the reference
 * solution. All must pass before the question can be published; the admin
 * gets per-test results (message, expected, actual) to debug a failing test.
 *
 * A runner failure proves nothing about the question: it throws a 503 and
 * leaves the question's validation state untouched.
 */
export async function validateQuestion(questionId: string): Promise<QuestionValidationResult> {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { tests: { orderBy: { order: 'asc' } } },
  });
  if (!question) throw notFound('Question not found.');
  if (question.status === 'ARCHIVED') throw conflict('Restore this question before validating it.');
  const shape = validateTestSuiteShape(question.tests);
  if (!shape.ok) throw badRequest(shape.errors[0] ?? 'Fix the test cases before validating.');
  const enabled = question.tests.filter(isEnabled);
  if (!question.referenceHtml && !question.referenceCss && !question.referenceJs) {
    throw badRequest('Add a reference solution before validating this question.');
  }

  const spec = compileRunnerSpec(enabled);
  const testRun = await prisma.testRun.create({
    data: {
      questionId,
      kind: 'VALIDATION',
      status: 'RUNNING',
      totalCount: spec.tests.length,
      reason: 'validation',
    },
  });

  const started = Date.now();
  let outcome: RunnerOutcome;
  try {
    const raw = await runOnRunner({
      runId: testRun.id,
      html: question.referenceHtml ?? '',
      css: question.referenceCss ?? '',
      js: question.referenceJs ?? '',
      spec,
    });
    outcome = outcomeFromResult(
      raw,
      spec.tests.map((t) => t.id),
    );
  } catch (err) {
    outcome = outcomeFromError(err);
  }
  const durationMs = Date.now() - started;
  const logs = outcome.consoleLogs.slice(0, 50);

  if (outcome.kind !== 'SUCCESS') {
    await prisma.testRun.update({
      where: { id: testRun.id },
      data: {
        status: outcome.kind === 'TIMEOUT' ? 'TIMEOUT' : 'FAILED',
        completedAt: new Date(),
        durationMs,
        error: sanitizeError(`${outcome.kind}: ${outcome.detail}`),
      },
    });
    logger.warn('validation.runner_failed', { questionId, kind: outcome.kind });
    // Validation is admin-only, so the message says what to fix, not just that it failed.
    throw new AppError(
      503,
      `Validation could not run: ${outcome.message} ${adminRunnerHint(outcome)}`,
      outcome.code,
    );
  }

  const verdicts = outcome.verdicts;
  const results: ValidationTestResult[] = spec.tests.map((t) => {
    const v = verdicts?.get(t.id);
    return {
      testName: t.name,
      passed: v ? v.passed : false,
      message: v ? v.message : 'No verdict returned from runner',
      expected: v?.expected,
      actual: v?.actual,
      durationMs: v?.durationMs ?? 0,
    };
  });
  const passedCount = results.filter((r) => r.passed).length;
  const ok = passedCount === results.length;
  // A passing run validates a draft; a failing one sends a validated or
  // published question back to DRAFT (tests that pinned it are unaffected).
  const status: QuestionStatus = ok ? (question.status === 'DRAFT' ? 'VALIDATED' : question.status) : 'DRAFT';

  await prisma.$transaction(
    async (tx) => {
      await tx.testRun.update({
        where: { id: testRun.id },
        data: {
          status: 'COMPLETED',
          passedCount,
          failedCount: results.length - passedCount,
          durationMs,
          completedAt: new Date(),
          logs: logs.join('\n').slice(0, 8000) || null,
        },
      });
      await tx.question.update({
        where: { id: questionId },
        data: {
          validation: ok ? 'PASSED' : 'FAILED',
          validatedAt: new Date(),
          status,
          validationMessage: ok
            ? null
            : results
                .filter((r) => !r.passed)
                .map((r) => `${r.testName}: ${r.message ?? 'failed'}`)
                .join(' | ')
                .slice(0, 2000),
        },
      });
    },
    {
      maxWait: 15000,
      timeout: 30000,
    },
  );

  return {
    ok,
    runId: testRun.id,
    results,
    passedCount,
    totalCount: results.length,
    durationMs,
    consoleLogs: logs,
    status,
  };
}
