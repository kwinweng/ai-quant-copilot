-- Phase 6.5 — Time-varying universe (PIT-correct index constituents).
--
-- New table UniverseSnapshot stores end-of-month constituents per index,
-- keyed by (monthKey, indexName) so future indices (SP100, etc.) can land
-- without a schema migration. Seeded by scripts/seed-sp500-history.ts from
-- prisma/seed-data/sp500-history.json (data source: fja05680/sp500 repo).
--
-- New Study.universeProvider column defaults to "static-60" — legacy studies
-- keep their old behavior bit-for-bit on re-run. New studies opt into
-- "sp500-pit" via the form dropdown.
--
-- IMPORTANT (per docs/UPDATE-DEPLOY-SOP.md §2.3 / §2.3.5):
--   • Migration applied with `cat … | sudo -u postgres psql` in prod.
--   • IF NOT EXISTS guards keep this idempotent.
--   • ALTER TABLE OWNER TO aiquant guarded by pg_roles existence check.

CREATE TABLE IF NOT EXISTS "UniverseSnapshot" (
  "monthKey"  TEXT      NOT NULL,
  "indexName" TEXT      NOT NULL,
  "tickers"   TEXT[]    NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UniverseSnapshot_pkey" PRIMARY KEY ("monthKey", "indexName")
);

CREATE INDEX IF NOT EXISTS "UniverseSnapshot_indexName_monthKey_idx"
  ON "UniverseSnapshot"("indexName", "monthKey");

-- universeProvider on Study tracks which provider the runner used. NOT NULL
-- with default = "static-60" keeps every legacy row populated and routed to
-- the original behavior.
ALTER TABLE "Study"
  ADD COLUMN IF NOT EXISTS "universeProvider" TEXT NOT NULL DEFAULT 'static-60';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aiquant') THEN
    EXECUTE 'ALTER TABLE "UniverseSnapshot" OWNER TO aiquant';
  END IF;
END $$;
