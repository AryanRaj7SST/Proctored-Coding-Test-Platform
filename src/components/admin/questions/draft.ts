/**
 * Pure helpers for the question editor: server <-> form conversions, the
 * request payload, UX-only validation and change detection. No React here so
 * server components (edit page, preview page) can use the same conversions.
 *
 * Client-side checks only give fast feedback; the server re-validates
 * everything and its answer always wins.
 */

import { validateTestCaseBody, SPEC_LIMITS } from '@shared/test-spec';
import { MARKS_RULE, parseMarks } from './marks';
import type { TestTemplate } from './test-templates';
import { BLANK_BODY } from './test-templates';
import type {
  AdminQuestion,
  AdminQuestionTest,
  Difficulty,
  DraftTest,
  QuestionDraft,
  QuestionStatus,
  ValidationState,
  WizardStepId,
} from './types';

/* ------------------------------------------------------------------ */
/* Normalising server data                                             */
/* ------------------------------------------------------------------ */

type Loose = Record<string, unknown>;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const dateOrNull = (v: unknown): string | null =>
  v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : null;
const numberOr = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const DIFFICULTY_VALUES: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];
const STATUS_VALUES: QuestionStatus[] = ['DRAFT', 'VALIDATED', 'PUBLISHED', 'ARCHIVED'];
const VALIDATION_VALUES: ValidationState[] = ['NOT_VALIDATED', 'PASSED', 'FAILED'];

function oneOf<T extends string>(v: unknown, values: T[], fallback: T): T {
  return values.includes(v as T) ? (v as T) : fallback;
}

/**
 * Accepts the question as the API returns it (JSON) or as the service returns
 * it server-side (Dates, possibly Decimal marks) and produces the editor shape.
 */
export function normalizeQuestion(input: object): AdminQuestion {
  const q = input as Loose;
  const tests = Array.isArray(q.tests) ? (q.tests as Loose[]) : [];
  return {
    id: str(q.id),
    title: str(q.title),
    slug: str(q.slug),
    description: str(q.description),
    instructions: strOrNull(q.instructions),
    constraints: strOrNull(q.constraints),
    expectedBehavior: strOrNull(q.expectedBehavior),
    category: strOrNull(q.category),
    marks: numberOr(q.marks, 10),
    suggestedMinutes: q.suggestedMinutes == null ? null : numberOr(q.suggestedMinutes, 0) || null,
    starterHtml: str(q.starterHtml),
    starterCss: str(q.starterCss),
    starterJs: str(q.starterJs),
    referenceHtml: strOrNull(q.referenceHtml),
    referenceCss: strOrNull(q.referenceCss),
    referenceJs: strOrNull(q.referenceJs),
    mediaUrl: strOrNull(q.mediaUrl),
    difficulty: oneOf(q.difficulty, DIFFICULTY_VALUES, 'EASY'),
    tags: Array.isArray(q.tags) ? q.tags.filter((t): t is string => typeof t === 'string') : [],
    status: oneOf(q.status, STATUS_VALUES, 'DRAFT'),
    version: numberOr(q.version, 1),
    validation: oneOf(q.validation, VALIDATION_VALUES, 'NOT_VALIDATED'),
    validatedAt: dateOrNull(q.validatedAt),
    validationMessage: strOrNull(q.validationMessage),
    updatedAt: dateOrNull(q.updatedAt),
    blockers: Array.isArray(q.blockers) ? q.blockers.filter((b): b is string => typeof b === 'string') : [],
    tests: tests
      .map((t, i): AdminQuestionTest => ({
        id: str(t.id),
        name: str(t.name),
        description: strOrNull(t.description),
        testCode: str(t.testCode),
        expectedBehavior: strOrNull(t.expectedBehavior),
        order: numberOr(t.order, i),
        enabled: t.enabled !== false,
        hidden: Boolean(t.hidden),
      }))
      .sort((a, b) => a.order - b.order),
  };
}

