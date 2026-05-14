// Phase 15 — Paper-portfolio calibration.
//
// "Did the strategy actually deliver what the backtest promised?"
//
// For each paper portfolio we compute four headline numbers:
//
//   * hitRate          — fraction of actual months whose return direction
//                        matches the backtest's same-month direction. Closer
//                        to 100% = the strategy's monthly timing has held up.
//   * trackingError    — annualized stdev of (actual - backtest) monthly
//                        returns. Lower = closer fidelity to expectations.
//   * executionRate    — fraction of monthly rebalance advices that the user
//                        actually confirmed (vs skipped/pending).
//   * actualCagr vs    — geometric annualized comparison. Big gap = the
//     expectedCagr       backtest may have been over-fit.
//
// We deliberately keep the math simple — bootstrap CIs already exist on the
// source study (Phase 8 robustness). The point of this view is "live tracking
// quality", not a re-litigation of the backtest.

export interface CalibrationInput {
  /** YYYY-MM the portfolio was created (= source rebalance date). */
  startMonth: string;
  /** Monthly actual returns observed since startMonth. {date: YYYY-MM, ret: 0.012} */
  actualMonthly: Array<{ date: string; ret: number }>;
  /** Backtest monthly returns from the source study, full history. */
  backtestMonthly: Array<{ date: string; strategy: number; benchmark: number }>;
  /** Advice records — used to compute execution rate. */
  adviceLog: Array<{ status: "pending" | "confirmed" | "skipped" }>;
}

export interface CalibrationResult {
  /** YYYY-MM range actually observed. */
  periodStart: string | null;
  periodEnd: string | null;
  /** Count of overlapping months where we have BOTH actual and backtest data. */
  monthsObserved: number;
  hitRate: number | null; // 0..1, null when no overlap
  trackingError: number | null; // annualized stdev of (actual - expected)
  /** Annualized CAGR realized in the observation window. */
  actualCagr: number | null;
  /** Backtest CAGR over the SAME overlap window (not the full backtest period). */
  expectedCagr: number | null;
  executionRate: number | null; // confirmed / (confirmed + skipped); pending excluded
  adviceCounts: {
    pending: number;
    confirmed: number;
    skipped: number;
  };
}

function annualizeCagr(returns: number[]): number {
  if (returns.length === 0) return 0;
  let v = 1;
  for (const r of returns) v *= 1 + r;
  return Math.pow(v, 12 / returns.length) - 1;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const ss = xs.reduce((s, x) => s + (x - mean) ** 2, 0);
  return Math.sqrt(ss / (xs.length - 1));
}

/**
 * Compute calibration metrics. Robust to empty / sparse inputs — returns
 * nulls rather than NaN so the UI can show "等待第一次月度调仓" cleanly.
 */
export function computeCalibration(input: CalibrationInput): CalibrationResult {
  // ---- Advice execution ----
  const adviceCounts = { pending: 0, confirmed: 0, skipped: 0 };
  for (const a of input.adviceLog) adviceCounts[a.status]++;
  const decided = adviceCounts.confirmed + adviceCounts.skipped;
  const executionRate = decided === 0 ? null : adviceCounts.confirmed / decided;

  // ---- Return tracking ----
  // Build a map from date → backtest strategy return so we can pair them up.
  const backtestMap = new Map<string, number>();
  for (const b of input.backtestMonthly) {
    backtestMap.set(b.date, b.strategy);
  }
  const pairs: { date: string; actual: number; expected: number }[] = [];
  for (const a of input.actualMonthly) {
    // Only count months AT OR AFTER the portfolio start (live tracking, not
    // historical backfill). Strict ≥ comparison works because YYYY-MM strings
    // are lexicographically sortable.
    if (a.date < input.startMonth) continue;
    const expected = backtestMap.get(a.date);
    if (expected == null || !Number.isFinite(expected)) continue;
    if (!Number.isFinite(a.ret)) continue;
    pairs.push({ date: a.date, actual: a.ret, expected });
  }

  if (pairs.length === 0) {
    return {
      periodStart: null,
      periodEnd: null,
      monthsObserved: 0,
      hitRate: null,
      trackingError: null,
      actualCagr: null,
      expectedCagr: null,
      executionRate,
      adviceCounts,
    };
  }

  pairs.sort((a, b) => a.date.localeCompare(b.date));
  const periodStart = pairs[0].date;
  const periodEnd = pairs[pairs.length - 1].date;

  // Hit rate: same sign on the month
  let hits = 0;
  for (const p of pairs) {
    const sa = Math.sign(p.actual);
    const se = Math.sign(p.expected);
    if (sa === se || (sa === 0 && se === 0)) hits++;
  }
  const hitRate = hits / pairs.length;

  // Tracking error: annualized stdev of (actual - expected)
  const diffs = pairs.map((p) => p.actual - p.expected);
  const teMonthly = stdev(diffs);
  const trackingError = teMonthly * Math.sqrt(12);

  // CAGRs over the overlap window
  const actualCagr = annualizeCagr(pairs.map((p) => p.actual));
  const expectedCagr = annualizeCagr(pairs.map((p) => p.expected));

  return {
    periodStart,
    periodEnd,
    monthsObserved: pairs.length,
    hitRate,
    trackingError,
    actualCagr,
    expectedCagr,
    executionRate,
    adviceCounts,
  };
}

/**
 * Cache freshness gate — quarterly reviews live in `quarterlyReview` JSON
 * for 7 days before we recompute. The UI can pass the cached timestamp
 * and decide whether to call the recompute endpoint.
 */
export function isReviewStale(computedAt: string | null | undefined): boolean {
  if (!computedAt) return true;
  const t = Date.parse(computedAt);
  if (!Number.isFinite(t)) return true;
  const ageMs = Date.now() - t;
  return ageMs > 7 * 24 * 60 * 60 * 1000;
}
