-- Phase 4: fundamentals cache + multi-factor study mode + factor diagnostics.
-- All additive with safe defaults — momentum-only studies continue to work.
-- Apply with `npx prisma db push` (dev) or `npx prisma migrate deploy` (prod).

-- 1. Study.factorMix — what factor strategy this study uses.
ALTER TABLE "Study"
  ADD COLUMN IF NOT EXISTS "factorMix" TEXT NOT NULL DEFAULT 'momentum';

-- 2. StudyResult — multi-factor diagnostics. Nullable so legacy rows are fine.
ALTER TABLE "StudyResult"
  ADD COLUMN IF NOT EXISTS "factorCoverage"  JSONB,
  ADD COLUMN IF NOT EXISTS "factorBreakdown" JSONB;

-- 3. FundamentalSnapshot — shared cache, no userId. Compound PK lets a single
-- ticker have rows from Yahoo and SEC simultaneously, plus historical periods.
CREATE TABLE IF NOT EXISTS "FundamentalSnapshot" (
  "ticker"        TEXT      NOT NULL,
  "source"        TEXT      NOT NULL,
  "fiscalDate"    TIMESTAMP NOT NULL,
  "asOf"          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reportedAt"    TIMESTAMP,
  "pe"            DOUBLE PRECISION,
  "pb"            DOUBLE PRECISION,
  "ps"            DOUBLE PRECISION,
  "evEbitda"      DOUBLE PRECISION,
  "roe"           DOUBLE PRECISION,
  "roic"          DOUBLE PRECISION,
  "grossMargin"   DOUBLE PRECISION,
  "debtToEquity"  DOUBLE PRECISION,
  "revenueGrowth" DOUBLE PRECISION,
  "epsGrowth"     DOUBLE PRECISION,
  "raw"           JSONB,
  CONSTRAINT "FundamentalSnapshot_pkey" PRIMARY KEY ("ticker", "source", "fiscalDate")
);

CREATE INDEX IF NOT EXISTS "FundamentalSnapshot_ticker_asOf_idx"
  ON "FundamentalSnapshot"("ticker", "asOf");

CREATE INDEX IF NOT EXISTS "FundamentalSnapshot_source_asOf_idx"
  ON "FundamentalSnapshot"("source", "asOf");
