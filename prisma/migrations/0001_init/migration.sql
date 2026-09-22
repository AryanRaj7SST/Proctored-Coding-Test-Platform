-- Initial schema for the proctored coding platform.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'ADMIN');
CREATE TYPE "QuestionType" AS ENUM ('WEB', 'PROGRAMMING');
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE "TestType" AS ENUM ('DECLARATIVE', 'PLAYWRIGHT');
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ACTIVE', 'ENDED', 'ARCHIVED');
CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'STARTED', 'SUBMITTED', 'EXPIRED');
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED');
CREATE TYPE "TestRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT');
CREATE TYPE "TestRunKind" AS ENUM ('PRACTICE', 'SUBMISSION', 'VALIDATION');
CREATE TYPE "ProctorEventType" AS ENUM ('TAB_HIDDEN', 'WINDOW_BLUR', 'WINDOW_FOCUS', 'FULLSCREEN_EXIT', 'FULLSCREEN_ENTER', 'COPY', 'CUT', 'PASTE', 'CONTEXT_MENU', 'PAGE_UNLOAD', 'HEARTBEAT_LOST', 'EXAM_STARTED', 'EXAM_SUBMITTED');
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'AWAY', 'DISCONNECTED', 'SUBMITTED', 'EXPIRED');
CREATE TYPE "ValidationStatus" AS ENUM ('NOT_VALIDATED', 'PASSED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "batch" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "allowed_emails" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "batch" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "allowed_emails_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT,
    "type" "QuestionType" NOT NULL DEFAULT 'WEB',
    "language" TEXT,
    "starterHtml" TEXT NOT NULL DEFAULT '',
    "starterCss" TEXT NOT NULL DEFAULT '',
    "starterJs" TEXT NOT NULL DEFAULT '',
    "referenceHtml" TEXT,
    "referenceCss" TEXT,
    "referenceJs" TEXT,
    "mediaUrl" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'EASY',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "validation" "ValidationStatus" NOT NULL DEFAULT 'NOT_VALIDATED',
    "validatedAt" TIMESTAMP(3),
    "validationMessage" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "question_tests" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "testType" "TestType" NOT NULL DEFAULT 'DECLARATIVE',
    "testCode" TEXT NOT NULL,
    "expectedBehavior" TEXT,
    "points" INTEGER NOT NULL DEFAULT 10,
    "order" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "question_tests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "batch" TEXT,
    "maxViolations" INTEGER NOT NULL DEFAULT 0,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exam_questions" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "pointsOverride" INTEGER,
    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exam_assignments" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    CONSTRAINT "exam_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "html" TEXT NOT NULL DEFAULT '',
    "css" TEXT NOT NULL DEFAULT '',
    "js" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL DEFAULT 0,
    "maxScore" INTEGER NOT NULL DEFAULT 0,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "snapshot" JSONB NOT NULL,
    "questionVersion" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "gradedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "test_runs" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT,
    "questionId" TEXT,
    "userId" TEXT,
    "kind" "TestRunKind" NOT NULL DEFAULT 'PRACTICE',
    "status" "TestRunStatus" NOT NULL DEFAULT 'QUEUED',
    "passedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "maxScore" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "logs" TEXT,
    "error" TEXT,
    CONSTRAINT "test_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "test_results" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "testRunId" TEXT,
    "testId" TEXT,
    "testName" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT true,
    "points" INTEGER NOT NULL DEFAULT 0,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "final" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "test_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "proctor_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "attemptId" TEXT,
    "type" "ProctorEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER,
    "violation" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "proctor_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exam_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "userAgent" TEXT,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_role_idx" ON "users"("role");
CREATE INDEX "users_batch_idx" ON "users"("batch");

CREATE UNIQUE INDEX "allowed_emails_email_key" ON "allowed_emails"("email");
CREATE INDEX "allowed_emails_active_idx" ON "allowed_emails"("active");
CREATE INDEX "allowed_emails_batch_idx" ON "allowed_emails"("batch");

CREATE UNIQUE INDEX "questions_slug_key" ON "questions"("slug");
CREATE INDEX "questions_active_idx" ON "questions"("active");
CREATE INDEX "questions_type_idx" ON "questions"("type");

CREATE UNIQUE INDEX "question_tests_questionId_name_key" ON "question_tests"("questionId", "name");
CREATE INDEX "question_tests_questionId_order_idx" ON "question_tests"("questionId", "order");

CREATE INDEX "exams_status_idx" ON "exams"("status");
CREATE INDEX "exams_batch_idx" ON "exams"("batch");

CREATE UNIQUE INDEX "exam_questions_examId_questionId_key" ON "exam_questions"("examId", "questionId");
CREATE UNIQUE INDEX "exam_questions_examId_order_key" ON "exam_questions"("examId", "order");
CREATE INDEX "exam_questions_examId_idx" ON "exam_questions"("examId");

CREATE UNIQUE INDEX "exam_assignments_examId_userId_key" ON "exam_assignments"("examId", "userId");
CREATE INDEX "exam_assignments_userId_idx" ON "exam_assignments"("userId");

CREATE UNIQUE INDEX "attempts_userId_examId_questionId_key" ON "attempts"("userId", "examId", "questionId");
CREATE INDEX "attempts_examId_status_idx" ON "attempts"("examId", "status");
CREATE INDEX "attempts_userId_idx" ON "attempts"("userId");

CREATE INDEX "test_runs_attemptId_idx" ON "test_runs"("attemptId");
CREATE INDEX "test_runs_status_idx" ON "test_runs"("status");
CREATE INDEX "test_runs_startedAt_idx" ON "test_runs"("startedAt");

CREATE INDEX "test_results_attemptId_final_idx" ON "test_results"("attemptId", "final");
CREATE INDEX "test_results_testRunId_idx" ON "test_results"("testRunId");

CREATE INDEX "proctor_events_userId_examId_idx" ON "proctor_events"("userId", "examId");
CREATE INDEX "proctor_events_examId_occurredAt_idx" ON "proctor_events"("examId", "occurredAt");
CREATE INDEX "proctor_events_attemptId_idx" ON "proctor_events"("attemptId");

CREATE UNIQUE INDEX "exam_sessions_userId_examId_key" ON "exam_sessions"("userId", "examId");
CREATE INDEX "exam_sessions_examId_status_idx" ON "exam_sessions"("examId", "status");
CREATE INDEX "exam_sessions_lastHeartbeat_idx" ON "exam_sessions"("lastHeartbeat");

CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "question_tests" ADD CONSTRAINT "question_tests_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_assignments" ADD CONSTRAINT "exam_assignments_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_assignments" ADD CONSTRAINT "exam_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_testId_fkey" FOREIGN KEY ("testId") REFERENCES "question_tests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proctor_events" ADD CONSTRAINT "proctor_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proctor_events" ADD CONSTRAINT "proctor_events_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proctor_events" ADD CONSTRAINT "proctor_events_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
