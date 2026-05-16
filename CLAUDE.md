# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Next.js dev server (port 3000)
npm run build        # Production build
npm start            # Run built app
npm run lint         # next lint
npm test             # vitest run (one-shot)
npm run test:watch   # vitest watch mode

# Single test file / test name
npx vitest run src/lib/backtest/factor.test.ts
npx vitest run -t "computes momentum"

# Prisma (local dev)
npx prisma generate          # regenerate client after schema.prisma edits
npx prisma db push           # apply schema changes locally (NOT used in prod — see below)
npm run db:seed              # seed demo data via prisma/seed.ts
```

`@/` is aliased to `src/` (both `tsconfig.json` and `vitest.config.ts`). Tests are colocated as `*.test.ts` next to the source they cover.

## Architecture

**Stack**: Next.js 15 App Router + TypeScript strict + Tailwind v4 + Prisma + PostgreSQL + NextAuth v5 (GitHub OAuth) + DeepSeek (OpenAI-compatible) + Yahoo Finance 2 + Lightweight Charts.

The app is organized into a small number of vertical slices. Reading these directories in order is the fastest way to orient:

1. **`src/auth.ts` + `src/middleware.ts`** — NextAuth v5 + Prisma adapter, JWT session strategy. Middleware redirects unauthenticated users to `/login` *except* for `/api/auth/*`, `/api/cron/*` (own header auth via `CRON_SECRET`), `/share/*` (token-gated public read), and a small `PUBLIC_PATHS` set for icons/manifest. First-time login auto-seeds 3 demo studies via the `createUser` event.

2. **`src/app/(app)/`** — authenticated UI (studies, paper, profile, data-sources, about). `src/app/api/` mirrors it for route handlers. `src/app/share/[token]/` is the only public-readable page.

3. **`prisma/schema.prisma`** — single source of truth for the data model. **Every business row is scoped by `userId`** (cascade on user delete). Key models:
   - `Study` → `StudyPlan` / `StudyProgress` / `StudyResult` / `StudyShareToken` (1:1)
   - `PaperPortfolio` → `PaperRebalanceAdvice` (Phase 10/12)
   - `FundamentalSnapshot` — shared cross-user cache (NOT scoped to userId), composite PK `(ticker, source, fiscalDate)`
   - `AiUsageDay` — per-user daily counters for plan/conclusion/coach/debate/review (cheap rate limiting; resets daily)

4. **`src/lib/backtest/`** — the engine. `runner.ts` orchestrates: validate → fetch monthly prices via `prices.ts` (yahoo-finance2) → compute factor scores (`factor.ts` or `factors/multifactor.ts`) → run `engine.ts` (monthly rebalance, equal-weight top quintile) → compute metrics → write `StudyResult`. `universeProvider.ts` is the abstraction for the time-varying universe (Phase 6.5 work-in-progress). `costModel.ts` supports both `"simple"` (uniform bps × turnover) and `"tiered"` (liquidity-aware + sqrt market impact). `robustness.ts` does the in/out-of-sample split + bootstrap CI. `benchmarkAttribution.ts` runs OLS vs SPY/QQQ/IWM/MTUM/IUSV.

5. **`src/lib/ai/`** — all DeepSeek calls go through `client.ts` (single OpenAI client, base URL `https://api.deepseek.com`, model from `AI_MODEL` env or `deepseek-chat`). `debate.ts` orchestrates the 4-round Regan/Jayzee/Quinn multi-agent debate (Phase 13). `reviewSummary.ts` is the quarterly calibration summary (Phase 15). The legacy `src/lib/ai.ts` holds plan + conclusion generation.

6. **`src/lib/fundamentals/`** — Yahoo + SEC EDGAR hybrid (24h cache via `FundamentalSnapshot`). `merge.ts` reconciles the two sources; `sec.ts` is the PIT-anchored historical source; `yahoo.ts` is the current-TTM source.

7. **`src/lib/portfolio/`** — risk constraints (Phase 14): single-name cap + sector cap (`sectorMap.ts` is a static 60-ticker → GICS map) + truncation/renormalization. Applied at every rebalance inside `runner.ts`.

8. **`src/lib/paper/`** — Phase 10/12/15: portfolio valuation, monthly rebalance scheduler, advice diff, quarterly calibration metrics (hit rate / tracking error / execution rate).

9. **`src/lib/api.ts`** — every API route should start with `const { session, response } = await requireUser(); if (response) return response;`. Standard error helpers: `badRequest`, `notFound`, `serverError`, `tooManyRequests`.

### Backtest start flow (anti-race pattern worth knowing)

`POST /api/studies/[id]/start` uses `prisma.study.updateMany({ where: { status: { not: "RUNNING" } } })` to *atomically claim* the study before spawning the runner. Don't replace this with read-then-write — two parallel `/start` calls used to both pass the check and race. The runner itself is fire-and-forget (`void runBacktest(id)`); it catches all errors and writes `FAILED` + logs to `StudyProgress` rather than throwing out.

## Deployment (READ THIS BEFORE TOUCHING PROD)

`docs/UPDATE-DEPLOY-SOP.md` is the authoritative checklist for every deploy. The non-obvious traps:

- **Prod has no `_prisma_migrations` table.** `npx prisma migrate deploy` returns P3005 in production. Migrations are applied by piping the SQL: `cat prisma/migrations/<DIR>/migration.sql | sudo -u postgres psql -d ai_quant_copilot` (the `cat | psql` form is required because the `postgres` OS user can't read `/root/`).
- **All migration SQL must be idempotent**: `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. Re-running a migration must be a no-op.
- **New `CREATE TABLE` migrations must end with `ALTER TABLE "<Name>" OWNER TO aiquant`** (wrapped in `DO $$ ... IF EXISTS pg_roles ... $$`), or the app role gets `permission denied`. This bit Phase 16.
- New columns must be nullable or have a default — old rows must keep working.
- `pm2 reload ai-quant-copilot --update-env` (NOT `restart`) for zero downtime; the `--update-env` is required to pick up `.env` changes.
- `/api/cron/*` is auth-bypassed in middleware and self-protects with the `X-Cron-Secret` header. New cron endpoints must live under that prefix.

Local DB workflow (per `prisma/migrations/README.md`) is `npx prisma db push` — there is no migrate-dev history.

## Conventions

- `ROADMAP.md` is the active roadmap (Phase 13+). `fix_plan.md` is legacy and frozen.
- Phase/Sprint vocabulary is used everywhere (commit messages, comments, schema fields). Sprint #N is finer-grained work; Phase N is a multi-week feature block.
- Comments use `Phase N — ...` / `Sprint #N — ...` to mark when fields/columns were added; preserve this when extending.
- Time series JSON columns use `monthKey: "YYYY-MM"` as the canonical month identifier.
- Per-user AI quotas are enforced via `AiUsageDay` — increment the matching counter (`planCalls`/`conclusionCalls`/`coachCalls`/`debateCalls`/`reviewCalls`) after a successful generation.
- Backwards compatibility for legacy `StudyResult` rows is a hard requirement: most new analytical fields are `Json?` (nullable) and the UI must render gracefully when absent.

## Notes for AI agents

- The user-global instructions (gstack skills, `/browse` etc.) at `~/.claude/CLAUDE.md` apply here too — use `/browse` for any UI verification, never `mcp__claude-in-chrome__*`.
- When in doubt about deployment behavior or prod state, re-read `docs/UPDATE-DEPLOY-SOP.md` rather than guessing — it's the only file with the full set of historical landmines.
