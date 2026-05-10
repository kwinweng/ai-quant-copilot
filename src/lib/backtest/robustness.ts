// Phase 8: robustness analytics — does the strategy's apparent alpha hold
// up under sample-perturbation, time-window splits, and resampling?
//
// Three outputs, all computed AFTER the main backtest from its monthly
// returns + equity series:
//
//   1. In-sample / out-of-sample split — train on first 70% of months,
//      test on the remaining 30%. Real OOS would require re-estimating
//      parameters on the train half and applying to test; we don't do
//      that here (the engine isn't parameterized at the per-rebalance
//      level), so this is "hold-out evaluation" rather than walk-forward
//      cross-validation. Still useful for spotting regime-specific alpha.
//
//   2. Bootstrap confidence intervals — resample the strategy's monthly
//      return series 1000 times with replacement and report a 95% CI for
//      Sharpe / CAGR / Max DD. Captures sampling-noise uncertainty.
//      Standard finance methodology (Politis & Romano 1992 for stationary
//      bootstrap; we use the simpler IID bootstrap which is noticeably
//      less rigorous for autocorrelated returns but adequate for
//      monthly large-cap data).
//
//   3. Subperiod metrics — split the window into halves and report
//      CAGR / Sharpe / Max DD for each half. If the strategy is regime-
//      sensitive (e.g. only worked during 2010s tech rally) this is
//      where it shows up.
//
// All math is pure / synchronous; consumers (runner) just hand in arrays.

import type { BacktestPath } from "./engine";

// ============================================================
// Types
// ============================================================

export interface MetricCI {
  mean: number;
  median: number;
  // 95% confidence interval bounds.
  ci95Lower: number;
  ci95Upper: number;
  // Number of bootstrap iterations. Stored for reproducibility / disclosure.
  iterations: number;
}

export interface SubperiodMetrics {
  label: string; // e.g. "前半 2014-2018"
  startMonth: string;
  endMonth: string;
  monthsCount: number;
  cagr: number;
  sharpe: number;
  maxDrawdown: number;
}

export interface RobustnessReport {
  // Whole-sample metrics, included for cross-reference (matches the main
  // result-page metrics; here so the robustness card is self-contained).
  whole: {
    cagr: number;
    sharpe: number;
    maxDrawdown: number;
    monthsCount: number;
  };
  inSample: SubperiodMetrics;
  outOfSample: SubperiodMetrics;
  subperiods: SubperiodMetrics[];
  bootstrap: {
    sharpe: MetricCI;
    cagr: MetricCI;
    maxDrawdown: MetricCI;
  };
  generatedAt: string;
}

// ============================================================
// Helpers (pure)
// ============================================================

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

function annualizeReturn(monthlyReturns: number[]): number {
  // Geometric annualization from a series of monthly returns.
  if (monthlyReturns.length === 0) return 0;
  const compounded = monthlyReturns.reduce((acc, r) => acc * (1 + r), 1);
  const years = monthlyReturns.length / 12;
  return (compounded ** (1 / years) - 1) * 100;
}

function maxDrawdownFromReturns(monthlyReturns: number[]): number {
  // Reconstruct equity from returns (start at 1.0) and find peak-to-trough.
  let equity = 1;
  let peak = 1;
  let mdd = 0;
  for (const r of monthlyReturns) {
    equity *= 1 + r;
    if (equity > peak) peak = equity;
    if (peak > 0) {
      const dd = (equity - peak) / peak;
      if (dd < mdd) mdd = dd;
    }
  }
  return mdd * 100;
}

function sharpeFromReturns(monthlyReturns: number[]): number {
  const sd = stddev(monthlyReturns);
  if (sd === 0) return 0;
  return (mean(monthlyReturns) / sd) * Math.sqrt(12);
}

function sortAsc(xs: number[]): number[] {
  return [...xs].sort((a, b) => a - b);
}

