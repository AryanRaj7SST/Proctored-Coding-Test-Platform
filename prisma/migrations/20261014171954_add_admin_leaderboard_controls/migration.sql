-- AlterEnum
ALTER TYPE "AttemptFlagKind" ADD VALUE 'DISQUALIFIED';

-- AlterTable
ALTER TABLE "exam_sessions" ADD COLUMN     "disqualifiedAt" TIMESTAMP(3),
ADD COLUMN     "disqualifiedById" TEXT,
ADD COLUMN     "disqualifiedReason" TEXT;

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "resultsPublishedAt" TIMESTAMP(3);
