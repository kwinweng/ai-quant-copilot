# AI Quant Copilot — Fix Plan

## Status: Stage 1 Prototype Complete

All 6 routes are implemented and `npm run build` passes clean.

---

## Completed Tasks

- [x] Bootstrap project (Next.js + shadcn/ui + Recharts + Tailwind)
- [x] `/` — Research Dashboard with active study panel and recent studies list
- [x] `/studies/new` — New Study form with hypothesis textarea and parameter fields
- [x] `/studies/plan` — Research Plan Confirmation with factor definitions, data requirements, risk checks
- [x] `/studies/running` — Study Execution with **animated** pipeline steps (advance every ~1s, auto-navigate to result after ~13 real seconds)
- [x] `/studies/demo-result` — Full result report: metrics table, equity curve, drawdown, annual returns, factor diagnostics, data coverage, next experiments
- [x] `/data-sources` — Data Source Check with mock connection test and activity log
- [x] Nav component with active-path highlighting
- [x] Mock data files: studies, plan, execution, results, datasources
- [x] shadcn/ui components: Badge (with running/success/danger variants), Button, Card, Progress

---

## Known Remaining Polish (Low Priority)

- [x] MetricRow comparison in demo-result: fixed CAGR, Max Drawdown, Annual Vol, Alpha — added `strategyNum`/`spyNum` props; corrected Max Drawdown `isPositiveGood` direction
- [ ] No mobile hamburger menu — nav items hidden below sm breakpoint
- [ ] Equity curve uses `filter((_, i) => i % 2 === 0)` subsampling; could expose more granular monthly data
- [ ] Running page "remaining time" estimate is approximate (based on fixed sim speed, not wall-clock)

---

## Constraints Verified

- No real broker login
- No live trading
- No real LLM calls
- No real database
- No user authentication
- All data from `src/data/*.ts` mock files
