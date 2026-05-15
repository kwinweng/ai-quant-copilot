-- Phase 16 — Public study share tokens.
--
-- One active share token per study (studyId UNIQUE). The token is a
-- 32-byte base64url string generated server-side; clients only ever see
-- the token, never the underlying study id when accessing via /share/[token].
--
-- Idempotent ADD COLUMN-style not applicable here (CREATE TABLE doesn't
-- support IF NOT EXISTS for constraints), so we wrap in a guard.

CREATE TABLE IF NOT EXISTS "StudyShareToken" (
  "id"              TEXT      NOT NULL,
  "studyId"         TEXT      NOT NULL,
  "userId"          TEXT      NOT NULL,
  "token"           TEXT      NOT NULL,
  "viewCount"       INTEGER   NOT NULL DEFAULT 0,
  "lastAccessedAt"  TIMESTAMP,
  "expiresAt"       TIMESTAMP,
  "createdAt"       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP NOT NULL,
  CONSTRAINT "StudyShareToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudyShareToken_studyId_fkey"
    FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudyShareToken_studyId_key"
  ON "StudyShareToken"("studyId");

CREATE UNIQUE INDEX IF NOT EXISTS "StudyShareToken_token_key"
  ON "StudyShareToken"("token");

CREATE INDEX IF NOT EXISTS "StudyShareToken_userId_idx"
  ON "StudyShareToken"("userId");

-- IMPORTANT: when we apply migrations via `cat | sudo -u postgres psql`,
-- new tables end up owned by `postgres` instead of `aiquant`, which means
-- the app role hits "permission denied" on first query. This ALTER fixes
-- that. ALTER TABLE OWNER is idempotent so it's safe to re-run.
--
-- Only do it when the role exists — first-time-ever fresh DB might not
-- have created it yet (DEPLOY.md step 2 handles role creation).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aiquant') THEN
    EXECUTE 'ALTER TABLE "StudyShareToken" OWNER TO aiquant';
  END IF;
END $$;
