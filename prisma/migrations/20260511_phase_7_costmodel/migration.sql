-- Phase 7: add costModel selector to Study. Default 'simple' preserves
-- backwards compatibility with all pre-Phase-7 studies. New studies via
-- /studies/new opt into 'tiered' (liquidity-tier-aware spread + sqrt
-- market impact + user commission).

ALTER TABLE "Study"
  ADD COLUMN IF NOT EXISTS "costModel" TEXT NOT NULL DEFAULT 'simple';
