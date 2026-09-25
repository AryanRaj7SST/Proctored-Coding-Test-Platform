-- Bring the database in line with schema.prisma. Both objects existed in the
-- Prisma schema but were never captured in a migration, so a database built
-- from migrations failed on every TestRun query (P2022: test_runs.code) and
-- rejected PAGE_RELOAD proctor events.

-- AlterEnum
ALTER TYPE "ProctorEventType" ADD VALUE IF NOT EXISTS 'PAGE_RELOAD';

-- AlterTable
ALTER TABLE "test_runs" ADD COLUMN IF NOT EXISTS "code" JSONB;
