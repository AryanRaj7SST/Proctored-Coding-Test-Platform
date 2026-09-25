-- Per-test access revocation, open-by-default tests, and removal of the
-- student roster's unused role/active columns (the roster no longer controls
-- sign-in or roles; see src/server/services/allowed-emails.ts).

-- DropIndex
DROP INDEX "allowed_emails_active_idx";

-- AlterTable
ALTER TABLE "allowed_emails" DROP COLUMN "active",
DROP COLUMN "role";

-- AlterTable
ALTER TABLE "exam_assignments" ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "exams" ALTER COLUMN "accessMode" SET DEFAULT 'ANY_AUTHENTICATED_USER';

