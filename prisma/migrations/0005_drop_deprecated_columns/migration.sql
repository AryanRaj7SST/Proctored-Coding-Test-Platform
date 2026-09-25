-- Remove what 0004 deprecated, now that no code reads it:
--   * per-test points and the hidden flag (marks are split equally between
--     enabled test cases; every test case is student-visible)
--   * questions.points / questions.active (replaced by marks / status)
--   * exam_questions.pointsOverride (replaced by exam_questions.marks)
--   * ExamStatus.ACTIVE (a test's phase is derived from its schedule)
--   * TestType.PLAYWRIGHT (never executable; rejected since 0004)
-- Old attempt snapshots may still contain points/hidden inside their JSON;
-- they are never read for grading.

-- Defensive: 0004 already moved ACTIVE tests to PUBLISHED.
UPDATE "exams" SET "status" = 'PUBLISHED' WHERE "status" = 'ACTIVE';

-- AlterEnum
BEGIN;
CREATE TYPE "ExamStatus_new" AS ENUM ('DRAFT', 'PUBLISHED', 'ENDED', 'ARCHIVED');
ALTER TABLE "public"."exams" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "exams" ALTER COLUMN "status" TYPE "ExamStatus_new" USING ("status"::text::"ExamStatus_new");
ALTER TYPE "ExamStatus" RENAME TO "ExamStatus_old";
ALTER TYPE "ExamStatus_new" RENAME TO "ExamStatus";
DROP TYPE "public"."ExamStatus_old";
ALTER TABLE "exams" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterEnum (fails loudly if a PLAYWRIGHT test somehow exists: fix it by hand first)
BEGIN;
CREATE TYPE "TestType_new" AS ENUM ('DECLARATIVE');
ALTER TABLE "public"."question_tests" ALTER COLUMN "testType" DROP DEFAULT;
ALTER TABLE "question_tests" ALTER COLUMN "testType" TYPE "TestType_new" USING ("testType"::text::"TestType_new");
ALTER TYPE "TestType" RENAME TO "TestType_old";
ALTER TYPE "TestType_new" RENAME TO "TestType";
DROP TYPE "public"."TestType_old";
ALTER TABLE "question_tests" ALTER COLUMN "testType" SET DEFAULT 'DECLARATIVE';
COMMIT;

-- DropIndex
DROP INDEX "questions_active_idx";

-- AlterTable
ALTER TABLE "exam_questions" DROP COLUMN "pointsOverride";

-- AlterTable
ALTER TABLE "question_tests" DROP COLUMN "hidden",
DROP COLUMN "points";

-- AlterTable
ALTER TABLE "questions" DROP COLUMN "active",
DROP COLUMN "points";

-- AlterTable
ALTER TABLE "test_results" DROP COLUMN "hidden";
