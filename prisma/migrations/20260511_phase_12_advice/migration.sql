-- Phase 12: PaperRebalanceAdvice table + status enum.
-- Monthly scheduler generates one row per (portfolio, suggestedMonth) capturing
-- the diff between current holdings and the strategy's recommendation. Status
-- transitions pending → confirmed | skipped via the /api/paper/[id]/advice/*
-- endpoints. We do NOT auto-rebalance — the user must explicitly confirm.

-- Enum: pending / confirmed / skipped
DO $$ BEGIN
  CREATE TYPE "PaperAdviceStatus" AS ENUM ('pending', 'confirmed', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PaperRebalanceAdvice" (
  "id"                TEXT      NOT NULL,
  "userId"            TEXT      NOT NULL,
  "paperPortfolioId"  TEXT      NOT NULL,
  "suggestedMonth"    TEXT      NOT NULL,
  "suggestedTickers"  TEXT[]    NOT NULL DEFAULT ARRAY[]::TEXT[],
  "currentTickers"    TEXT[]    NOT NULL DEFAULT ARRAY[]::TEXT[],
  "addedTickers"      TEXT[]    NOT NULL DEFAULT ARRAY[]::TEXT[],
  "removedTickers"    TEXT[]    NOT NULL DEFAULT ARRAY[]::TEXT[],
  "avgScore"          DOUBLE PRECISION,
  "status"            "PaperAdviceStatus" NOT NULL DEFAULT 'pending',
  "actedAt"           TIMESTAMP,
  "reason"            TEXT,
  "notifiedAt"        TIMESTAMP,
  "createdAt"         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP NOT NULL,
  CONSTRAINT "PaperRebalanceAdvice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaperRebalanceAdvice_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "PaperRebalanceAdvice_paperPortfolioId_fkey"
    FOREIGN KEY ("paperPortfolioId") REFERENCES "PaperPortfolio"("id") ON DELETE CASCADE
);

-- At most one advice per (portfolio, month) — prevents duplicates from rerunning
-- the scheduler within the same calendar month.
CREATE UNIQUE INDEX IF NOT EXISTS "PaperRebalanceAdvice_portfolio_month_uniq"
  ON "PaperRebalanceAdvice"("paperPortfolioId", "suggestedMonth");

CREATE INDEX IF NOT EXISTS "PaperRebalanceAdvice_userId_status_idx"
  ON "PaperRebalanceAdvice"("userId", "status");

CREATE INDEX IF NOT EXISTS "PaperRebalanceAdvice_portfolio_status_idx"
  ON "PaperRebalanceAdvice"("paperPortfolioId", "status");
