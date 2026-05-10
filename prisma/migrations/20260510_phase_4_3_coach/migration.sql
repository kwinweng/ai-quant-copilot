-- Sprint #3 (hypothesis coach): track coach turns separately from plan/conclusion calls.
-- Additive with default 0; existing rows automatically valid.

ALTER TABLE "AiUsageDay"
  ADD COLUMN IF NOT EXISTS "coachCalls" INTEGER NOT NULL DEFAULT 0;
