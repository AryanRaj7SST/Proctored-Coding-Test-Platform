/**
 * Build what a student sees for a question -- the panel text plus every
 * enabled test case in readable form with its equal share of the marks --
 * from the editor's (possibly unsaved) state. Pure, so the preview page can
 * run it on the server too.
 */

import { describeTestCase, validateTestCaseBody } from '@shared/test-spec';
import type { StudentQuestion } from '@/components/exam/QuestionPanel';
import type { ExpectedTest } from '@/components/exam/TestResults';
import { parseMarks } from './marks';

export interface ReadableTest {
  steps: string[];
  checks: string[];
}

/** The test body in words, or null when it is not a valid spec yet. */
export function readableTest(testCode: string): ReadableTest | null {
  const body = validateTestCaseBody(testCode);
  return body.ok && body.value ? describeTestCase(body.value) : null;
}

export interface StudentViewInput {
  id?: string;
  title: string;
  description: string;
  instructions: string | null;
  constraints?: string | null;
  expectedBehavior?: string | null;
  mediaUrl: string | null;
  difficulty: string;
  marks: string | number;
  starterHtml: string;
  starterCss: string;
  starterJs: string;
  tests: {
    key: string;
    name: string;
    description: string | null;
    expectedBehavior: string | null;
    testCode: string;
    enabled: boolean;
  }[];
}

/**
 * Each enabled test's share as the server reports it to students: marks in
 * 1/10,000ths divided by the enabled count, rounded half up (the same rule
 * as the grading engine's testCaseShare), so "7 marks / 3 tests" shows 2.3333.
 */
function studentShare(marks: number, enabledCount: number): number {
  if (enabledCount <= 0) return 0;
  const micro = Math.round(marks * 100) * 100;
  return Math.floor((2 * micro + enabledCount) / (2 * enabledCount)) / 10_000;
}

export function studentTests(input: StudentViewInput): ExpectedTest[] {
  const enabled = input.tests.filter((t) => t.enabled);
  const share = studentShare(parseMarks(input.marks) ?? 0, enabled.length);
  return enabled.map((t) => {
    const readable = readableTest(t.testCode) ?? { steps: [], checks: [] };
    return {
      id: t.key,
      name: t.name.trim() || 'Untitled test case',
      description: t.description?.trim() ? t.description : null,
      expectedBehavior: t.expectedBehavior?.trim() ? t.expectedBehavior : null,
      points: share,
      steps: readable.steps,
      checks: readable.checks,
    };
  });
}

export function buildStudentQuestion(input: StudentViewInput): StudentQuestion {
  return {
    id: input.id ?? 'preview',
    title: input.title.trim() || 'Untitled question',
    description: input.description,
    instructions: input.instructions?.trim() ? input.instructions : null,
    constraints: input.constraints?.trim() ? input.constraints : null,
    expectedBehavior: input.expectedBehavior?.trim() ? input.expectedBehavior : null,
    mediaUrl:
      input.mediaUrl?.trim() && /^https:\/\//.test(input.mediaUrl.trim()) ? input.mediaUrl.trim() : null,
    difficulty: input.difficulty,
    points: parseMarks(input.marks) ?? 0,
    starterHtml: input.starterHtml,
    starterCss: input.starterCss,
    starterJs: input.starterJs,
    tests: studentTests(input),
  };
}
