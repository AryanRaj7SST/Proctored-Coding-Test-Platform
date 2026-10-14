-- CreateEnum
CREATE TYPE "LeaderboardMode" AS ENUM ('LIVE', 'AFTER_END', 'HIDDEN');

-- CreateEnum
CREATE TYPE "AttemptFlagKind" AS ENUM ('PLAGIARISM', 'MANUAL_REVIEW');

-- AlterTable
ALTER TABLE "exams" ADD COLUMN "leaderboardMode" "LeaderboardMode" NOT NULL DEFAULT 'AFTER_END',
ADD COLUMN "wrongTryPenaltySeconds" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN "leaderboardFrozenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "displayHandle" TEXT;

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN "acceptedAt" TIMESTAMP(3),
ADD COLUMN "triesCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "attempt_flags" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "kind" "AttemptFlagKind" NOT NULL,
    "setById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_displayHandle_key" ON "users"("displayHandle");

-- CreateIndex
CREATE INDEX "attempt_flags_attemptId_idx" ON "attempt_flags"("attemptId");

-- CreateIndex
CREATE INDEX "attempt_flags_kind_idx" ON "attempt_flags"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_flags_attemptId_kind_key" ON "attempt_flags"("attemptId", "kind");

-- AddForeignKey
ALTER TABLE "attempt_flags" ADD CONSTRAINT "attempt_flags_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_flags" ADD CONSTRAINT "attempt_flags_setById_fkey" FOREIGN KEY ("setById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
