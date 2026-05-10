// Phase 6: expanded from 30 → 60 large-cap US tickers across 8 GICS sectors.
//
// Goals of the expansion:
//   • 2× sample size → cross-sectional z-scores have less noise
//   • Better sector breadth (was tech-heavy; now spreads across all 8 majors)
//   • Some "fading mega-caps" (INTC / IBM / T / VZ already in; added GE / F /
//     X / KSS / GM) so the universe isn't 100% pure winners
//   • Some that have moved in/out of S&P 500 historically (kept tradeable
//     so price + filings still available — true delisted-then-bankrupt names
//     like LEH / BSC require Phase 6.5's time-varying universe to handle
//     properly because they don't trade today)
//
// Honest disclosure: this is still a survivor-leaning universe — every
// ticker here was actually tradeable as of 2026. The Phase 6.5 follow-up
// will add `getUniverseAt(monthKey)` driven by Wikipedia historical S&P
// constituents to handle truly-delisted names.

export const UNIVERSE: readonly string[] = [
  // Tech (10)
  "AAPL", "MSFT", "GOOGL", "META", "NVDA",
  "AMZN", "TSLA", "ADBE", "CRM", "CSCO",
  // Financials (8)
  "BRK-B", "JPM", "V", "MA", "BAC",
  "WFC", "GS", "AXP",
  // Healthcare (7)
  "JNJ", "UNH", "PFE", "MRK", "ABBV",
  "TMO", "LLY",
  // Consumer Discretionary (6)
  "HD", "MCD", "NKE", "SBUX", "TGT",
  "F",
  // Consumer Staples (5)
  "WMT", "PG", "KO", "PEP", "COST",
  // Energy (4)
  "XOM", "CVX", "COP", "SLB",
  // Industrials (6)
  "BA", "CAT", "GE", "HON", "UPS",
  "LMT",
  // Communications + Media (6)
  "DIS", "NFLX", "T", "VZ", "CMCSA",
  "TMUS",
  // Legacy / fading large-caps (8): kept in for sample diversity. Some have
  // had material drawdowns (INTC, IBM, GE, F, KSS) that help reduce the
  // "every name compounds at 12%" survivor distortion of the original 30.
  "INTC", "ORCL", "IBM", "X", "KSS",
  "GM", "EBAY", "HPQ",
];

// Phase 4: ticker → SEC EDGAR CIK (Central Index Key, padded to 10 digits).
// Phase 6: expanded to cover the new 60-ticker universe. Verified against
// https://www.sec.gov/cgi-bin/browse-edgar at expansion time.
//
// CIK to URL: https://data.sec.gov/api/xbrl/companyfacts/CIK{paddedCik}.json
export const TICKER_TO_CIK: Record<string, string> = {
  // Tech
  AAPL: "0000320193",
  MSFT: "0000789019",
  GOOGL: "0001652044",
  META: "0001326801",
  NVDA: "0001045810",
  AMZN: "0001018724",
  TSLA: "0001318605",
  ADBE: "0000796343", // Adobe
  CRM: "0001108524", // Salesforce
  CSCO: "0000858877",

  // Financials
  "BRK-B": "0001067983",
  JPM: "0000019617",
  V: "0001403161",
  MA: "0001141391",
  BAC: "0000070858",
  WFC: "0000072971", // Wells Fargo
  GS: "0000886982", // Goldman Sachs
  AXP: "0000004962", // American Express

  // Healthcare
  JNJ: "0000200406",
  UNH: "0000731766",
  PFE: "0000078003", // Pfizer
  MRK: "0000310158", // Merck
  ABBV: "0001551152", // AbbVie
  TMO: "0000097745", // Thermo Fisher
  LLY: "0000059478", // Eli Lilly

  // Consumer Discretionary
  HD: "0000354950",
  MCD: "0000063908",
  NKE: "0000320187",
  SBUX: "0000829224", // Starbucks
  TGT: "0000027419", // Target
  F: "0000037996", // Ford

  // Consumer Staples
  WMT: "0000104169",
  PG: "0000080424",
  KO: "0000021344",
  PEP: "0000077476",
  COST: "0000909832", // Costco

  // Energy
  XOM: "0000034088",
  CVX: "0000093410",
  COP: "0001163165", // ConocoPhillips
  SLB: "0000087347", // Schlumberger

  // Industrials
  BA: "0000012927", // Boeing
  CAT: "0000018230", // Caterpillar
  GE: "0000040545", // General Electric
  HON: "0000773840", // Honeywell
  UPS: "0001090727", // UPS
  LMT: "0000936468", // Lockheed Martin

  // Communications + Media
  DIS: "0001744489",
  NFLX: "0001065280", // Netflix
  T: "0000732717",
  VZ: "0000732712",
  CMCSA: "0001166691", // Comcast
  TMUS: "0001283699", // T-Mobile US

  // Legacy / fading
  INTC: "0000050863",
  ORCL: "0001341439",
  IBM: "0000051143",
  X: "0001163302", // United States Steel
  KSS: "0000885639", // Kohl's
  GM: "0001467858", // General Motors
  EBAY: "0001065088", // eBay
  HPQ: "0000047217", // HP Inc
};

export const DEFAULT_BENCHMARK = "SPY";

export const REBALANCE_MONTHS: Record<string, number> = {
  Monthly: 1,
  Quarterly: 3,
  // Tolerate Chinese and lowercase variants in case the form layer evolves.
  月度: 1,
  季度: 3,
  monthly: 1,
  quarterly: 3,
};

export function rebalanceMonthsOf(label: string): number {
  return REBALANCE_MONTHS[label] ?? 1;
}
