-- Assessment model: equal-split decimal marks, question lifecycle, test
-- settings (access mode, attempts, pass mark, timezone, result visibility),
-- numbered sittings, pinned question snapshots and email-keyed assignments.
--
-- Purely additive: nothing is dropped. Every new NOT NULL column is added
-- nullable, backfilled from existing data, then constrained. Deprecated
-- columns (questions.points/active, question_tests.points/hidden,
-- exam_questions.pointsOverride) stay until a later cleanup migration.

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'VALIDATED', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "ExamAccessMode" AS ENUM ('ASSIGNED_USERS_ONLY', 'ANY_AUTHENTICATED_USER');
CREATE TYPE "ResultVisibility" AS ENUM ('HIDDEN', 'SCORE_ONLY', 'FULL');
CREATE TYPE "QuestionResultStatus" AS ENUM ('NOT_RUN', 'PASSED', 'PARTIAL', 'FAILED', 'RUNNER_ERROR');
CREATE TYPE "SittingResult" AS ENUM ('PASSED', 'FAILED');

-- ---------------------------------------------------------------- questions
ALTER TABLE "questions"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "constraints" TEXT,
  ADD COLUMN "expectedBehavior" TEXT,
  ADD COLUMN "marks" DECIMAL(8,2) NOT NULL DEFAULT 10,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "suggestedMinutes" INTEGER;

-- Marks keep the old derived total where there was one.
UPDATE "questions" SET "marks" = "points" WHERE "points" > 0;
-- Lifecycle from the old flags: deactivated -> archived, validated -> validated.
UPDATE "questions" SET "status" = 'ARCHIVED' WHERE "active" = false;
UPDATE "questions" SET "status" = 'VALIDATED' WHERE "active" = true AND "validation" = 'PASSED';

ALTER TABLE "question_tests" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

-- -------------------------------------------------------------------- exams
ALTER TABLE "exams"
  ADD COLUMN "accessMode" "ExamAccessMode" NOT NULL DEFAULT 'ASSIGNED_USERS_ONLY',
  ADD COLUMN "instructions" TEXT,
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "passingPercentage" DECIMAL(5,2) NOT NULL DEFAULT 40,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "resultVisibility" "ResultVisibility" NOT NULL DEFAULT 'FULL',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- ACTIVE was a stored status; "active" is now derived from the schedule.
UPDATE "exams" SET "status" = 'PUBLISHED' WHERE "status" = 'ACTIVE';
UPDATE "exams" SET "publishedAt" = "updatedAt" WHERE "status" IN ('PUBLISHED', 'ENDED');

-- Per-test marks: the old override, else the question's marks.
ALTER TABLE "exam_questions"
  ADD COLUMN "marks" DECIMAL(8,2),
  ADD COLUMN "pinnedAt" TIMESTAMP(3),
  ADD COLUMN "questionVersion" INTEGER,
  ADD COLUMN "snapshot" JSONB;
UPDATE "exam_questions" eq
SET "marks" = COALESCE(eq."pointsOverride"::DECIMAL(8,2), q."marks")
FROM "questions" q
WHERE q."id" = eq."questionId";
ALTER TABLE "exam_questions" ALTER COLUMN "marks" SET NOT NULL;

-- -------------------------------------------------------------- assignments
ALTER TABLE "exam_assignments"
  ADD COLUMN "assignedById" TEXT,
  ADD COLUMN "email" TEXT,
  ALTER COLUMN "userId" DROP NOT NULL;
UPDATE "exam_assignments" a SET "email" = u."email" FROM "users" u WHERE u."id" = a."userId";
ALTER TABLE "exam_assignments" ALTER COLUMN "email" SET NOT NULL;

