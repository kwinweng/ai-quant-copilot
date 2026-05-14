-- Phase 13/14/15 — combined schema migration.
--
-- Phase 13 (multi-agent debate):
--   * StudyResult.aiDebate Json? — cached debate transcript + verdict
--   * AiUsageDay.debateCalls Int default 0 — per-day debate quota counter
--
-- Phase 14 (risk constraints):
--   * Study.constraints Json default '{}' — { maxPositionWeight, maxSectorWeight, optimizer }
--   * StudyResult.sectorAllocation Json? — per-rebalance sector breakdown
--
-- Phase 15 (calibration loop):
--   * PaperPortfolio.quarterlyReview Json? — cached calibration review (7d TTL)
--   * AiUsageDay.reviewCalls Int default 0 — review-summary AI quota counter
--
-- All new columns are nullable or have defaults so existing rows continue to
-- work without backfill.

ALTER TABLE "StudyResult"
  ADD COLUMN IF NOT EXISTS "aiDebate" JSONB,
  ADD COLUMN IF NOT EXISTS "sectorAllocation" JSONB;

ALTER TABLE "Study"
  ADD COLUMN IF NOT EXISTS "constraints" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "PaperPortfolio"
  ADD COLUMN IF NOT EXISTS "quarterlyReview" JSONB;

ALTER TABLE "AiUsageDay"
  ADD COLUMN IF NOT EXISTS "debateCalls" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reviewCalls" INTEGER NOT NULL DEFAULT 0;
