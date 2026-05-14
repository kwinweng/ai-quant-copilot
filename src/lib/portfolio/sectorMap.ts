// Phase 14 — GICS sector mapping for the 60-ticker universe.
//
// Static mapping so the runner can compute per-rebalance sector allocation and
// apply sector caps without making a network call. The buckets mirror the
// 8 majors used in src/lib/backtest/universe.ts UNIVERSE comments. When the
// universe expands, this file must be updated — sectorMap.test.ts asserts
// coverage so CI catches forgotten entries.
//
// Source of truth: GICS sub-industry as reported by SEC + Yahoo Finance.
// We collapse Information Technology / Communication Services / Consumer
// Discretionary / etc. into the standard 8 because finer slices add noise
// for a 60-ticker portfolio.

export type GicsSector =
  | "Tech"
  | "Financials"
  | "Healthcare"
  | "Consumer Discretionary"
  | "Consumer Staples"
  | "Energy"
  | "Industrials"
  | "Communications";

export const TICKER_TO_SECTOR: Record<string, GicsSector> = {
  // Tech (10)
  AAPL: "Tech",
  MSFT: "Tech",
  GOOGL: "Tech",
  META: "Tech",
  NVDA: "Tech",
  AMZN: "Tech", // Amazon classified as Consumer Discretionary by GICS, but
                // its retail + AWS profile reads as Tech for sector-cap purposes.
                // Document deliberately — see Phase 14 README.
  TSLA: "Tech", // Same deliberate override; auto manufacturer by GICS but
                // most users treat it as Tech for diversification.
  ADBE: "Tech",
  CRM: "Tech",
  CSCO: "Tech",

  // Financials (8)
  "BRK-B": "Financials",
  JPM: "Financials",
  V: "Financials",
  MA: "Financials",
  BAC: "Financials",
  WFC: "Financials",
  GS: "Financials",
  AXP: "Financials",

  // Healthcare (7)
  JNJ: "Healthcare",
  UNH: "Healthcare",
  PFE: "Healthcare",
  MRK: "Healthcare",
  ABBV: "Healthcare",
  TMO: "Healthcare",
  LLY: "Healthcare",

  // Consumer Discretionary (6 — Ford reclassified below)
  HD: "Consumer Discretionary",
  MCD: "Consumer Discretionary",
  NKE: "Consumer Discretionary",
  SBUX: "Consumer Discretionary",
  TGT: "Consumer Discretionary",
  F: "Consumer Discretionary",

  // Consumer Staples (5)
  WMT: "Consumer Staples",
  PG: "Consumer Staples",
  KO: "Consumer Staples",
  PEP: "Consumer Staples",
  COST: "Consumer Staples",

  // Energy (4)
  XOM: "Energy",
  CVX: "Energy",
  COP: "Energy",
  SLB: "Energy",

  // Industrials (6)
  BA: "Industrials",
  CAT: "Industrials",
  GE: "Industrials",
  HON: "Industrials",
  UPS: "Industrials",
  LMT: "Industrials",

  // Communications + Media (6)
  DIS: "Communications",
  NFLX: "Communications",
  T: "Communications",
  VZ: "Communications",
  CMCSA: "Communications",
  TMUS: "Communications",

  // Legacy / fading large-caps (8)
  INTC: "Tech",
  ORCL: "Tech",
  IBM: "Tech",
  X: "Industrials", // United States Steel
  KSS: "Consumer Discretionary", // Kohl's
  GM: "Consumer Discretionary",
  EBAY: "Consumer Discretionary",
  HPQ: "Tech",
};

/**
 * Look up the sector for a ticker. Returns "Unknown" if not mapped — caller
 * should warn (sector caps can't be enforced for unmapped tickers).
 */
export function sectorOf(ticker: string): GicsSector | "Unknown" {
  return TICKER_TO_SECTOR[ticker] ?? "Unknown";
}

/**
 * Aggregate weights into a sector → weight map. Unknown tickers go under
 * "Unknown" so the caller can see coverage gaps.
 */
export function sectorAllocationFromWeights(
  weights: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [ticker, w] of Object.entries(weights)) {
    if (w <= 0) continue;
    const s = sectorOf(ticker);
    out[s] = (out[s] ?? 0) + w;
  }
  return out;
}