-- ------------------------------------------------------------------ sittings
DROP INDEX "exam_sessions_userId_examId_key";
ALTER TABLE "exam_sessions"
  ADD COLUMN "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "gradedAt" TIMESTAMP(3),
  ADD COLUMN "maxScore" DECIMAL(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN "percentage" DECIMAL(7,4),
  ADD COLUMN "result" "SittingResult",
  ADD COLUMN "score" DECIMAL(12,4);

-- Attempts that somehow have no sitting (only possible for rows created
-- outside the start flow) get a closed one, so every attempt belongs to a sitting.
INSERT INTO "exam_sessions" ("id", "userId", "examId", "startedAt", "lastHeartbeat", "endedAt", "expiresAt", "status")
SELECT 'mig_' || md5(a."userId" || ':' || a."examId"), a."userId", a."examId",
       MIN(a."startedAt"), MIN(a."startedAt"), MAX(COALESCE(a."submittedAt", a."updatedAt")),
       MIN(a."startedAt"), 'SUBMITTED'
FROM "attempts" a
WHERE NOT EXISTS (
  SELECT 1 FROM "exam_sessions" s WHERE s."userId" = a."userId" AND s."examId" = a."examId"
)
GROUP BY a."userId", a."examId";

-- -------------------------------------------------------------------- attempts
DROP INDEX "attempts_userId_examId_questionId_key";
DROP INDEX "attempts_userId_idx";
ALTER TABLE "attempts"
  ADD COLUMN "enabledCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "gradingError" TEXT,
  ADD COLUMN "gradingLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "passedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "resultStatus" "QuestionResultStatus" NOT NULL DEFAULT 'NOT_RUN',
  ADD COLUMN "reviewFeedback" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "sessionId" TEXT,
  ALTER COLUMN "score" SET DATA TYPE DECIMAL(12,4),
  ALTER COLUMN "maxScore" SET DATA TYPE DECIMAL(12,4);

-- Before this migration a student had exactly one sitting per test.
UPDATE "attempts" a SET "sessionId" = s."id"
FROM "exam_sessions" s
WHERE s."userId" = a."userId" AND s."examId" = a."examId";
ALTER TABLE "attempts" ALTER COLUMN "sessionId" SET NOT NULL;

-- Reviewer feedback moves out of the snapshot JSON into real columns.
UPDATE "attempts"
SET "reviewFeedback" = "snapshot"->'manualReview'->>'feedback',
    "reviewedAt" = NULLIF("snapshot"->'manualReview'->>'reviewedAt', '')::TIMESTAMP(3),
    "reviewedById" = NULLIF("snapshot"->'manualReview'->>'reviewerId', '')
WHERE "snapshot" ? 'manualReview' AND COALESCE("snapshot"->'manualReview'->>'feedback', '') <> '';
UPDATE "attempts" SET "snapshot" = "snapshot" - 'manualReview' WHERE "snapshot" ? 'manualReview';

-- Question result status and counts for attempts that were already graded.
UPDATE "attempts" a
SET "passedCount" = r.passed, "enabledCount" = r.total,
    "resultStatus" = (CASE
      WHEN r.total > 0 AND r.passed = r.total THEN 'PASSED'
      WHEN r.passed > 0 THEN 'PARTIAL'
      ELSE 'FAILED'
    END)::"QuestionResultStatus"
FROM (
  SELECT "attemptId", COUNT(*) FILTER (WHERE "passed") AS passed, COUNT(*) AS total
  FROM "test_results" WHERE "final" = true GROUP BY "attemptId"
) r
WHERE r."attemptId" = a."id" AND a."gradedAt" IS NOT NULL;

-- Sitting totals: maximum from the test's marks; score/result only where
-- every attempt in the sitting is graded (a pending attempt is never a 0).
UPDATE "exam_sessions" s
SET "maxScore" = m.total
FROM (SELECT "examId", SUM("marks") AS total FROM "exam_questions" GROUP BY "examId") m
WHERE m."examId" = s."examId";

UPDATE "exam_sessions" s
SET "score" = t.score,
    "percentage" = CASE WHEN s."maxScore" > 0 THEN ROUND(t.score / s."maxScore" * 100, 4) ELSE 0 END,
    "result" = (CASE WHEN t.score * 100 >= e."passingPercentage" * s."maxScore" THEN 'PASSED' ELSE 'FAILED' END)::"SittingResult",
    "gradedAt" = t.graded_at
FROM (
  SELECT "sessionId", SUM("score") AS score, MAX("gradedAt") AS graded_at,
         BOOL_AND("status" <> 'IN_PROGRESS' AND "gradedAt" IS NOT NULL) AS all_graded
  FROM "attempts" GROUP BY "sessionId"
) t, "exams" e
WHERE t."sessionId" = s."id" AND e."id" = s."examId" AND s."endedAt" IS NOT NULL AND t.all_graded;

-- ------------------------------------------------------------ proctor events
ALTER TABLE "proctor_events" ADD COLUMN "sessionId" TEXT;
UPDATE "proctor_events" p SET "sessionId" = s."id"
FROM "exam_sessions" s
WHERE s."userId" = p."userId" AND s."examId" = p."examId";

-- ------------------------------------------------------------ results / runs
ALTER TABLE "test_results"
  ADD COLUMN "actual" TEXT,
  ADD COLUMN "expected" TEXT,
  ALTER COLUMN "points" SET DATA TYPE DECIMAL(12,4),
  ALTER COLUMN "pointsAwarded" SET DATA TYPE DECIMAL(12,4);

ALTER TABLE "test_runs"
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "triggeredById" TEXT,
  ALTER COLUMN "score" SET DATA TYPE DECIMAL(12,4),
  ALTER COLUMN "maxScore" SET DATA TYPE DECIMAL(12,4);

-- ------------------------------------------------------------------ indexes
CREATE INDEX "attempts_userId_examId_idx" ON "attempts"("userId", "examId");
CREATE INDEX "attempts_status_gradedAt_idx" ON "attempts"("status", "gradedAt");
CREATE UNIQUE INDEX "attempts_sessionId_questionId_key" ON "attempts"("sessionId", "questionId");
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "exam_assignments_email_idx" ON "exam_assignments"("email");
CREATE UNIQUE INDEX "exam_assignments_examId_email_key" ON "exam_assignments"("examId", "email");
CREATE INDEX "exam_sessions_userId_examId_idx" ON "exam_sessions"("userId", "examId");
CREATE UNIQUE INDEX "exam_sessions_userId_examId_attemptNumber_key" ON "exam_sessions"("userId", "examId", "attemptNumber");
CREATE INDEX "exams_accessMode_idx" ON "exams"("accessMode");
CREATE INDEX "proctor_events_sessionId_violation_idx" ON "proctor_events"("sessionId", "violation");
CREATE INDEX "questions_status_idx" ON "questions"("status");
CREATE INDEX "questions_category_idx" ON "questions"("category");

-- -------------------------------------------------------------- foreign keys
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proctor_events" ADD CONSTRAINT "proctor_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
