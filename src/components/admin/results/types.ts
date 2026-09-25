import type { getSittingResultForAdmin } from '@/server/services/results';

/** The admin drill-down payload (GET /api/admin/results/[sessionId]). */
export type SittingResult = Awaited<ReturnType<typeof getSittingResultForAdmin>>;
export type SittingQuestion = SittingResult['questions'][number];
export type SittingTestCase = SittingQuestion['testCases'][number];
export type OtherSitting = SittingResult['otherSittings'][number];

/** Response of POST /api/admin/attempts/[id]/regrade. */
export interface AttemptRegradeResponse {
  graded: boolean;
  skipped: boolean;
  busy: boolean;
  before: { score: number | null; status: string };
  after: { score: number | null; status: string };
  error: string | null;
}

/** Response of POST /api/admin/exams/[id]/regrade. */
export interface ExamRegradeResponse {
  attempted: number;
  graded: number;
  skipped: number;
  failed: number;
  busy: number;
  /** Set when the per-call cap was reached: pass it back to continue. */
  nextCursor: string | null;
}
