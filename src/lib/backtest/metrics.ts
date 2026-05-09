import {
  BacktestPath,
  MonthlyEquityPoint,
  MonthlyReturnPoint,
} from "./engine";
import { FactorScores } from "./factor";
import { MonthKey, MonthlyPrices } from "./prices";

export interface SummaryMetrics {
  cagr: number; // annualized %, e.g. 12.4
  sharpe: number; // unitless
  maxDrawdown: number; // negative %, e.g. -21.3
  calmar: number;
  annualVol: number; // %, e.g. 13.6
  beta: number;
  alpha: number; // annualized %
  informationRatio: number | null;
  turnover: number | null; // annualized one-way turnover %, e.g. 68
  winRate: number | null; // pct of positive months
}

export interface ResultMetrics {
  strategy: SummaryMetrics;
  spy: SummaryMetrics;
}

export interface DrawdownPoint {
  date: MonthKey;
  strategy: number; // negative %
  spy: number;
}

export interface AnnualReturnPoint {
  year: string;
  strategy: number; // %
  spy: number;
}

export interface FactorDiagnostic {
  factor: string;
  ic: number;
  icir: number;
  topQuintileReturn: number; // annualized %
  bottomQuintileReturn: number;
  spread: number;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1);
}

function stddev(xs: number[]): number {
  return Math.sqrt(variance(xs));
}

function covariance(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / (xs.length - 1);
}

function correlation(xs: number[], ys: number[]): number {
  const sx = stddev(xs);
  const sy = stddev(ys);
  if (sx === 0 || sy === 0) return 0;
  return covariance(xs, ys) / (sx * sy);
}

function cagrFromEquity(equity: MonthlyEquityPoint[], key: "strategy" | "benchmark"): number {
  if (equity.length < 2) return 0;
  const first = equity[0][key];
  const last = equity[equity.length - 1][key];
  const months = equity.length - 1;
  if (first <= 0 || last <= 0 || months <= 0) return 0;
  const years = months / 12;
  return ((last / first) ** (1 / years) - 1) * 100;
}

function maxDrawdown(equity: MonthlyEquityPoint[], key: "strategy" | "benchmark"): number {
  let peak = equity[0]?.[key] ?? 0;
  let mdd = 0;
  for (const p of equity) {
    const v = p[key];
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (v - peak) / peak;
      if (dd < mdd) mdd = dd;
    }
  }
  return mdd * 100;
}

function drawdownSeries(equity: MonthlyEquityPoint[]): DrawdownPoint[] {
  let stratPeak = equity[0]?.strategy ?? 0;
  let benchPeak = equity[0]?.benchmark ?? 0;
  return equity.map((p) => {
    if (p.strategy > stratPeak) stratPeak = p.strategy;
    if (p.benchmark > benchPeak) benchPeak = p.benchmark;
    const stratDd = stratPeak > 0 ? ((p.strategy - stratPeak) / stratPeak) * 100 : 0;
    const benchDd = benchPeak > 0 ? ((p.benchmark - benchPeak) / benchPeak) * 100 : 0;
    return { date: p.date, strategy: round2(stratDd), spy: round2(benchDd) };
  });
}

function annualReturnsFromEquity(equity: MonthlyEquityPoint[]): AnnualReturnPoint[] {
  // Group by calendar year. Year return = end-of-year value / start-of-year value - 1.
  const byYear = new Map<string, MonthlyEquityPoint[]>();
  for (const p of equity) {
    const year = p.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(p);
  }
  const out: AnnualReturnPoint[] = [];
  let prevStrat: number | null = null;
  let prevBench: number | null = null;
  // Walk in chronological order. The "open" of year Y is the close of last
  // month of Y-1 (when available); for the very first year we use the first
  // observation.
  const years = [...byYear.keys()].sort();
  for (const year of years) {
    const points = byYear.get(year)!;
    const last = points[points.length - 1];
    const openStrat = prevStrat ?? points[0].strategy;
    const openBench = prevBench ?? points[0].benchmark;
    if (openStrat > 0 && openBench > 0) {
      out.push({
        year,
        strategy: round2((last.strategy / openStrat - 1) * 100),
        spy: round2((last.benchmark / openBench - 1) * 100),
      });
    }
    prevStrat = last.strategy;
    prevBench = last.benchmark;
  }
  return out;
}

function summaryFor(
  returns: number[],
  benchReturns: number[],
  cagr: number,
  mdd: number,
): SummaryMetrics {
  const sharpe = stddev(returns) > 0 ? (mean(returns) / stddev(returns)) * Math.sqrt(12) : 0;
  const annualVol = stddev(returns) * Math.sqrt(12) * 100;
  const beta = variance(benchReturns) > 0 ? covariance(returns, benchReturns) / variance(benchReturns) : 0;
  const alpha = (mean(returns) - beta * mean(benchReturns)) * 12 * 100;
  const active = returns.map((r, i) => r - benchReturns[i]);
  const ir = stddev(active) > 0 ? (mean(active) / stddev(active)) * Math.sqrt(12) : 0;
  const winRate = returns.length > 0 ? (returns.filter((r) => r > 0).length / returns.length) * 100 : 0;
  const calmar = mdd < 0 ? cagr / Math.abs(mdd) : 0;
  return {
    cagr: round2(cagr),
    sharpe: round2(sharpe),
    maxDrawdown: round2(mdd),
    calmar: round2(calmar),
    annualVol: round2(annualVol),
    beta: round2(beta),
    alpha: round2(alpha),
    informationRatio: round2(ir),
    turnover: null,
    winRate: round2(winRate),
  };
}

