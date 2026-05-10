-- Phase 5: add MarketCap + absolute SEC values to FundamentalSnapshot for
-- PIT-correct historical Value ratios. All four columns nullable + additive.
-- Apply with `npx prisma db push` (dev) or `npx prisma migrate deploy` (prod).

ALTER TABLE "FundamentalSnapshot"
  ADD COLUMN IF NOT EXISTS "marketCap"          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "netIncomeTTM"       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "revenuesTTM"        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "stockholdersEquity" DOUBLE PRECISION;
