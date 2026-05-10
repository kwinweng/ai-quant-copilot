-- Phase 10: PaperPortfolio table.
-- Snapshot of a completed study's last-rebalance holdings, used to track
-- live performance going forward. Refreshed on read by re-pricing against
-- Yahoo's latest monthly closes.

CREATE TABLE IF NOT EXISTS "PaperPortfolio" (
  "id"                  TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"              TEXT      NOT NULL,
  "sourceStudyId"       TEXT      NOT NULL,
  "sourceRebalanceDate" TEXT      NOT NULL,
  "title"               TEXT      NOT NULL,
  "holdings"            JSONB     NOT NULL,
  "initialValue"        DOUBLE PRECISION NOT NULL DEFAULT 100000,
  "benchmark"           TEXT      NOT NULL DEFAULT 'SPY',
  "startedAt"           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived"            BOOLEAN   NOT NULL DEFAULT false,
  "notes"               TEXT,
  "createdAt"           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP NOT NULL,
  CONSTRAINT "PaperPortfolio_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaperPortfolio_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Use Prisma cuid()-style ID generation: replace default to match.
ALTER TABLE "PaperPortfolio" ALTER COLUMN "id" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "PaperPortfolio_userId_archived_idx"
  ON "PaperPortfolio"("userId", "archived");

CREATE INDEX IF NOT EXISTS "PaperPortfolio_sourceStudyId_idx"
  ON "PaperPortfolio"("sourceStudyId");
