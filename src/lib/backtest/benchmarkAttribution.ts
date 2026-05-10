// Phase 9: multi-benchmark factor attribution.
//
// One number ("CAGR vs SPY = +2.3%") doesn't tell you whether the alpha is
// (a) genuine factor harvesting or (b) just disguised market / momentum
// beta. This module runs a simple OLS regression of strategy excess returns
// on each of several factor-ETF proxies and surfaces alpha / beta / R²
// per benchmark — so users can see where their "alpha" actually lives.
//
// ETFs used as factor proxies (cheap + free, all on Yahoo since 2014):
//   SPY  — broad market (S&P 500)
//   QQQ  — large-cap growth / Nasdaq-100
//   IWM  — small-cap (Russell 2000)
//   MTUM — momentum factor (iShares MSCI USA Momentum)
//   IUSV — large-cap value (iShares Core S&P U.S. Value)
//
// Method: simple two-variable OLS (strategy_ret = alpha + beta × benchmark_ret + noise).
// Not a multi-factor regression — that requires constructing orthogonal
// factor returns and is materially more complex (deferred to Phase 9+).
// Single-benchmark beta still answers the practical question: "is my alpha
// just X-factor exposure?"

import type { MonthKey, MonthlyPrices } from "./prices";

export interface BenchmarkAttribution {
  ticker: string;
  label: string;
  description: string;
  // Total months that BOTH series have data for. <2 → skipped.
  monthsObserved: number;
  // Annualized alpha (%) and beta from OLS:
  //    strat_ret_t = alpha/12 + beta × bench_ret_t + e_t
  // We annualize alpha by × 12 × 100; beta is already dimensionless.
  alphaAnnualPct: number;
  beta: number;
  // R² ∈ [0, 1] — fraction of strategy variance explained by this benchmark.
  rSquared: number;
  // Sample correlation. R² = correlation² for two-variable OLS.
  correlation: number;
}

export interface BenchmarkAttributionReport {
  benchmarks: BenchmarkAttribution[];
  generatedAt: string;
}

// ETF list. Order = display order on the result page.
export const ATTRIBUTION_BENCHMARKS: ReadonlyArray<{
  ticker: string;
  label: string;
  description: string;
}> = [
  {
    ticker: "SPY",
    label: "市场（S&P 500）",
    description: "宽基美股大盘；β 接近 1 时策略就是大盘代理",
  },
  {
    ticker: "QQQ",
    label: "Nasdaq-100（大盘成长）",
    description: "Tech / 成长偏多；高 β 暗示策略其实是科技敞口",
  },
  {
    ticker: "IWM",
    label: "Russell 2000（小盘）",
    description: "小盘代理；高 β 说明策略向小盘倾斜（可能不可持续）",
  },
  {
    ticker: "MTUM",
    label: "动量（iShares Momentum）",
    description: "MSCI USA 动量因子；高 β 说明策略 alpha 来自动量因子暴露",
  },
  {
    ticker: "IUSV",
    label: "价值（iShares S&P Value）",
    description: "大盘价值因子；高 β 说明策略 alpha 来自价值因子暴露",
  },
];

// ============================================================
// Math helpers
// ============================================================

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function ols(
  ys: number[],
  xs: number[],
): {
  alpha: number;
  beta: number;
  rSquared: number;
  correlation: number;
} {
  // Two-variable OLS: y = alpha + beta × x + e
  const n = Math.min(ys.length, xs.length);
  if (n < 2) return { alpha: 0, beta: 0, rSquared: 0, correlation: 0 };

  const y = ys.slice(0, n);
  const x = xs.slice(0, n);
  const my = mean(y);
  const mx = mean(x);

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dy = y[i] - my;
    const dx = x[i] - mx;
    cov += dy * dx;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0) return { alpha: my, beta: 0, rSquared: 0, correlation: 0 };

  const beta = cov / varX;
  const alpha = my - beta * mx;
  const correlation = varY > 0 ? cov / Math.sqrt(varX * varY) : 0;
  const rSquared = correlation * correlation;
  return { alpha, beta, rSquared, correlation };
}

// ============================================================
// Build report
// ============================================================

/**
 * Compute monthly return series from a price Map.
 * Returns aligned to keys[i] = ret_at_keys[i] = price_at_keys[i] / price_at_keys[i-1] − 1.
 * The first key has no return (series starts at index 1).
 */
function pricesToReturns(
  axis: MonthKey[],
  prices: Map<MonthKey, number>,
): { date: MonthKey; ret: number }[] {
  const out: { date: MonthKey; ret: number }[] = [];
  let prev: number | undefined;
  for (const m of axis) {
    const p = prices.get(m);
    if (typeof p === "number" && Number.isFinite(p) && p > 0 && prev != null && prev > 0) {
      out.push({ date: m, ret: p / prev - 1 });
    }
    if (typeof p === "number" && Number.isFinite(p) && p > 0) {
      prev = p;
    }
  }
  return out;
}

/**
 * Align two monthly return series on common dates and run OLS.
 */
export function attributeAgainstBenchmark(
  stratReturns: { date: MonthKey; strategy: number }[],
  benchmarkPrices: Map<MonthKey, number>,
  axis: MonthKey[],
): {
  monthsObserved: number;
  alphaAnnualPct: number;
  beta: number;
  rSquared: number;
  correlation: number;
} {
  const benchReturns = pricesToReturns(axis, benchmarkPrices);
  const benchByDate = new Map(benchReturns.map((r) => [r.date, r.ret]));

  const ys: number[] = [];
  const xs: number[] = [];
  for (const r of stratReturns) {
    const b = benchByDate.get(r.date);
    if (b != null && Number.isFinite(b)) {
      ys.push(r.strategy);
      xs.push(b);
    }
  }
  if (ys.length < 2) {
    return {
      monthsObserved: ys.length,
      alphaAnnualPct: 0,
      beta: 0,
      rSquared: 0,
      correlation: 0,
    };
  }
  const fit = ols(ys, xs);
  return {
    monthsObserved: ys.length,
    // Annualize alpha: monthly alpha × 12 × 100 → percent per year.
    alphaAnnualPct: round2(fit.alpha * 12 * 100),
    beta: round2(fit.beta),
    rSquared: round2(fit.rSquared),
    correlation: round2(fit.correlation),
  };
}

export function buildBenchmarkAttribution(
  stratReturns: { date: MonthKey; strategy: number }[],
  benchmarkPrices: Record<string, Map<MonthKey, number>>,
  axis: MonthKey[],
): BenchmarkAttributionReport {
  const benchmarks: BenchmarkAttribution[] = [];
  for (const def of ATTRIBUTION_BENCHMARKS) {
    const series = benchmarkPrices[def.ticker];
    if (!series || series.size === 0) {
      // Couldn't fetch — emit a zero row so the UI can show "data unavailable".
      benchmarks.push({
        ticker: def.ticker,
        label: def.label,
        description: def.description,
        monthsObserved: 0,
        alphaAnnualPct: 0,
        beta: 0,
        rSquared: 0,
        correlation: 0,
      });
      continue;
    }
    const fit = attributeAgainstBenchmark(stratReturns, series, axis);
    benchmarks.push({
      ticker: def.ticker,
      label: def.label,
      description: def.description,
      ...fit,
    });
  }
  return {
    benchmarks,
    generatedAt: new Date().toISOString(),
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// Re-export the price-helper for test use; non-public to runtime callers.
export const _internal = { pricesToReturns, ols };

// Avoid unused imports failing lint.
export type { MonthlyPrices };
