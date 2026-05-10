-- Phase 3.1: extend StudyResult with research-experience fields.
-- All columns are additive with defaults so existing rows continue to work.
-- Apply with `npx prisma db push` (dev) or `npx prisma migrate deploy` (prod).

ALTER TABLE "StudyResult"
  ADD COLUMN IF NOT EXISTS "monthlyReturns" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "rebalanceHistory" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "dataQuality" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "parameterSensitivity" JSONB;
