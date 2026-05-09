import { MonthKey, MonthlyPrices, buildMonthAxis } from "./prices";
import { FactorScores, rankByFactor } from "./factor";

export interface BacktestInput {
  prices: MonthlyPrices;
  benchmark: Map<MonthKey, number>;
  scores: FactorScores;
  startDate: Date;
  endDate: Date;
  rebalanceMonths: number; // 1 = monthly, 3 = quarterly
  txCostBps: number; // single-sided transaction cost in basis points
  topQuintilePct?: number; // default 0.2 → top 20%
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
  } = input;

  const fullAxis = buildMonthAxis(startDate, endDate);

  // Trim to months where we actually have a factor for some ticker. Factors
  // need 12 months of history, so the first usable signal lands at startDate
  // only if prices were padded with at least 13 months of pre-roll (handled
  // upstream by fetchMonthlyPrices.lookbackMonths).
  const tickers = Object.keys(scores);
  const usableMonths = fullAxis.filter((m) =>
    tickers.some((t) => scores[t].has(m)),
  );

  // We need at least one decision month + one performance month.
  if (usableMonths.length < 2) {
    return {
      axis: [],
      equity: [],
      returns: [],
      rebalances: [],
      holdingsByMonth: {},
    };
  }

  const equity: MonthlyEquityPoint[] = [];
  const returns: MonthlyReturnPoint[] = [];
  const rebalances: RebalanceEvent[] = [];
  const holdingsByMonth: Record<MonthKey, string[]> = {};

  // Initial value 100 on the first usable month (pre-trade).
  const firstMonth = usableMonths[0];
  let strategyValue = 100;
  let benchmarkValue = 100;
  equity.push({ date: firstMonth, strategy: 100, benchmark: 100 });

  let weights: PortfolioWeights = {};
  let monthsSinceRebalance = 0;

  // First decision happens at firstMonth. Rebalance, then hold.
  const universeSize = tickers.length;
  const topN = Math.max(1, Math.round(universeSize * topQuintilePct));

  for (let i = 0; i < usableMonths.length - 1; i++) {
    const decisionMonth = usableMonths[i];
    const performanceMonth = usableMonths[i + 1];
    const isRebalance = i === 0 || monthsSinceRebalance >= rebalanceMonths;

    if (isRebalance) {
      const ranked = rankByFactor(scores, decisionMonth);
      const picks = topNFromRanked(ranked, topN);
      const w: PortfolioWeights = {};
      const each = picks.length > 0 ? 1 / picks.length : 0;
      for (const t of picks) w[t] = each;
      const turnover = diffWeights(weights, w);
      const drag = turnover * (txCostBps / 10000);
      weights = w;
      monthsSinceRebalance = 1;
      rebalances.push({
        date: decisionMonth,
        holdings: picks,
        turnover,
        txCostApplied: drag,
      });
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
    axis: usableMonths,
    equity,
    returns,
    rebalances,
    holdingsByMonth,
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
