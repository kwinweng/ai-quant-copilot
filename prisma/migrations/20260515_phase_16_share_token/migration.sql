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