/* ------------------------------------------------------------------ */
/* Form state                                                          */
/* ------------------------------------------------------------------ */

export function emptyDraft(): QuestionDraft {
  return {
    title: '',
    slug: '',
    difficulty: 'EASY',
    category: '',
    tags: [],
    marks: '10',
    suggestedMinutes: '',
    description: '',
    instructions: '',
    constraints: '',
    expectedBehavior: '',
    mediaUrl: '',
    starterHtml: '',
    starterCss: '',
    starterJs: '',
    referenceHtml: '',
    referenceCss: '',
    referenceJs: '',
  };
}

export function draftFromQuestion(q: AdminQuestion): QuestionDraft {
  return {
    title: q.title,
    slug: q.slug,
    difficulty: q.difficulty,
    category: q.category ?? '',
    tags: q.tags,
    marks: String(q.marks),
    suggestedMinutes: q.suggestedMinutes ? String(q.suggestedMinutes) : '',
    description: q.description,
    instructions: q.instructions ?? '',
    constraints: q.constraints ?? '',
    expectedBehavior: q.expectedBehavior ?? '',
    mediaUrl: q.mediaUrl ?? '',
    starterHtml: q.starterHtml,
    starterCss: q.starterCss,
    starterJs: q.starterJs,
    referenceHtml: q.referenceHtml ?? '',
    referenceCss: q.referenceCss ?? '',
    referenceJs: q.referenceJs ?? '',
  };
}

/**
 * Stored tests as editable drafts. When `previous` is given (after a save),
 * a test keeps its React key if it sits at the same position with the same
 * name, so panels the admin had open stay open.
 */
export function testsFromQuestion(q: AdminQuestion, previous?: DraftTest[]): DraftTest[] {
  return q.tests.map((t, i) => {
    const before = previous?.[i];
    const key = before && before.name.trim() === t.name ? before._key : t.id;
    return {
      _key: key,
      id: t.id,
      name: t.name,
      description: t.description ?? '',
      expectedBehavior: t.expectedBehavior ?? '',
      testCode: t.testCode,
      enabled: t.enabled,
      hidden: Boolean(t.hidden),
    };
  });
}

let keyCounter = 0;
export function newKey(): string {
  keyCounter += 1;
  return `new-${keyCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/** "Name", "Name (2)", "Name (3)" ... unique case-insensitively among `existing`. */
export function uniqueName(base: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  const root = base.trim() || 'Test case';
  if (!taken.has(root.toLowerCase())) return root;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${root} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${root} (${Date.now().toString(36)})`;
}

export function newTest(template: TestTemplate | null, existingNames: string[]): DraftTest {
  return {
    _key: newKey(),
    name: uniqueName(template?.name ?? `Test case ${existingNames.length + 1}`, existingNames),
    description: '',
    expectedBehavior: template?.expectedBehavior ?? '',
    testCode: JSON.stringify(template?.body ?? BLANK_BODY, null, 2),
    enabled: true,
    hidden: false,
  };
}

export function duplicateTest(test: DraftTest, existingNames: string[]): DraftTest {
  return {
    ...test,
    _key: newKey(),
    id: undefined,
    name: uniqueName(`${test.name.trim() || 'Test case'} (copy)`, existingNames),
    hidden: test.hidden ?? false,
  };
}

/* ------------------------------------------------------------------ */
/* Payload                                                             */
/* ------------------------------------------------------------------ */

export interface TestPayload {
  id?: string;
  name: string;
  description: string | null;
  testType: 'DECLARATIVE';
  testCode: string;
  expectedBehavior: string | null;
  order: number;
  enabled: boolean;
  hidden: boolean;
}

export function testsPayload(tests: DraftTest[]): TestPayload[] {
  return tests.map((t, i) => ({
    ...(t.id ? { id: t.id } : {}),
    name: t.name.trim(),
    description: t.description.trim() ? t.description : null,
    testType: 'DECLARATIVE',
    testCode: t.testCode,
    expectedBehavior: t.expectedBehavior.trim() ? t.expectedBehavior : null,
    order: i,
    enabled: t.enabled,
    hidden: Boolean(t.hidden),
  }));
}

