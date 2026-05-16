import { MonthKey, MonthlyPrices, buildMonthAxis } from "./prices";
import { FactorScores, rankByFactor } from "./factor";
import type { UniverseProvider } from "./universeProvider";
import {
  costFunctionForMode,
  type CostFunction,
  type CostMode,
} from "./costModel";
import {
  applyConstraints,
  type PortfolioConstraints,
} from "@/lib/portfolio/constraints";
import { sectorAllocationFromWeights } from "@/lib/portfolio/sectorMap";

export interface BacktestInput {
  prices: MonthlyPrices;
  benchmark: Map<MonthKey, number>;
  scores: FactorScores;
  startDate: Date;
  endDate: Date;
  rebalanceMonths: number; // 1 = monthly, 3 = quarterly
  txCostBps: number; // single-sided transaction cost in basis points
  topQuintilePct?: number; // default 0.2 → top 20%
  // Phase 7: cost model selection. "simple" preserves old uniform-bps
  // behavior (default for backward compatibility with pre-Phase-7 studies);
  // "tiered" applies per-ticker liquidity-tier spreads + sqrt(turnover)
  // market impact + user commission on top.
  costMode?: CostMode;
  // Phase 14: optional portfolio risk constraints (single-position cap,
  // sector cap). Empty / undefined preserves the original equal-weight
  // behavior so old studies replay bit-for-bit.
  constraints?: PortfolioConstraints;
  // Phase 6.5: PIT universe filter. When provided, the rebalance candidate
  // pool at decision month M is intersected with `universeProvider.tickersAt(M)`
  // before topN selection — this is what enforces "you can only hold what was
  // actually in the index at decision time". Omitting (or passing a static
  // provider that returns the same list every month) keeps the legacy
  // behavior of "every scored ticker is eligible every month".
  universeProvider?: UniverseProvider;
}

export interface MonthlyEquityPoint {
  date: MonthKey;
  strategy: number;
  benchmark: number;
}

export interface MonthlyReturnPoint {
  date: MonthKey;
  strategy: number;
  benchmark: number;
  active: number;
}

export interface RebalanceEvent {
  date: MonthKey;
  holdings: string[];
  turnover: number; // 0..1, one-way fraction of portfolio replaced
  txCostApplied: number; // fractional drag (e.g. 0.0006 for 6 bps)
  // Phase 14: present when constraints are configured. Records the actual
  // weights + sector mix used for this rebalance after caps applied.
  weights?: Record<string, number>;
  sectorAllocation?: Record<string, number>;
  constrained?: boolean;
}

export interface BacktestPath {
  axis: MonthKey[]; // months actually simulated (post warm-up, in [startDate, endDate])
  equity: MonthlyEquityPoint[];
  returns: MonthlyReturnPoint[];
  rebalances: RebalanceEvent[];
  // Optional convenience: holdings actually held during each month (after the
  // most recent rebalance). Used by factor diagnostics so we can compute
  // top/bottom quintile spread.
  holdingsByMonth: Record<MonthKey, string[]>;
}

interface PortfolioWeights {
  [ticker: string]: number;
}

function diffWeights(prev: PortfolioWeights, next: PortfolioWeights): number {
  const keys = new Set<string>([...Object.keys(prev), ...Object.keys(next)]);
  let l1 = 0;
  for (const k of keys) {
    l1 += Math.abs((next[k] ?? 0) - (prev[k] ?? 0));
  }
  // L1 distance over weights = 2 × one-way turnover, so divide by 2.
  return l1 / 2;
}

function topNFromRanked(
  ranked: { ticker: string; score: number }[],
  n: number,
): string[] {
  return ranked.slice(0, Math.max(1, n)).map((r) => r.ticker);
}

function monthlyReturnFor(
  ticker: string,
  prevMonth: MonthKey,
  thisMonth: MonthKey,
  prices: MonthlyPrices,
): number | null {
  const series = prices[ticker];
  if (!series) return null;
  const p0 = series.get(prevMonth);
  const p1 = series.get(thisMonth);
  if (p0 == null || p1 == null || p0 <= 0 || !Number.isFinite(p0) || !Number.isFinite(p1)) {
    return null;
  }
  return p1 / p0 - 1;
}

