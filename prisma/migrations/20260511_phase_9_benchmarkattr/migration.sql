-- Phase 9: multi-benchmark OLS attribution column on StudyResult.
-- Stores alpha/beta/R² vs SPY/QQQ/IWM/MTUM/IUSV. Nullable.

ALTER TABLE "StudyResult"
  ADD COLUMN IF NOT EXISTS "benchmarkAttribution" JSONB;