export function computeResultMetrics(path: BacktestPath): ResultMetrics {
  const stratReturns = path.returns.map((r) => r.strategy);
  const benchReturns = path.returns.map((r) => r.benchmark);
  const stratCagr = cagrFromEquity(path.equity, "strategy");
  const benchCagr = cagrFromEquity(path.equity, "benchmark");
  const stratMdd = maxDrawdown(path.equity, "strategy");
  const benchMdd = maxDrawdown(path.equity, "benchmark");

  const strategy = summaryFor(stratReturns, benchReturns, stratCagr, stratMdd);
  const spyMetrics = summaryFor(benchReturns, benchReturns, benchCagr, benchMdd);
  // Benchmark relative to itself: alpha=0, beta=1, IR undefined-ish, no
  // turnover, no winRate (we don't display these for SPY in the UI).
  spyMetrics.beta = 1;
  spyMetrics.alpha = 0;
  spyMetrics.informationRatio = null;
  spyMetrics.turnover = null;
  spyMetrics.winRate = null;

  // Annualized one-way turnover for the strategy.
  if (path.rebalances.length > 0 && path.equity.length > 1) {
    const totalTurnover = path.rebalances.reduce((s, r) => s + r.turnover, 0);
    const months = path.equity.length - 1;
    strategy.turnover = round2((totalTurnover / months) * 12 * 100);
  } else {
    strategy.turnover = 0;
  }

  return { strategy, spy: spyMetrics };
}

export function computeDrawdownSeries(path: BacktestPath) {
  return drawdownSeries(path.equity);
}

export function computeAnnualReturns(path: BacktestPath) {
  return annualReturnsFromEquity(path.equity);
}

export function computeEquityCurve(
  path: BacktestPath,
): { date: MonthKey; strategy: number; spy: number }[] {
  return path.equity.map((p) => ({
    date: p.date,
    strategy: p.strategy,
    spy: p.benchmark,
  }));
}

// =====================================================================
// Factor diagnostics — IC, IC IR, top vs bottom quintile spread
// =====================================================================

function pearson(xs: number[], ys: number[]): number {
  return correlation(xs, ys);
}

function annualize(monthlyMean: number): number {
  return ((1 + monthlyMean) ** 12 - 1) * 100;
}

function quintileReturn(
  scores: FactorScores,
  prices: MonthlyPrices,
  axis: MonthKey[],
  pickFn: (
    ranked: { ticker: string; score: number }[],
    qSize: number,
  ) => string[],
): number {
  // Average forward 1-month return for the picked quintile across all decision
  // months. Returns annualized %.
  const universe = Object.keys(scores);
  const qSize = Math.max(1, Math.round(universe.length * 0.2));
  const monthlyReturns: number[] = [];

  for (let i = 0; i < axis.length - 1; i++) {
    const decision = axis[i];
    const next = axis[i + 1];
    const ranked: { ticker: string; score: number }[] = [];
    for (const t of universe) {
      const v = scores[t].get(decision);
      if (v == null || !Number.isFinite(v)) continue;
      ranked.push({ ticker: t, score: v });
    }
    if (ranked.length < qSize) continue;
    ranked.sort((a, b) => b.score - a.score);
    const picks = pickFn(ranked, qSize);
    let sum = 0;
    let cnt = 0;
    for (const t of picks) {
      const series = prices[t];
      if (!series) continue;
      const p0 = series.get(decision);
      const p1 = series.get(next);
      if (p0 == null || p1 == null || p0 <= 0) continue;
      sum += p1 / p0 - 1;
      cnt++;
    }
    if (cnt > 0) monthlyReturns.push(sum / cnt);
  }

  if (monthlyReturns.length === 0) return 0;
  return round2(annualize(mean(monthlyReturns)));
}

export function computeFactorDiagnostics(
  scores: FactorScores,
  prices: MonthlyPrices,
  axis: MonthKey[],
): FactorDiagnostic[] {
  // Per-month IC: pearson(score[M], forwardReturn[M→M+1]) across tickers.
  const universe = Object.keys(scores);
  const ics: number[] = [];
  for (let i = 0; i < axis.length - 1; i++) {
    const decision = axis[i];
    const next = axis[i + 1];
    const xs: number[] = [];
    const ys: number[] = [];
    for (const t of universe) {
      const score = scores[t].get(decision);
      const series = prices[t];
      if (score == null || !Number.isFinite(score) || !series) continue;
      const p0 = series.get(decision);
      const p1 = series.get(next);
      if (p0 == null || p1 == null || p0 <= 0) continue;
      xs.push(score);
      ys.push(p1 / p0 - 1);
    }
    if (xs.length >= 5) ics.push(pearson(xs, ys));
  }
  const icMean = ics.length > 0 ? mean(ics) : 0;
  const icStd = ics.length > 1 ? stddev(ics) : 0;
  const icIr = icStd > 0 ? (icMean / icStd) * Math.sqrt(12) : 0;

  const topRet = quintileReturn(scores, prices, axis, (ranked, q) =>
    ranked.slice(0, q).map((r) => r.ticker),
  );
  const bottomRet = quintileReturn(scores, prices, axis, (ranked, q) =>
    ranked.slice(-q).map((r) => r.ticker),
  );

  return [
    {
      factor: "12-1 动量",
      ic: round3(icMean),
      icir: round2(icIr),
      topQuintileReturn: topRet,
      bottomQuintileReturn: bottomRet,
      spread: round2(topRet - bottomRet),
    },
  ];
}

// Round equity curve once at the end so the JSON sent to the browser doesn't
// carry 14-digit decimals.
export function roundEquityCurve(
  curve: { date: string; strategy: number; spy: number }[],
): { date: string; strategy: number; spy: number }[] {
  return curve.map((p) => ({
    date: p.date,
    strategy: round2(p.strategy),
    spy: round2(p.spy),
  }));
}

export type { MonthlyEquityPoint, MonthlyReturnPoint };