function percentile(sorted: number[], p: number): number {
  // Linear interpolation between order statistics. p ∈ [0, 1].
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

// ============================================================
// In-sample / out-of-sample split
// ============================================================

/**
 * Split returns into the first `inSampleFraction` (default 70%) for "train"
 * (no actual training in this codebase — it's hold-out evaluation) and the
 * remainder for OOS. Returns metric blocks for each half plus the whole.
 */
export function splitInSampleOutOfSample(
  monthlyDates: string[],
  monthlyReturns: number[],
  inSampleFraction = 0.7,
): { inSample: SubperiodMetrics; outOfSample: SubperiodMetrics } {
  const n = monthlyReturns.length;
  if (n < 2) {
    const empty: SubperiodMetrics = {
      label: "样本内",
      startMonth: "",
      endMonth: "",
      monthsCount: 0,
      cagr: 0,
      sharpe: 0,
      maxDrawdown: 0,
    };
    return { inSample: empty, outOfSample: { ...empty, label: "样本外" } };
  }
  const splitIdx = Math.max(1, Math.floor(n * inSampleFraction));
  const inMonths = monthlyDates.slice(0, splitIdx);
  const inRet = monthlyReturns.slice(0, splitIdx);
  const outMonths = monthlyDates.slice(splitIdx);
  const outRet = monthlyReturns.slice(splitIdx);

  return {
    inSample: {
      label: "样本内（前 70%）",
      startMonth: inMonths[0] ?? "",
      endMonth: inMonths[inMonths.length - 1] ?? "",
      monthsCount: inRet.length,
      cagr: round2(annualizeReturn(inRet)),
      sharpe: round2(sharpeFromReturns(inRet)),
      maxDrawdown: round2(maxDrawdownFromReturns(inRet)),
    },
    outOfSample: {
      label: "样本外（后 30%）",
      startMonth: outMonths[0] ?? "",
      endMonth: outMonths[outMonths.length - 1] ?? "",
      monthsCount: outRet.length,
      cagr: round2(annualizeReturn(outRet)),
      sharpe: round2(sharpeFromReturns(outRet)),
      maxDrawdown: round2(maxDrawdownFromReturns(outRet)),
    },
  };
}

// ============================================================
// Subperiod (halves)
// ============================================================

export function halfSplit(
  monthlyDates: string[],
  monthlyReturns: number[],
): SubperiodMetrics[] {
  const n = monthlyReturns.length;
  if (n < 2) return [];
  const mid = Math.floor(n / 2);
  const ranges: Array<{ label: string; from: number; to: number }> = [
    { label: "前半段", from: 0, to: mid },
    { label: "后半段", from: mid, to: n },
  ];
  return ranges.map(({ label, from, to }) => {
    const dates = monthlyDates.slice(from, to);
    const returns = monthlyReturns.slice(from, to);
    return {
      label,
      startMonth: dates[0] ?? "",
      endMonth: dates[dates.length - 1] ?? "",
      monthsCount: returns.length,
      cagr: round2(annualizeReturn(returns)),
      sharpe: round2(sharpeFromReturns(returns)),
      maxDrawdown: round2(maxDrawdownFromReturns(returns)),
    };
  });
}

// ============================================================
// Bootstrap confidence intervals
// ============================================================

/**
 * IID bootstrap: resample monthly returns with replacement, compute the
 * metric, repeat `iterations` times, return mean / median / 95% CI.
 *
 * Caveat: ignores autocorrelation in returns. Stationary / block bootstrap
 * would be more rigorous; deferred since monthly large-cap returns have
 * weak autocorrelation in practice.
 *
 * Caller passes a deterministic RNG for reproducibility (defaults to a
 * seeded mulberry32 based on `iterations` so the same iteration count
 * yields the same result).
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrapMetricCI(
  monthlyReturns: number[],
  metric: (rets: number[]) => number,
  iterations = 1000,
  seed = 42,
): MetricCI {
  if (monthlyReturns.length < 2 || iterations <= 0) {
    return {
      mean: 0,
      median: 0,
      ci95Lower: 0,
      ci95Upper: 0,
      iterations: 0,
    };
  }
  const rng = mulberry32(seed);
  const samples: number[] = [];
  const n = monthlyReturns.length;
  for (let it = 0; it < iterations; it++) {
    const sample = new Array(n);
    for (let i = 0; i < n; i++) {
      sample[i] = monthlyReturns[Math.floor(rng() * n)];
    }
    samples.push(metric(sample));
  }
  const sorted = sortAsc(samples);
  return {
    mean: round2(mean(samples)),
    median: round2(percentile(sorted, 0.5)),
    ci95Lower: round2(percentile(sorted, 0.025)),
    ci95Upper: round2(percentile(sorted, 0.975)),
    iterations,
  };
}

// ============================================================
// Top-level entry: build the whole RobustnessReport from a BacktestPath.
// ============================================================

export function buildRobustnessReport(
  path: BacktestPath,
  options?: { bootstrapIterations?: number; bootstrapSeed?: number },
): RobustnessReport {
  const monthlyDates = path.returns.map((r) => r.date);
  const monthlyReturns = path.returns.map((r) => r.strategy);
  const iterations = options?.bootstrapIterations ?? 1000;
  const seed = options?.bootstrapSeed ?? 42;

  const { inSample, outOfSample } = splitInSampleOutOfSample(
    monthlyDates,
    monthlyReturns,
    0.7,
  );
  const subperiods = halfSplit(monthlyDates, monthlyReturns);
  const wholeCAGR = annualizeReturn(monthlyReturns);
  const wholeSharpe = sharpeFromReturns(monthlyReturns);
  const wholeMDD = maxDrawdownFromReturns(monthlyReturns);

  return {
    whole: {
      cagr: round2(wholeCAGR),
      sharpe: round2(wholeSharpe),
      maxDrawdown: round2(wholeMDD),
      monthsCount: monthlyReturns.length,
    },
    inSample,
    outOfSample,
    subperiods,
    bootstrap: {
      sharpe: bootstrapMetricCI(
        monthlyReturns,
        sharpeFromReturns,
        iterations,
        seed,
      ),
      cagr: bootstrapMetricCI(
        monthlyReturns,
        annualizeReturn,
        iterations,
        seed + 1,
      ),
      maxDrawdown: bootstrapMetricCI(
        monthlyReturns,
        maxDrawdownFromReturns,
        iterations,
        seed + 2,
      ),
    },
    generatedAt: new Date().toISOString(),
  };
}

// Internal — kept to keep this module reusable and not depend on
// metrics.ts's round2 (which is module-private there).
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
