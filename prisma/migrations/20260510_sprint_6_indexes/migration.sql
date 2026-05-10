-- Sprint #6 M4: GIN index on Study.tags so the dashboard tag filter
-- can use index lookups instead of a sequential scan once tag-array
-- contents grow. Concurrent so creation doesn't lock the table.
-- Apply with `npx prisma db push` (dev) or `npx prisma migrate deploy` (prod).

CREATE INDEX IF NOT EXISTS "Study_tags_idx" ON "Study" USING GIN ("tags");
