/**
 * Client-side shapes of the test-builder API ("tests" are `exams` in code and
 * URLs). These mirror the JSON the routes under /api/exams return, so server
 * pages serialise service results to exactly these types.
 */

export type TestStatus = 'DRAFT' | 'PUBLISHED' | 'ENDED' | 'ARCHIVED';
export type TestPhase = 'DRAFT' | 'UPCOMING' | 'ACTIVE' | 'ENDED' | 'ARCHIVED';
export type AccessMode = 'ASSIGNED_USERS_ONLY' | 'ANY_AUTHENTICATED_USER';
export type ResultVisibility = 'HIDDEN' | 'SCORE_ONLY' | 'FULL';
export type LeaderboardMode = 'LIVE' | 'AFTER_END' | 'HIDDEN';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type QuestionStatus = 'DRAFT' | 'VALIDATED' | 'PUBLISHED' | 'ARCHIVED';
export type StatusAction = 'publish' | 'unpublish' | 'close' | 'archive' | 'unarchive';

/** GET /api/exams (admin) row. */
export interface TestListItem {
  id: string;
  title: string;
  description: string | null;
  status: TestStatus;
  phase: TestPhase;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  durationMinutes: number;
  accessMode: AccessMode;
  maxAttempts: number;
  passingPercentage: number;
  resultVisibility: ResultVisibility;
  questionCount: number;
  totalMarks: number;
  assignedCount: number;
  sittingCount: number;
  publishedAt: string | null;
}

export interface TestListResponse {
  items: TestListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** One question inside a test (GET /api/exams/[id]). */
export interface TestQuestionDto {
  questionId: string;
  order: number;
  marks: number;
  pinnedVersion: number | null;
  pinnedAt: string | null;
  title: string;
  slug: string;
  difficulty: Difficulty;
  category: string | null;
  tags: string[];
  status: QuestionStatus;
  currentVersion: number;
  defaultMarks: number;
  enabledTests: number;
}

/** GET/PATCH /api/exams/[id] and POST /api/exams/[id]/status. */
export interface TestDetail {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  batch: string | null;
  status: TestStatus;
  phase: TestPhase;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  durationMinutes: number;
  accessMode: AccessMode;
  maxAttempts: number;
  passingPercentage: number;
  resultVisibility: ResultVisibility;
  maxViolations: number;
  shuffleQuestions: boolean;
  leaderboardMode?: LeaderboardMode;
  wrongTryPenaltySeconds?: number;
  leaderboardFrozenAt?: string | null;
  mandatory?: boolean;
  notesMd?: string | null;
  instructorInfoMd?: string | null;
  resultsPublishedAt?: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sittingCount: number;
  locked: boolean;
  totalMarks: number;
  questions: TestQuestionDto[];
  blockers: string[];
}

/** GET /api/questions item (the question picker). */
export interface QuestionBankItem {
  id: string;
  title: string;
  slug: string;
  difficulty: Difficulty;
  category: string | null;
  tags: string[];
  marks: number;
  status: QuestionStatus;
  version: number;
  enabledTests: number;
  usedInTests: number;
}

export interface QuestionBankResponse {
  items: QuestionBankItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type AttemptState = 'NOT_STARTED' | 'IN_PROGRESS' | 'GRADING_PENDING' | 'SUBMITTED';

/** GET /api/exams/[id]/assignments row. */
export interface AssignmentRow {
  id: string;
  email: string;
  userId: string | null;
  name: string | null;
  batch: string | null;
  signedIn: boolean;
  assignmentStatus: string;
  attemptState: AttemptState;
  attemptsUsed: number;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  result: 'PASSED' | 'FAILED' | null;
  bestSessionId: string | null;
  allowClipboard: boolean;
  /** An administrator revoked this student's access to this test. */
  revoked: boolean;
  revokedAt: string | null;
  assignedAt: string;
}

export interface AssignResult {
  assigned: number;
  alreadyAssigned: number;
  /** Emails of administrator or deactivated accounts, not assigned. */
  notAssignable: string[];
}

/** GET /api/users item (subset used by the student picker). */
export interface UserOption {
  id: string;
  email: string;
  name: string | null;
  role: 'STUDENT' | 'ADMIN';
  batch: string | null;
  active: boolean;
}

/** The test fields the assignments view needs. */
export interface AssignmentsTestInfo {
  id: string;
  title: string;
  status: TestStatus;
  phase: TestPhase;
  accessMode: AccessMode;
  maxAttempts: number;
  timezone: string;
  batch: string | null;
}
