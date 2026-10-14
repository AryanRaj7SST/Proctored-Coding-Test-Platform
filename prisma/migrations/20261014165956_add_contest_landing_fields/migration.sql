-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "instructorInfoMd" TEXT,
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notesMd" TEXT;
