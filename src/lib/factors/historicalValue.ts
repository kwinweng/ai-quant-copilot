// Phase 5: historical PIT-correct Value ratio computation.
//
// Core insight: MarketCap is invariant to stock splits (price and shares
// move inversely). So we can back-derive historical MarketCap from today's
// known value scaled by the adjusted-close ratio:
//
//   MarketCap_M = MarketCap_today × (adjclose_M / adjclose_today)
//
// With historical MarketCap in hand, three Value ratios become straightforward
// using SEC absolute USD inputs (NetIncome / Revenues / StockholdersEquity)
// from the most-recent 10-K filing visible at month M (already PIT-gated by
// pickSnapshotAsOf):
//
//   PE_M = MarketCap_M / NetIncomeTTM_at_M
//   PB_M = MarketCap_M / StockholdersEquity_at_M
//   PS_M = MarketCap_M / RevenuesTTM_at_M
//
// EV/EBITDA is deferred — requires Cash + D&A + OperatingIncome, doable but
// less impactful than the three above.
//
// All math here is pure / synchronous; tested by historicalValue.test.ts.

import type { FundamentalSnapshot } from "@/lib/fundamentals/types";
import type { MonthKey, MonthlyPrices } from "@/lib/backtest/prices";

export interface HistoricalValueRatios {
  pe?: number;
  pb?: number;
  ps?: number;
}

/**
 * Back-derive MarketCap at month M from a current-snapshot anchor.
 *
 * Returns undefined if any input is missing or non-finite. Callers are
 * expected to skip the corresponding ticker for that month rather than
 * substitute a default — the cross-sectional z-score will simply have
 * fewer participants.
 */
export function historicalMarketCap(
  marketCapToday: number | undefined,
  adjcloseToday: number | undefined,
  adjcloseAtMonth: number | undefined,
): number | undefined {
  if (
    typeof marketCapToday !== "number" ||
    typeof adjcloseToday !== "number" ||
    typeof adjcloseAtMonth !== "number" ||
    !Number.isFinite(marketCapToday) ||
    !Number.isFinite(adjcloseToday) ||
    !Number.isFinite(adjcloseAtMonth) ||
    adjcloseToday <= 0
  ) {
    return undefined;
  }
  return marketCapToday * (adjcloseAtMonth / adjcloseToday);
}

/**
 * Compute PE / PB / PS at a single (ticker, month) given:
 *   - the back-derived historical MarketCap
 *   - the SEC snapshot visible at that month (PIT-gated upstream)
 *
 * Each ratio is independently undefined when its denominator is missing
 * or non-positive.
 */
export function valueRatiosFromInputs(
  marketCapAtMonth: number | undefined,
  snapshot: FundamentalSnapshot | undefined,
): HistoricalValueRatios {
  if (!marketCapAtMonth || !snapshot) return {};
  const ni = snapshot.netIncomeTTM;
  const eq = snapshot.stockholdersEquity;
  const rev = snapshot.revenuesTTM;
  const out: HistoricalValueRatios = {};
  // PE: positive earnings only (negative-PE makes the cross-sectional z
  // misleading; convention in factor research is to drop negative-EPS firms).
  if (typeof ni === "number" && Number.isFinite(ni) && ni > 0) {
    out.pe = marketCapAtMonth / ni;
  }
  if (typeof eq === "number" && Number.isFinite(eq) && eq > 0) {
    out.pb = marketCapAtMonth / eq;
  }
  if (typeof rev === "number" && Number.isFinite(rev) && rev > 0) {
    out.ps = marketCapAtMonth / rev;
  }
  return out;
}

/**
 * For a given backtest month, build a per-ticker map of historical Value
 * ratios using the latest adjclose <= that month and the PIT-visible SEC
 * snapshot. Tickers with missing inputs are simply omitted.
 *
 * `prices` is the same MonthlyPrices structure the engine consumes; we
 * read the entry at exactly `month` (no lookback).
 */
export function valueRatiosAtMonth(
  month: MonthKey,
  tickers: readonly string[],
  prices: MonthlyPrices,
  adjcloseTodayByTicker: Record<string, number>,
  marketCapTodayByTicker: Record<string, number>,
  pitSnapshotByTicker: Record<string, FundamentalSnapshot | undefined>,
): Map<string, HistoricalValueRatios> {
  const out = new Map<string, HistoricalValueRatios>();
  for (const t of tickers) {
    const px = prices[t]?.get(month);
    const today = adjcloseTodayByTicker[t];
    const mcap = marketCapTodayByTicker[t];
    const histMcap = historicalMarketCap(mcap, today, px);
    const ratios = valueRatiosFromInputs(histMcap, pitSnapshotByTicker[t]);
    if (ratios.pe !== undefined || ratios.pb !== undefined || ratios.ps !== undefined) {
      out.set(t, ratios);
    }
  }
  return out;
}

/**
 * Helper for the runner: extract the latest adjclose ("today") for each
 * ticker from a MonthlyPrices dict. Returns ticker → latest price map.
 * Returns 0 / skip for tickers with no data.
 */
export function latestAdjcloseByTicker(
  prices: MonthlyPrices,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ticker of Object.keys(prices)) {
    const series = prices[ticker];
    if (!series || series.size === 0) continue;
    // Maps preserve insertion order; chronological because fetchMonthlyPrices
    // iterates the result.quotes in date order. Take the last entry.
    let last: number | undefined;
    for (const v of series.values()) last = v;
    if (typeof last === "number" && Number.isFinite(last) && last > 0) {
      out[ticker] = last;
    }
  }
  return out;
}
