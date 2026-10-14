/**
 * Client-side shapes for the question authoring UI.
 *
 * These mirror the JSON the question API returns (dates as ISO strings) and
 * are deliberately declared here rather than imported from server modules so
 * the editor does not depend on Prisma types.
 */

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type QuestionStatus = 'DRAFT' | 'VALIDATED' | 'PUBLISHED' | 'ARCHIVED';
export type ValidationState = 'NOT_VALIDATED' | 'PASSED' | 'FAILED';

export const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
];

export const QUESTION_STATUSES: QuestionStatus[] = ['DRAFT', 'VALIDATED', 'PUBLISHED', 'ARCHIVED'];

/** A stored test case, as GET /api/questions/[id] returns it. */
export interface AdminQuestionTest {
  id: string;
  name: string;
  description: string | null;
  testCode: string;
  expectedBehavior: string | null;
  order: number;
  enabled: boolean;
  hidden?: boolean;
}

/** The full question the editor works on (GET / PATCH /api/questions/[id]). */
export interface AdminQuestion {
  id: string;
  title: string;
  slug: string;
  description: string;
  instructions: string | null;
  constraints: string | null;
  expectedBehavior: string | null;
  category: string | null;
  marks: number;
  suggestedMinutes: number | null;
  starterHtml: string;
  starterCss: string;
  starterJs: string;
  referenceHtml: string | null;
  referenceCss: string | null;
  referenceJs: string | null;
  mediaUrl: string | null;
  difficulty: Difficulty;
  tags: string[];
  status: QuestionStatus;
  version: number;
  validation: ValidationState;
  validatedAt: string | null;
  validationMessage: string | null;
  updatedAt: string | null;
  blockers: string[];
  tests: AdminQuestionTest[];
}

/** Editable question fields. Everything is a string so inputs stay controlled. */
export interface QuestionDraft {
  title: string;
  slug: string;
  difficulty: Difficulty;
  category: string;
  tags: string[];
  marks: string;
  suggestedMinutes: string;
  description: string;
  instructions: string;
  constraints: string;
  expectedBehavior: string;
  mediaUrl: string;
  starterHtml: string;
  starterCss: string;
  starterJs: string;
  referenceHtml: string;
  referenceCss: string;
  referenceJs: string;
}

/** A test case being edited. `testCode` (the DSL JSON) is the source of truth. */
export interface DraftTest {
  /** Stable React key; survives saves so open panels stay open. */
  _key: string;
  id?: string;
  name: string;
  description: string;
  expectedBehavior: string;
  testCode: string;
  enabled: boolean;
  hidden?: boolean;
}

/** One test's verdict from "Validate Question". */
export interface ValidationTestResult {
  testName: string;
  passed: boolean;
  message?: string;
  expected?: string;
  actual?: string;
  durationMs: number;
}

/** POST /api/questions/[id]/validate. */
export interface ValidationRun {
  ok: boolean;
  runId: string;
  results: ValidationTestResult[];
  passedCount: number;
  totalCount: number;
  durationMs: number;
  consoleLogs: string[];
  status: QuestionStatus;
}

/** A row of GET /api/questions (and the listQuestions service). */
export interface QuestionListItem {
  id: string;
  title: string;
  slug: string;
  difficulty: Difficulty;
  category: string | null;
  tags: string[];
  marks: number;
  status: QuestionStatus;
  version: number;
  validation: ValidationState;
  validatedAt: string | null;
  updatedAt: string;
  enabledTests: number;
  usedInTests: number;
}

export type WizardStepId = 'basic' | 'problem' | 'code' | 'tests' | 'validate' | 'preview' | 'publish';

export const WIZARD_STEPS: { id: WizardStepId; label: string; needsSavedQuestion: boolean }[] = [
  { id: 'basic', label: 'Basic information', needsSavedQuestion: false },
  { id: 'problem', label: 'Problem', needsSavedQuestion: false },
  { id: 'code', label: 'Starter code', needsSavedQuestion: false },
  { id: 'tests', label: 'Test cases', needsSavedQuestion: false },
  { id: 'validate', label: 'Validation', needsSavedQuestion: true },
  { id: 'preview', label: 'Preview', needsSavedQuestion: false },
  { id: 'publish', label: 'Publish', needsSavedQuestion: true },
];

export function isWizardStep(value: unknown): value is WizardStepId {
  return typeof value === 'string' && WIZARD_STEPS.some((s) => s.id === value);
}