// Run the backtest. Strategy:
//   1. At end of month M (decision month), if M is a rebalance month, rank
//      tickers by factor[M], pick top quintile, equal-weight.
//   2. Hold those weights through month M+1 (the "performance month").
//   3. Strategy return for M+1 = mean of monthly returns of held tickers,
//      minus tx cost on the rebalance month (one-way × bps).
//   4. Otherwise hold prior weights and let them drift (we keep equal weight
//      between rebalances rather than letting weights drift; this matches the
//      "equal-weight reset every period" convention common in factor research).
export function runBacktest(input: BacktestInput): BacktestPath {
  const {
    prices,
    benchmark,
    scores,
    startDate,
    endDate,
    rebalanceMonths,
    txCostBps,
    topQuintilePct = 0.2,
    costMode = "simple",
    constraints,
    universeProvider,
  } = input;
  const costFn: CostFunction = costFunctionForMode(costMode);
  // Phase 14: detect whether any cap is actually configured so we can keep
  // the legacy equal-weight code path unchanged when constraints are absent
  // (guarantees bit-for-bit reproducibility of old studies).
  const hasConstraints =
    !!constraints &&
    (
      (typeof constraints.maxPositionWeight === "number" &&
        constraints.maxPositionWeight < 1) ||
      (typeof constraints.maxSectorWeight === "number" &&
        constraints.maxSectorWeight < 1)
    );

  const fullAxis = buildMonthAxis(startDate, endDate);
  const tickers = Object.keys(scores);

  // Sprint #5 H3: drive the loop off the FULL month axis (not the filtered
  // usableMonths), starting from the first month any ticker has a score.
  // This guarantees every adjacent (decisionMonth, performanceMonth) pair is
  // exactly 1 calendar month apart — even if some intermediate month happens
  // to have zero scores anywhere in the universe (rare for our 30 mega-caps,
  // but possible with extended universes or pre-2008 backtest windows).
  // Months where no ticker has a score: skip rebalance, hold existing weights.
  const hasAnyScore = (month: MonthKey) =>
    tickers.some((t) => scores[t].has(month));
  const firstUsableIdx = fullAxis.findIndex(hasAnyScore);
  if (firstUsableIdx === -1 || firstUsableIdx >= fullAxis.length - 1) {
    return {
      axis: [],
      equity: [],
      returns: [],
      rebalances: [],
      holdingsByMonth: {},
    };
  }
  const axisMonths = fullAxis.slice(firstUsableIdx);

  const equity: MonthlyEquityPoint[] = [];
  const returns: MonthlyReturnPoint[] = [];
  const rebalances: RebalanceEvent[] = [];
  const holdingsByMonth: Record<MonthKey, string[]> = {};

  // Initial value 100 on the first usable month (pre-trade).
  const firstMonth = axisMonths[0];
  let strategyValue = 100;
  let benchmarkValue = 100;
  equity.push({ date: firstMonth, strategy: 100, benchmark: 100 });

  let weights: PortfolioWeights = {};
  let monthsSinceRebalance = 0;

  // Phase 6.5: when a time-varying universe is in effect, topN is computed
  // per-rebalance from the eligible PIT pool size (not the static full
  // tickers list), so "top 20%" means 20% of currently-indexed names rather
  // than 20% of every name we ever saw. For static providers the per-month
  // eligible set equals the full tickers list, so this collapses back to
  // the original constant — bit-for-bit replay of pre-Phase-6.5 studies.
  const fullUniverseSize = tickers.length;

  for (let i = 0; i < axisMonths.length - 1; i++) {
    const decisionMonth = axisMonths[i];
    const performanceMonth = axisMonths[i + 1];
    // If this decision month has no scores anywhere, hold previous weights;
    // skip the rebalance attempt but still compute the held-portfolio's
    // performance for performanceMonth so the equity series stays in sync
    // with the calendar month axis.
    const decisionHasScores = hasAnyScore(decisionMonth);
    const isRebalance =
      decisionHasScores &&
      (i === 0 || monthsSinceRebalance >= rebalanceMonths);

    if (isRebalance) {
      const ranked = rankByFactor(scores, decisionMonth);
      // Phase 6.5: enforce PIT eligibility. Static providers return the full
      // list and this filter is a no-op; time-varying providers shrink the
      // pool to "what was actually in the index at decisionMonth".
      const eligibleAtMonth = universeProvider
        ? new Set(universeProvider.tickersAt(decisionMonth))
        : null;
      const eligibleRanked = eligibleAtMonth
        ? ranked.filter((r) => eligibleAtMonth.has(r.ticker))
        : ranked;
      const eligiblePoolSize = eligibleAtMonth
        ? eligibleAtMonth.size
        : fullUniverseSize;
      const topN = Math.max(1, Math.round(eligiblePoolSize * topQuintilePct));
      const picks = topNFromRanked(eligibleRanked, topN);
      let w: PortfolioWeights;
      let wasConstrained = false;
      if (hasConstraints) {
        const applied = applyConstraints(picks, constraints!);
        w = applied.weights;
        wasConstrained = applied.constrained;
      } else {
        w = {};
        const each = picks.length > 0 ? 1 / picks.length : 0;
        for (const t of picks) w[t] = each;
      }
      const turnover = diffWeights(weights, w);
      // Phase 7: drag now goes through the configured cost model (simple
      // = uniform bps × turnover; tiered = per-ticker spread + sqrt-impact +
      // user commission).
      const prevHoldings = Object.keys(weights);
      const drag = costFn({
        prevHoldings,
        nextHoldings: picks,
        turnover,
        userCommissionBps: txCostBps,
      });
      weights = w;
      monthsSinceRebalance = 1;
      const evt: RebalanceEvent = {
        date: decisionMonth,
        holdings: picks,
        turnover,
        txCostApplied: drag,
      };
      // Phase 14: only attach weights / sector mix when constraints are
      // actually in effect — otherwise we'd bloat legacy result JSON with
      // redundant equal-weight data.
      if (hasConstraints) {
        evt.weights = w;
        evt.sectorAllocation = sectorAllocationFromWeights(w);
        evt.constrained = wasConstrained;
      }
      rebalances.push(evt);
      // Apply the drag to next month's strategy return.
      // (recorded inline in the return computation below via `pendingDrag`)
    } else {
      monthsSinceRebalance++;
    }

    holdingsByMonth[performanceMonth] = Object.keys(weights);

    // Compute strategy return for performanceMonth = mean of held tickers'
    // returns. Tickers without data this month drop out and are renormalized
    // (equivalent to assuming the missing return is 0 — same convention as
    // most academic backtest code; alternative would be to penalize, but for
    // 30 mega-caps with full Yahoo coverage this is rare).
    const heldTickers = Object.keys(weights);
    let stratRet = 0;
    let totalWeight = 0;
    for (const t of heldTickers) {
      const r = monthlyReturnFor(t, decisionMonth, performanceMonth, prices);
      if (r == null) continue;
      stratRet += weights[t] * r;
      totalWeight += weights[t];
    }
    if (totalWeight > 0 && totalWeight < 1) {
      // Normalize when some holdings had missing returns.
      stratRet /= totalWeight;
    }

    const lastRebalance = rebalances[rebalances.length - 1];
    const drag =
      lastRebalance && lastRebalance.date === decisionMonth
        ? lastRebalance.txCostApplied
        : 0;
    stratRet -= drag;

    const benchPrev = benchmark.get(decisionMonth);
    const benchNow = benchmark.get(performanceMonth);
    const benchRet =
      benchPrev != null && benchNow != null && benchPrev > 0
        ? benchNow / benchPrev - 1
        : 0;

    strategyValue *= 1 + stratRet;
    benchmarkValue *= 1 + benchRet;

    returns.push({
      date: performanceMonth,
      strategy: stratRet,
      benchmark: benchRet,
      active: stratRet - benchRet,
    });
    equity.push({
      date: performanceMonth,
      strategy: round2(strategyValue),
      benchmark: round2(benchmarkValue),
    });
  }

  return {
    axis: axisMonths,
    equity,
    returns,
    rebalances,
    holdingsByMonth,
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
