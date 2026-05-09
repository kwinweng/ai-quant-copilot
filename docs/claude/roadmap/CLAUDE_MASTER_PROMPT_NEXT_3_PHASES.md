# Claude Master Prompt: Next 3 Phases

You are continuing development of AI Quant Copilot.

The product is a web-first personal AI quantitative research platform for US equities.

The current implementation is already past the original mock prototype and is now working on Phase 3: real price-momentum backtesting.

Read these files first:

- `docs/claude/roadmap/NEXT_3_PHASES_ROADMAP.md`
- `docs/claude/roadmap/RALPH_FIX_PLAN_NEXT_3_PHASES.md`

Also inspect the current codebase before making changes:

- `src/lib/backtest/`
- `src/app/api/studies/`
- Dashboard pages.
- Running page.
- Result page.
- Prisma schema.
- Study API routes.
- AI conclusion routes.

## Mission

After Phase 3 is complete, implement the next three phases sequentially:

1. Phase 3.1: Real Backtest Research Experience.
2. Phase 3.2: Experiment Management And Comparison.
3. Phase 4: Fundamental Data And Multi-Factor Research Foundation.

## Strict Sequencing

Do not start Phase 3.2 until:

- Phase 3.1 acceptance criteria are complete.
- `npm run build` passes.

Do not start Phase 4 until:

- Phase 3.2 acceptance criteria are complete.
- `npm run build` passes.
- The user has selected a fundamentals data provider.

If Phase 4 is reached and no provider is selected, stop and report `BLOCKED`.

## Phase 3.1 Summary

Make completed real backtests useful for repeated research.

Implement:

- Data Quality & Bias panel.
- Rebalance history.
- Annual performance.
- Best/worst months.
- Copy & Modify.
- Markdown export.
- Parameter sensitivity if feasible.

## Phase 3.2 Summary

Make many experiments manageable.

Implement:

- Study search.
- Filters.
- Sorting.
- Tags.
- Favorite/archive.
- Compare two studies.
- Equity curve overlay.
- Metrics and parameter comparison.

## Phase 4 Summary

Begin multi-factor research.

Only start after provider decision.

Implement:

- Fundamentals provider abstraction.
- Provider implementation.
- Fundamentals cache.
- Value factors.
- Quality factors.
- Growth factors.
- Value + Quality + Momentum composite.
- Factor coverage report.

## Scope Guardrails

Do not implement:

- Hong Kong market.
- Futu OpenD.
- Live trading.
- Broker orders.
- Redis/BullMQ unless explicitly approved.
- PDF export.
- Public share links.
- Team collaboration.
- Mobile native app.
- Options strategies.
- Intraday data.

Do not rewrite working systems unnecessarily.

Prefer extending existing Study/result JSON and UI.

## Quality Requirements

For each phase:

- Keep changes scoped.
- Preserve existing working flows.
- Run `npm run build`.
- Fix all TypeScript/build errors.
- Update README or docs if commands or behavior change.
- Report changed files and known limitations.

## End-Of-Loop Report

At the end of each work session, report:

- Current phase.
- Completed tasks.
- Files changed.
- Tests/build result.
- Whether the next phase is allowed to begin.
- Blockers or required human decisions.

If Ralph is active, end with:

```text
---RALPH_STATUS---
STATUS: IN_PROGRESS | COMPLETE | BLOCKED
TASKS_COMPLETED_THIS_LOOP: <number>
FILES_MODIFIED: <number>
TESTS_STATUS: PASSING | FAILING | NOT_RUN
WORK_TYPE: IMPLEMENTATION
EXIT_SIGNAL: false
RECOMMENDATION: Continue with the next unchecked roadmap task or stop for human review
---END_RALPH_STATUS---
```

Set `EXIT_SIGNAL: true` only if all three phases are complete, build passes, and no human decision is pending.