/** Body for POST /api/questions and PATCH /api/questions/[id]. */
export function buildPayload(draft: QuestionDraft, tests: DraftTest[] | null) {
  const minutes = draft.suggestedMinutes.trim();
  return {
    title: draft.title.trim(),
    ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}),
    description: draft.description,
    instructions: draft.instructions.trim() ? draft.instructions : null,
    constraints: draft.constraints.trim() ? draft.constraints : null,
    expectedBehavior: draft.expectedBehavior.trim() ? draft.expectedBehavior : null,
    category: draft.category.trim() || null,
    marks: draft.marks.trim(),
    suggestedMinutes: minutes ? Number(minutes) : null,
    starterHtml: draft.starterHtml,
    starterCss: draft.starterCss,
    starterJs: draft.starterJs,
    referenceHtml: draft.referenceHtml || null,
    referenceCss: draft.referenceCss || null,
    referenceJs: draft.referenceJs || null,
    mediaUrl: draft.mediaUrl.trim() || null,
    difficulty: draft.difficulty,
    tags: draft.tags,
    ...(tests ? { tests: testsPayload(tests) } : {}),
  };
}

export function hasReference(draft: QuestionDraft): boolean {
  return Boolean(draft.referenceHtml || draft.referenceCss || draft.referenceJs);
}

/* ------------------------------------------------------------------ */
/* UX validation                                                       */
/* ------------------------------------------------------------------ */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || 'question'
  );
}

