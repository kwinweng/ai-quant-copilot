-- Phase 8: robustness report column on StudyResult.
-- Stores in-sample/out-of-sample split metrics + bootstrap CI + subperiod
-- analysis. Nullable so legacy rows stay valid.

ALTER TABLE "StudyResult"
  ADD COLUMN IF NOT EXISTS "robustness" JSONB;
