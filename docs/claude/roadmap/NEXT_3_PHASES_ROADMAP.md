# AI Quant Copilot Next 3 Phases Roadmap

## Purpose

This roadmap gives Claude a multi-version framework so development can proceed sequentially without needing a new prompt for every small feature.

The current work is Phase 3: real price-momentum backtest.

After Phase 3 is complete, proceed in this order:

1. Phase 3.1: Real Backtest Research Experience.
2. Phase 3.2: Experiment Management And Comparison.
3. Phase 4: Fundamental Data And Multi-Factor Research Foundation.

Do not skip phases.

Do not start a later phase until the previous phase builds successfully and its acceptance criteria are complete.

## Product Direction

AI Quant Copilot is a personal AI quantitative research platform for US equities.

It should evolve from:

```text
single real backtest
  -> repeatable research workflow
  -> experiment management
  -> price + fundamental multi-factor research
```

It is not:

- A live trading app.
- A broker terminal.
- A public social investing platform.
- A general ChatGPT wrapper.
- A Bloomberg clone.

## Phase 3.1: Real Backtest Research Experience

### Goal

Make a completed real backtest useful for repeated research.

Phase 3 proves the system can run a real 12-1 price momentum backtest.

Phase 3.1 should help the user understand, vary, rerun, and export that study.

### Features

- Copy & Modify study.
- Editable rerun parameters.
- Data Quality & Bias panel.
- Rebalance history.
- Annual performance.
- Best/worst months.
- Markdown export.
- Parameter sensitivity analysis if feasible.

### Required UI Enhancements

Result page should include:

- Main metrics and AI conclusion.
- Data Quality & Bias near the top.
- Equity and drawdown charts.
- Annual Performance section.
- Best/Worst Months section.
- Rebalance History section.
- Parameter Sensitivity section or action.
- Export Markdown action.
- Copy & Modify action.

### Required Guardrails

Every completed result should clearly state:

- Current universe is a static large-cap US stock list.
- Results have survivorship bias.
- Strategy is price-only momentum.
- Output is research, not investment advice.

### Acceptance Criteria

- Existing Phase 3 backtest still works.
- Completed result page shows data quality.
- Completed result page shows annual performance.
- Completed result page shows best/worst months.
- Completed result page shows rebalance history.
- Copy & Modify works.
- Markdown export works.
- Build passes.

## Phase 3.2: Experiment Management And Comparison

### Goal

Make the product useful after the user has many studies.

After Phase 3.1, a user can rerun many variations. Phase 3.2 should help organize and compare them.

### Features

- Study list filtering and sorting.
- Study tags.
- Study status grouping.
- Favorite/archive studies.
- Compare two studies.
- Overlay equity curves.
- Side-by-side metric comparison.
- Parameter difference comparison.
- Saved "promising" studies.

### Required UI Enhancements

Dashboard / Studies page should support:

- Search studies by title/hypothesis.
- Filter by status: Draft, Running, Completed, Failed.
- Filter by factor type: Momentum, Sensitivity, Baseline.
- Sort by created date, CAGR, Sharpe, MaxDD.
- Favorite and archive actions.

Comparison page should show:

- Study A vs Study B selector.
- Metrics comparison table.
- Equity curve overlay.
- Drawdown comparison.
- Parameter comparison.
- AI comparison summary if existing AI infrastructure makes this easy.

### Acceptance Criteria

- User can find previous studies quickly.
- User can tag/favorite/archive studies.
- User can compare two completed studies.
- Comparison uses real saved result data.
- Build passes.

## Phase 4: Fundamental Data And Multi-Factor Research Foundation

### Goal

Move from price-only momentum research into basic multi-factor equity research.

Do not attempt a full institutional-grade point-in-time fundamental database in one step. Phase 4 should establish the foundation.

### Data Source Decision

Before implementation, choose one primary standardized fundamental API.

Recommended order:

1. FMP if low cost and fast implementation matter most.
2. EODHD if broad coverage and reasonable cost matter.
3. Polygon if API quality matters and budget allows.
4. SEC only if willing to spend more engineering time on normalization.

Do not start Phase 4 until the data source is explicitly selected.

### Features

- Add a fundamentals provider abstraction.
- Add provider configuration through environment variables.
- Fetch basic company fundamentals for US equities.
- Cache fundamentals in DB.
- Add Value factors:
  - PE.
  - PB.
  - PS.
  - EV/EBITDA if available.
- Add Quality factors:
  - ROE.
  - ROIC if available.
  - Gross margin.
  - Debt/equity.
- Add Growth factors:
  - Revenue growth.
  - EPS growth if available.
- Add factor coverage report.
- Add multi-factor score:
  - Value.
  - Quality.
  - Momentum.
  - Equal-weight composite.

### Required Guardrails

- Show source and timestamp for every fundamental field.
- Show missing field coverage.
- Add a conservative reporting lag for fundamentals.
- Clearly state that this is not yet full point-in-time institutional data.
- Do not claim survivorship-bias-free results.

### Acceptance Criteria

- Fundamental provider can fetch and cache data for the current US large-cap universe.
- Multi-factor study can compute Value + Quality + Momentum scores.
- Result page shows factor coverage.
- Result page explains data limitations.
- Existing price-only momentum studies still work.
- Build passes.

## Explicitly Deferred Until Later

Do not implement in these three phases:

- Hong Kong market.
- Futu OpenD integration.
- Live trading.
- Broker order placement.
- Redis/BullMQ unless current in-process runner is proven insufficient.
- PDF export.
- Public sharing links.
- Team collaboration.
- Mobile native app.
- Options strategies.
- Intraday data.

## Execution Principle

Each phase should leave the product in a usable state.

Do not create large unfinished scaffolds for future phases.

Prefer small, complete, tested increments.