/** Field errors keyed like the server's `details` (title, marks, mediaUrl, ...). */
export function fieldErrors(draft: QuestionDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const title = draft.title.trim();
  if (title.length < 3) errors.title = 'Title must be at least 3 characters.';
  else if (title.length > 160) errors.title = 'Title must be at most 160 characters.';

  const slug = draft.slug.trim();
  if (slug && (!SLUG_PATTERN.test(slug) || slug.length < 2 || slug.length > 80)) {
    errors.slug = 'Slug must be 2-80 lowercase letters or digits separated by hyphens.';
  }
  if (draft.category.trim().length > 60) errors.category = 'Category must be at most 60 characters.';
  if (parseMarks(draft.marks) === null) errors.marks = MARKS_RULE;

  const minutes = draft.suggestedMinutes.trim();
  if (minutes && (!/^\d+$/.test(minutes) || Number(minutes) < 1 || Number(minutes) > 600)) {
    errors.suggestedMinutes = 'Suggested time must be a whole number of minutes between 1 and 600.';
  }
  if (draft.tags.length > 12) errors.tags = 'Use at most 12 tags.';
  if (draft.tags.some((t) => t.length > 30)) errors.tags = 'Each tag must be at most 30 characters.';

  if (!draft.description.trim()) errors.description = 'Description is required.';
  else if (draft.description.length > 20_000) errors.description = 'Description is too long (20,000 max).';
  if (draft.instructions.length > 20_000) errors.instructions = 'Instructions are too long (20,000 max).';
  if (draft.constraints.length > 5000) errors.constraints = 'Constraints are too long (5,000 max).';
  if (draft.expectedBehavior.length > 5000) {
    errors.expectedBehavior = 'Expected behaviour is too long (5,000 max).';
  }
  const media = draft.mediaUrl.trim();
  if (media && !/^https:\/\//.test(media)) errors.mediaUrl = 'Media URL must be an https:// link.';
  else if (media.length > 500) errors.mediaUrl = 'Media URL must be at most 500 characters.';
  return errors;
}

/** Problems with one test case (name, uniqueness, DSL body). Empty when it is fine. */
export function testProblems(test: DraftTest, all: DraftTest[]): string[] {
  const problems: string[] = [];
  const name = test.name.trim();
  if (!name) problems.push('Name is required.');
  else if (name.length > 140) problems.push('Name must be at most 140 characters.');
  else if (all.some((o) => o._key !== test._key && o.name.trim().toLowerCase() === name.toLowerCase())) {
    problems.push(`Another test case is already called "${name}".`);
  }
  if (test.description.length > 2000) problems.push('Description must be at most 2,000 characters.');
  if (test.expectedBehavior.length > 2000)
    problems.push('Expected behaviour must be at most 2,000 characters.');
  if (test.testCode.length > 20_000) problems.push('The test body is too large.');
  const body = validateTestCaseBody(test.testCode);
  if (!body.ok) problems.push(...body.errors);
  return problems;
}

/** Problems with the suite as a whole (mirrors the server's suite rules). */
export function suiteProblems(tests: DraftTest[]): string[] {
  const problems: string[] = [];
  if (tests.length > SPEC_LIMITS.maxTests) {
    problems.push(`A question can have at most ${SPEC_LIMITS.maxTests} test cases.`);
  }
  if (tests.length > 0 && !tests.some((t) => t.enabled)) {
    problems.push('Enable at least one test case: disabled test cases are not run or counted.');
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* Change detection                                                    */
/* ------------------------------------------------------------------ */

const nullable = (v: string) => v || null;

function comparableTests(tests: DraftTest[]) {
  return JSON.stringify(testsPayload(tests).map(({ id: _id, ...rest }) => rest));
}

/** Did the test cases change (content, order, enabled) compared with the saved ones? */
export function testsDiffer(tests: DraftTest[], savedTests: DraftTest[]): boolean {
  return comparableTests(tests) !== comparableTests(savedTests);
}

/**
 * Would saving reset validation (and send a VALIDATED / PUBLISHED question back
 * to DRAFT)? Mirrors the server's change rules: description, starter code,
 * reference solution and tests are grading-relevant; titles, tags, marks and
 * the other student text are not.
 */
export function resetsValidation(
  draft: QuestionDraft,
  tests: DraftTest[],
  saved: QuestionDraft,
  savedTests: DraftTest[],
): boolean {
  return (
    draft.description !== saved.description ||
    draft.starterHtml !== saved.starterHtml ||
    draft.starterCss !== saved.starterCss ||
    draft.starterJs !== saved.starterJs ||
    nullable(draft.referenceHtml) !== nullable(saved.referenceHtml) ||
    nullable(draft.referenceCss) !== nullable(saved.referenceCss) ||
    nullable(draft.referenceJs) !== nullable(saved.referenceJs) ||
    testsDiffer(tests, savedTests)
  );
}

/* ------------------------------------------------------------------ */
/* Error key -> wizard step                                            */
/* ------------------------------------------------------------------ */

const STEP_OF_FIELD: Record<string, WizardStepId> = {
  title: 'basic',
  slug: 'basic',
  difficulty: 'basic',
  category: 'basic',
  tags: 'basic',
  marks: 'basic',
  suggestedMinutes: 'basic',
  description: 'problem',
  instructions: 'problem',
  constraints: 'problem',
  expectedBehavior: 'problem',
  mediaUrl: 'problem',
  starterHtml: 'code',
  starterCss: 'code',
  starterJs: 'code',
  referenceHtml: 'code',
  referenceCss: 'code',
  referenceJs: 'code',
  tests: 'tests',
};

/** Which step shows the field an error key refers to ("tests.2.name" -> tests). */
export function stepOfErrorKey(key: string): WizardStepId | null {
  return STEP_OF_FIELD[key.split('.')[0] ?? ''] ?? null;
}

/** Server `details` for one test ("tests.3.name" -> { name: ... }). */
export function testServerErrors(details: Record<string, string>, index: number): string[] {
  const prefix = `tests.${index}.`;
  return Object.entries(details)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, message]) => `${key.slice(prefix.length)}: ${message}`);
}
