// Phase 4 — fundamentals provider types.
//
// Goal: a provider-agnostic shape that downstream factor code can consume
// without caring whether the data came from Yahoo's quoteSummary or SEC's
// XBRL companyfacts.

export type FundamentalSource = "yahoo" | "sec" | "merged";

export interface FundamentalSnapshot {
  ticker: string;
  source: FundamentalSource;

  // When the underlying fiscal period ended. For Yahoo TTM-style data we use
  // the most recent reported quarter end. For SEC we use the period end of
  // the latest 10-K/10-Q.
  fiscalDate: Date;

  // SEC only: when the filing was actually submitted. Used for PIT lag —
  // i.e. "this number wasn't knowable to investors until reportedAt".
  reportedAt?: Date;

  // Value
  pe?: number; // trailing P/E
  pb?: number; // P/B
  ps?: number; // P/S
  evEbitda?: number;

  // Quality
  roe?: number; // %
  roic?: number; // %
  grossMargin?: number; // %
  debtToEquity?: number; // ratio (e.g. 0.6 = 60%)

  // Growth (YoY)
  revenueGrowth?: number; // %
  epsGrowth?: number; // %

  // Phase 5 — current market cap (USD). Used as the anchor to back-derive
  // historical MarketCap_M = MarketCap_today × (adjclose_M / adjclose_today),
  // which then drives PIT-correct PE/PB/PS at every backtest month. Only
  // populated by the Yahoo provider (SEC has no current quote).
  marketCap?: number;

  // Phase 5 — absolute USD values from SEC filings, needed to compute
  // PIT-correct Value ratios at any historical month:
  //   PE_M = MarketCap_M / netIncomeTTM_at_M
  //   PB_M = MarketCap_M / stockholdersEquity_at_M
  //   PS_M = MarketCap_M / revenuesTTM_at_M
  // Populated by SEC source for each historical filing; Yahoo source
  // leaves them undefined (its TTM is restated and inconsistent with
  // historical filings).
  netIncomeTTM?: number;
  revenuesTTM?: number;
  stockholdersEquity?: number;

  // Optional raw payload for audit / debug.
  raw?: unknown;
}

export interface FundamentalsProvider {
  readonly name: FundamentalSource;
  /**
   * Fetch the most recent fundamentals snapshot for a ticker. Implementations
   * should return undefined (not throw) when the ticker is unknown so a
   * provider failure doesn't kill the whole batch.
   */
  fetch(ticker: string): Promise<FundamentalSnapshot | undefined>;
}

export type FundamentalField = keyof Pick<
  FundamentalSnapshot,
  | "pe"
  | "pb"
  | "ps"
  | "evEbitda"
  | "roe"
  | "roic"
  | "grossMargin"
  | "debtToEquity"
  | "revenueGrowth"
  | "epsGrowth"
>;

export const FUNDAMENTAL_FIELDS: FundamentalField[] = [
  "pe",
  "pb",
  "ps",
  "evEbitda",
  "roe",
  "roic",
  "grossMargin",
  "debtToEquity",
  "revenueGrowth",
  "epsGrowth",
];

export const VALUE_FIELDS: FundamentalField[] = ["pe", "pb", "ps", "evEbitda"];
export const QUALITY_FIELDS: FundamentalField[] = [
  "roe",
  "roic",
  "grossMargin",
  "debtToEquity",
];
export const GROWTH_FIELDS: FundamentalField[] = ["revenueGrowth", "epsGrowth"];
