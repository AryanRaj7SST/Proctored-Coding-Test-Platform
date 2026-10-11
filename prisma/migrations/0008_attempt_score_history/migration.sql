-- Record audit history of attempt scores across regrades. Additive only.
-- CreateTable
CREATE TABLE "attempt_score_histories" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "oldScore" DECIMAL(12,4) NOT NULL,
    "newScore" DECIMAL(12,4) NOT NULL,
    "oldResultStatus" "QuestionResultStatus",
    "newResultStatus" "QuestionResultStatus",
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedByAdminId" TEXT,
    "reason" TEXT,

    CONSTRAINT "attempt_score_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attempt_score_histories_attemptId_idx" ON "attempt_score_histories"("attemptId");

-- CreateIndex
CREATE INDEX "attempt_score_histories_questionId_idx" ON "attempt_score_histories"("questionId");

-- CreateIndex
CREATE INDEX "attempt_score_histories_changedAt_idx" ON "attempt_score_histories"("changedAt");

-- AddForeignKey
ALTER TABLE "attempt_score_histories" ADD CONSTRAINT "attempt_score_histories_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_score_histories" ADD CONSTRAINT "attempt_score_histories_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
