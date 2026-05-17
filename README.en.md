# AI Quant Copilot

> Turn a one-sentence hypothesis into a trustworthy backtest, a tracked paper portfolio, and a long-term calibrated record — with AI as the spine, not the skin.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io/)
[![DeepSeek](https://img.shields.io/badge/LLM-DeepSeek-5A67D8)](https://www.deepseek.com/)
[![License](https://img.shields.io/badge/license-private-lightgrey)]()

**Language**: English · [简体中文](./README.md)

Live: [aiquant.kwinweng.com](https://aiquant.kwinweng.com)

---

## What it solves

Retail investors can't write rigorous factor backtests, don't trust the ones they run, and never have the patience to grow a strategy into a calibrated long-term record. AI Quant Copilot collapses that loop into three steps:

1. **State your hypothesis** — *"How did cheap-and-fast-moving tech stocks do over the past 10 years?"*
2. **Get an AI-explained backtest** — point-in-time factor synthesis, monthly rebalance, risk constraints, robustness tests, and a three-agent research-team debate
3. **Spin up a paper portfolio → calibrate quarterly** — the system issues monthly rebalance advice; every quarter it computes hit rate, tracking error, and execution rate, turning *"is this a real signal or a curve-fit?"* into a number you can watch

The difference from "a backtester with an LLM skin" is structural: **AI is the spine of the product, not decoration**. The three-piece moat — multi-agent debate + risk constraints + calibration loop — is genuinely hard to copy in the short term.

---

## Feature map

### Backtest engine
- **Multi-factor synthesis**: momentum / value / quality / low-volatility, with custom weights
- **Point-in-time fundamentals**: Yahoo TTM + SEC EDGAR historical hybrid (24h shared cache)
- **Monthly rebalance**: equal-weight top quintile, configurable holdings and frequency
- **Cost models**: `simple` (uniform bps × turnover) or `tiered` (liquidity-aware + sqrt market impact)
- **Risk constraints**: single-name cap + sector cap (GICS), truncate-and-renormalize at every rebalance
- **Robustness**: in/out-of-sample split + bootstrap confidence intervals
- **Benchmark attribution**: OLS decomposition vs. SPY / QQQ / IWM / MTUM / IUSV for α / β
- **Time-varying universe** (Phase 6.5, in progress): PIT-correct S&P 500 constituents with honest disclosure of missing data

### AI research team
- **Regan / Jayzee / Quinn three-agent debate**: 4 rounds of argument → consensus → final recommendation (DeepSeek-backed)
- **AI plan generation**: natural-language hypothesis → structured StudyPlan
- **AI conclusion**: translates backtest metrics into "what does this actually mean"
- **AI Coach**: conversational strategy iteration grounded in your prior studies

### Paper portfolio & calibration
- One-click derive a paper portfolio from any completed study
- Monthly rebalance advice with diffs (user accepts / skips)
- Quarterly calibration report: **hit rate**, **tracking error**, **execution rate**
- AI quarterly review that turns the calibration numbers into a readable summary

### Collaboration & sharing
- Public share links (token-gated, read-only)
- Lightweight Charts for live equity curves
- Personal dashboard: cumulative studies, calibration trend, AI usage

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 App Router · React 19 · Tailwind v4 · Radix UI · Lightweight Charts · Recharts |
| Backend | Next.js Route Handlers · NextAuth v5 (GitHub OAuth) · JWT sessions |
| Database | PostgreSQL · Prisma 6 |
| LLM | DeepSeek (OpenAI-compatible SDK) |
| Data | Yahoo Finance 2 + SEC EDGAR (free sources, no API key) |
| Tests | Vitest (colocated `*.test.ts`) |
| Deploy | DigitalOcean Singapore · Nginx · PM2 · self-hosted Postgres |

---

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- A GitHub OAuth App ([create one](https://github.com/settings/developers))
- A DeepSeek API key ([sign up](https://platform.deepseek.com/))

### Install

```bash
git clone https://github.com/kwinweng/ai-quant-copilot.git
cd ai-quant-copilot
npm install
```

### Environment variables

Create `.env`:

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/ai_quant_copilot"
AUTH_SECRET="<openssl rand -base64 32>"
AUTH_GITHUB_ID="<your github oauth client id>"
AUTH_GITHUB_SECRET="<your github oauth client secret>"
AUTH_URL="http://localhost:3000"
DEEPSEEK_API_KEY="<your deepseek key>"
AI_MODEL="deepseek-chat"           # optional, defaults to deepseek-chat
CRON_SECRET="<random string>"      # auth header for /api/cron/*
```

### Initialize the database

```bash
npx prisma generate
npx prisma db push       # local dev uses db push — there's no migrate-dev history
npm run db:seed          # optional, seeds demo studies
```

### Run

```bash
npm run dev              # http://localhost:3000
```

The first GitHub login auto-seeds 3 demo studies for the new user.

---

## Common commands

```bash
npm run dev          # dev server
npm run build        # production build
npm start            # run the built app
npm run lint         # next lint
npm test             # vitest run (one-shot)
npm run test:watch   # vitest watch mode

# Run a single test file / single test name
npx vitest run src/lib/backtest/factor.test.ts
npx vitest run -t "computes momentum"

# Prisma
npx prisma generate
npx prisma db push
npm run db:seed
```

`@/` is aliased to `src/` in both `tsconfig.json` and `vitest.config.ts`.

---

## Project layout

```
src/
├── app/
│   ├── (app)/            # Authenticated pages (studies / paper / profile / data-sources / about)
│   ├── api/              # Route handlers (studies / paper / coach / cron / profile)
│   └── share/[token]/    # The only public-readable business page
├── auth.ts               # NextAuth v5 config + first-login seed event
├── middleware.ts         # Auth gate (allowlist: /api/auth/*, /api/cron/*, /share/*)
├── lib/
│   ├── backtest/         # Engine core: runner / engine / factor / prices / costModel /
│   │                     # robustness / benchmarkAttribution / universeProvider
│   ├── factors/          # Multi-factor synthesis
│   ├── ai/               # DeepSeek calls: client / debate / reviewSummary / debateContext
│   ├── ai.ts             # Legacy plan + conclusion generation
│   ├── fundamentals/     # Yahoo + SEC EDGAR hybrid, 24h cache
│   ├── portfolio/        # Risk constraints (single-name + sector cap + GICS map)
│   ├── paper/            # Paper portfolio valuation / rebalance / calibration
│   ├── api.ts            # requireUser + standard error helpers
│   └── prisma.ts         # Prisma client singleton
└── components/           # UI components
prisma/
├── schema.prisma         # Single source of truth (every business row has a userId)
├── migrations/           # SQL migrations (prod applies via cat | psql, see docs)
└── seed.ts               # Demo study seed
```

### Data model essentials

Every business row is scoped by `userId` (cascade on user delete):

- `Study` → `StudyPlan` / `StudyProgress` / `StudyResult` / `StudyShareToken`
- `PaperPortfolio` → `PaperRebalanceAdvice`
- `UniverseSnapshot` — time-varying universe, composite PK `(monthKey, indexName)`
- `FundamentalSnapshot` — cross-user shared cache (**no** userId), composite PK `(ticker, source, fiscalDate)`
- `AiUsageDay` — per-user daily AI call counters (plan / conclusion / coach / debate / review), resets daily

---

## Shipped capabilities (by phase)

| Phase | Scope | Status |
|---|---|---|
| 1–12 | Core research flow (plan → backtest → conclusion) + paper portfolios + monthly advice | ✅ |
| 13 | Multi-agent research team (Regan / Jayzee / Quinn 4-round debate) | ✅ 2026-05-14 |
| 14 | Risk constraints (single-name cap + sector cap) | ✅ 2026-05-14 |
| 15 | Long-term calibration loop + per-user dashboard | ✅ 2026-05-14 |
| 16 | Public sharing + Lightweight Charts | ✅ 2026-05-15 |
| 6.5 | Time-varying universe (PIT + honest missing-data disclosure) | 🔜 W2 in progress |

Full roadmap in [`ROADMAP.md`](ROADMAP.md).

---

## A few design decisions worth knowing

- **Every business row is scoped by `userId`**, cascade on user delete. `requireUser()` is the first line of every API route.
- **Backtest start uses an atomic claim to defeat races**: `prisma.study.updateMany({ where: { status: { not: "RUNNING" } } })`. Don't refactor this into read-then-write — two concurrent `/start` calls used to both pass the check.
- **The runner is fire-and-forget**: `void runBacktest(id)`. All errors are caught and written as `FAILED` + `StudyProgress`; nothing throws out.
- **New analytical fields are `Json?` nullable**. The UI must render legacy `StudyResult` rows gracefully — backwards compatibility is a hard requirement.
- **No paid data sources** (Sharadar / EODHD / Polygon) — conflicts with the product positioning. The architecture leaves a hook for it; we switch when the user count crosses the ROI line. See `memory/project_yahoo_delisted_gap.md`.

---

## Deployment

The full prod checklist lives in `docs/UPDATE-DEPLOY-SOP.md` (local-only doc, gitignored). A few landmines you do **not** want to step on:

- **Prod has no `_prisma_migrations` table**. `prisma migrate deploy` returns P3005. Apply migrations manually: `cat prisma/migrations/<DIR>/migration.sql | sudo -u postgres psql -d ai_quant_copilot`.
- **All migration SQL must be idempotent**: `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. Re-running must be a no-op.
- **Every new `CREATE TABLE` must end with `ALTER TABLE "<Name>" OWNER TO aiquant`** (wrapped in `DO $$ ... IF EXISTS pg_roles ... $$`), or the app role gets `permission denied`.
- New columns must be nullable or have a default — old rows must keep working.
- Restart with `pm2 reload ai-quant-copilot --update-env` (not `restart`); `--update-env` is required to pick up `.env` changes.
- `/api/cron/*` is auth-bypassed in middleware and self-protects with the `X-Cron-Secret` header. New cron endpoints must live under that prefix.

First-time server bring-up: [`DEPLOY.md`](DEPLOY.md).

---

## Conventions

- **`ROADMAP.md`** is the active roadmap (Phase 13+). `fix_plan.md` is legacy and frozen.
- Comments tag additions with `Phase N — ...` / `Sprint #N — ...`. Preserve this when extending.
- All time-series JSON columns use `monthKey: "YYYY-MM"` as the canonical month identifier.
- Every successful AI call increments the matching `AiUsageDay` counter (`planCalls` / `conclusionCalls` / `coachCalls` / `debateCalls` / `reviewCalls`).

---

## License

Private project, source-available for reference, not open source.

---

## Contact

- Author: [@kwinweng](https://github.com/kwinweng)
- Feedback: open an issue or send mail
