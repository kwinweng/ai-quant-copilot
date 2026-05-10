-- Phase 3.2: experiment management — tags / favorited / archived on Study.
-- Additive with safe defaults so existing rows continue to load.
-- Apply with `npx prisma db push` (dev) or `npx prisma migrate deploy` (prod).

ALTER TABLE "Study"
  ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "favorited" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Study_userId_archived_idx"
  ON "Study"("userId", "archived");

CREATE INDEX IF NOT EXISTS "Study_userId_favorited_idx"
  ON "Study"("userId", "favorited");
