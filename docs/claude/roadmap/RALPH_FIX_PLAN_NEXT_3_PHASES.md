# Ralph Fix Plan: Next 3 Phases

## Phase Gate Rule

Work sequentially.

Do not begin Phase 3.2 until Phase 3.1 is complete and `npm run build` passes.

Do not begin Phase 4 until Phase 3.2 is complete, `npm run build` passes, and the user has selected a fundamentals data provider.

## Phase 3.1: Real Backtest Research Experience

### High Priority

- [ ] Inspect current Phase 3 backtest result JSON shape and Study model.
- [ ] Extend backtest result output with `dataQuality`.
- [ ] Extend backtest result output with `rebalanceHistory`.
- [ ] Ensure result output has `annualReturns`.
- [ ] Ensure result output has `monthlyReturns`.
- [ ] Derive best 5 and worst 5 months from monthly returns.
- [ ] Update Result page with Data Quality & Bias panel.
- [ ] Update Result page with Annual Performance section.
- [ ] Update Result page with Best/Worst Months section.
- [ ] Update Result page with Rebalance History section.
- [ ] Add Copy & Modify action.
- [ ] Implement copied study creation or prefilled new-study navigation.
- [ ] Add Markdown export.
- [ ] Run `npm run build` and fix errors.

### Medium Priority

- [ ] Add Parameter Sensitivity section.
- [ ] Implement sensitivity runs for 6-1, 9-1, and 12-1 momentum.
- [ ] Include monthly vs quarterly rebalance sensitivity.
- [ ] Include top 10%, 20%, and 30% bucket sensitivity.
- [ ] Persist sensitivity result into existing study result JSON.

### Phase 3.1 Acceptance

- [ ] Phase 3 real backtest still works.
- [ ] Result page shows the new research sections.
- [ ] Copy & Modify works.
- [ ] Markdown export works.
- [ ] Build passes.

## Phase 3.2: Experiment Management And Comparison

### High Priority

- [ ] Inspect current Dashboard and study listing UX.
- [ ] Add study search by title/hypothesis.
- [ ] Add status filters: Draft, Running, Completed, Failed.
- [ ] Add factor/type filters: Momentum, Sensitivity, Baseline.
- [ ] Add sort options: Created date, CAGR, Sharpe, MaxDD.
- [ ] Add favorite study action.
- [ ] Add archive study action.
- [ ] Add tags to studies using the simplest compatible existing model change.
- [ ] Add Compare Studies page or modal.
- [ ] Let user select two completed studies.
- [ ] Show side-by-side metrics comparison.
- [ ] Show equity curve overlay.
- [ ] Show drawdown comparison.
- [ ] Show parameter difference table.
- [ ] Run `npm run build` and fix errors.

### Medium Priority

- [ ] Add "Promising" saved view for favorited high-quality studies.
- [ ] Add AI comparison summary only if existing AI route can be reused cleanly.
- [ ] Add empty states for no comparable studies.

### Phase 3.2 Acceptance

- [ ] User can find, filter, sort, favorite, archive, and tag studies.
- [ ] User can compare two completed studies.
- [ ] Comparison uses saved result data.
- [ ] Build passes.

## Phase 4: Fundamental Data And Multi-Factor Research Foundation

### Human Decision Required Before Phase 4

- [ ] User selects primary fundamentals provider: FMP, EODHD, Polygon, or SEC.
- [ ] Environment variable naming is confirmed.
- [ ] Data usage/cost constraints are confirmed.

### High Priority

- [ ] Add fundamentals provider interface.
- [ ] Add selected provider implementation.
- [ ] Add environment variable config for provider API key if needed.
- [ ] Add DB cache for fundamentals.
- [ ] Fetch fundamentals for the current US large-cap universe.
- [ ] Add field coverage report.
- [ ] Add Value factor definitions: PE, PB, PS, EV/EBITDA when available.
- [ ] Add Quality factor definitions: ROE, ROIC when available, gross margin, debt/equity.
- [ ] Add Growth factor definitions: revenue growth, EPS growth when available.
- [ ] Add simple multi-factor composite: Value + Quality + Momentum.
- [ ] Add factor coverage section to result page.
- [ ] Add data limitation warnings for fundamentals.
- [ ] Ensure price-only momentum studies still work.
- [ ] Run `npm run build` and fix errors.

### Medium Priority

- [ ] Add factor weighting controls.
- [ ] Add factor correlation table.
- [ ] Add factor contribution explanation.
- [ ] Add conservative reporting lag setting.

### Phase 4 Acceptance

- [ ] Fundamentals provider fetches and caches data.
- [ ] Multi-factor study can compute composite scores.
- [ ] Result page shows factor coverage and data limitations.
- [ ] Existing Phase 3/3.1/3.2 flows still work.
- [ ] Build passes.

## Explicitly Out Of Scope For All Three Phases

- [ ] Do not add Hong Kong market.
- [ ] Do not add Futu OpenD.
- [ ] Do not add live trading or broker orders.
- [ ] Do not add Redis/BullMQ unless explicitly approved.
- [ ] Do not add PDF export.
- [ ] Do not add public sharing links.
- [ ] Do not add team collaboration.
- [ ] Do not add mobile native app.

