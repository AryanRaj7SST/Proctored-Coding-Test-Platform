-- AlterTable
ALTER TABLE "exams" ADD COLUMN "countClipboardViolations" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN "flags" JSONB;
