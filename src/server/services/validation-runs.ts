import { prisma } from '@/lib/prisma';
import { badRequest, notFound } from '@/lib/http';
import { runOnRunner, RunnerError, runnerErrorMessage } from '@/lib/runner-client';
import { sanitizeError } from '@/lib/logger';
import { compileRunnerSpec } from './questions';

export interface QuestionValidationResult {
  ok: boolean;
  runId: string;
  results: { testName: string; passed: boolean; message?: string; durationMs: number; points: number }[];
  passedCount: number;
  totalCount: number;
  durationMs: number;
  consoleLogs: string[];
  error?: string;
}

/**
 * "Validate Question" (product requirements #27/#28/#46): run the full suite
 * against the reference solution. Every test must pass, otherwise the question
 * cannot be published. This is the self-checking loop for question authors.
 */
export async function validateQuestion(
  questionId: string,
  override?: { html?: string; css?: string; js?: string; useReference?: boolean },
): Promise<QuestionValidationResult> {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { tests: { orderBy: { order: 'asc' } } },
  });
  if (!question) throw notFound('Question not found.');
  if (question.tests.length === 0) throw badRequest('Add at least one test case before validating.');

  const useReference = override?.useReference !== false;
  const html = (useReference ? question.referenceHtml : override?.html) ?? override?.html ?? question.starterHtml;
  const css = (useReference ? question.referenceCss : override?.css) ?? override?.css ?? question.starterCss;
  const js = (useReference ? question.referenceJs : override?.js) ?? override?.js ?? question.starterJs;

  if (useReference && !question.referenceJs && !question.referenceHtml && !question.referenceCss) {
    throw badRequest('Add a reference solution before validating this question.');
  }

  const spec = compileRunnerSpec(question.tests);
  const testRun = await prisma.testRun.create({
    data: {
      questionId,
      kind: 'VALIDATION',
      status: 'RUNNING',
      totalCount: spec.tests.length,
      maxScore: spec.tests.reduce((s, t) => s + t.points, 0),
    },
  });

  const started = Date.now();
  try {
    const result = await runOnRunner({ runId: testRun.id, html, css, js, spec });
    const results = spec.tests.map((t) => {
      const r = result.results.find((x) => x.id === t.id);
      return {
        testName: t.name,
        passed: Boolean(r?.passed),
        message: r?.message,
        durationMs: r?.durationMs ?? 0,
        points: t.points,
      };
    });
    const passedCount = results.filter((r) => r.passed).length;
    const ok = passedCount === results.length && result.status === 'COMPLETED';
    const durationMs = Date.now() - started;

    await prisma.$transaction([
      prisma.testRun.update({
        where: { id: testRun.id },
        data: {
          status: result.status,
          passedCount,
          failedCount: results.length - passedCount,
          durationMs,
          completedAt: new Date(),
          logs: result.consoleLogs.slice(0, 50).join('\n').slice(0, 8000) || null,
          error: result.error?.slice(0, 1000) ?? null,
        },
      }),
      prisma.question.update({
        where: { id: questionId },
        data: {
          validation: ok ? 'PASSED' : 'FAILED',
          validatedAt: new Date(),
          validationMessage: ok
            ? null
            : results
                .filter((r) => !r.passed)
                .map((r) => `${r.testName}: ${r.message ?? 'failed'}`)
                .join(' | ')
                .slice(0, 2000),
        },
      }),
    ]);

    return {
      ok,
      runId: testRun.id,
      results,
      passedCount,
      totalCount: results.length,
      durationMs,
      consoleLogs: result.consoleLogs.slice(0, 50),
      ...(result.error ? { error: result.error } : {}),
    };
  } catch (err) {
    const message = err instanceof RunnerError ? runnerErrorMessage(err.code) : 'Validation run failed.';
    await prisma.$transaction([
      prisma.testRun.update({
        where: { id: testRun.id },
        data: { status: 'FAILED', completedAt: new Date(), error: sanitizeError(err) },
      }),
      prisma.question.update({
        where: { id: questionId },
        data: { validation: 'FAILED', validatedAt: new Date(), validationMessage: message },
      }),
    ]);
    throw badRequest(message);
  }
}
