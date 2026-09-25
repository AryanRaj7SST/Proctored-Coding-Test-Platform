-- Explicit, per-assignment clipboard accommodation. Replaces a hard-coded
-- email exemption in application code. Defaults to off for everyone.
ALTER TABLE "exam_assignments" ADD COLUMN "allowClipboard" BOOLEAN NOT NULL DEFAULT false;
