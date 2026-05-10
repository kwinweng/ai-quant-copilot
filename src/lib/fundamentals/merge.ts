import type { FundamentalSnapshot } from "./types";

// Merge Yahoo + SEC into a single "merged" snapshot.
//
// Strategy:
//   • Yahoo wins for *price-dependent* ratios (PE, PB, PS, EV/EBITDA).
//     These need today's market cap, which Yahoo has and SEC doesn't.
//   • SEC wins for *fundamental* ratios when present (ROE, gross margin,
//     debt/equity) — it's authoritative point-in-time data.
//   • Yahoo fills the gaps when SEC is missing a field.
//   • Growth metrics: prefer SEC (computed from two annuals) since Yahoo's
//     values are often based on restated TTM and harder to interpret.
//
// PIT lag note: SEC's reportedAt + a configurable cushion is how Phase 4
// "fakes" point-in-time discipline. Right now reportedAt is just stored;
// future passes will gate which snapshot is visible to the backtest at
// rebalance month M.
export function mergeFundamentals(
  yahoo?: FundamentalSnapshot,
  sec?: FundamentalSnapshot,
): FundamentalSnapshot | undefined {
  if (!yahoo && !sec) return undefined;
  // Pick the most recent fiscal date across the two; if only one exists, use
  // its fiscal date. SEC's reportedAt is preserved for downstream PIT use.
  const fiscalCandidates = [yahoo?.fiscalDate, sec?.fiscalDate].filter(
    (d): d is Date => d instanceof Date,
  );
  const fiscalDate =
    fiscalCandidates.length > 0
      ? fiscalCandidates.reduce((acc, d) => (d > acc ? d : acc))
      : new Date();

  const ticker = yahoo?.ticker ?? sec!.ticker;

  return {
    ticker,
    source: "merged",
    fiscalDate,
    reportedAt: sec?.reportedAt,
    // Value: Yahoo only.
    pe: yahoo?.pe,
    pb: yahoo?.pb,
    ps: yahoo?.ps,
    evEbitda: yahoo?.evEbitda,
    // Quality: SEC preferred, Yahoo fallback.
    roe: sec?.roe ?? yahoo?.roe,
    roic: sec?.roic ?? yahoo?.roic,
    grossMargin: sec?.grossMargin ?? yahoo?.grossMargin,
    debtToEquity: sec?.debtToEquity ?? yahoo?.debtToEquity,
    // Growth: SEC preferred.
    revenueGrowth: sec?.revenueGrowth ?? yahoo?.revenueGrowth,
    epsGrowth: sec?.epsGrowth ?? yahoo?.epsGrowth,
    // Phase 5: pass-through anchors for historical Value computation.
    // marketCap is Yahoo-only (current snapshot, no SEC equivalent).
    // Absolute SEC values are SEC-only (Yahoo TTM is restated, inconsistent
    // with historical 10-K filings).
    marketCap: yahoo?.marketCap,
    netIncomeTTM: sec?.netIncomeTTM,
    revenuesTTM: sec?.revenuesTTM,
    stockholdersEquity: sec?.stockholdersEquity,
    raw: { yahoo: yahoo?.raw, sec: sec?.raw },
  };
}
