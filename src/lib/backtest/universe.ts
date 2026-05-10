// Hardcoded universe — 30 large-cap US tickers that all have at least
// 2010-onwards price history on Yahoo Finance. We intentionally don't
// reconstruct the historical S&P 500 constituents (paid data) — the user-facing
// "S&P 500" label refers to the benchmark, not the strategy universe.

export const UNIVERSE: readonly string[] = [
  "AAPL", "MSFT", "AMZN", "GOOGL", "META",
  "NVDA", "BRK-B", "TSLA", "JPM", "V",
  "JNJ", "WMT", "PG", "MA", "UNH",
  "HD", "BAC", "XOM", "CVX", "KO",
  "PEP", "MCD", "DIS", "NKE", "INTC",
  "CSCO", "ORCL", "IBM", "T", "VZ",
];

// Phase 4: ticker → SEC EDGAR CIK (Central Index Key, padded to 10 digits).
// Hardcoded for our 30-ticker universe so we don't need to fetch + cache the
// full ~600KB company_tickers.json on every cold start. Verified against
// https://www.sec.gov/cgi-bin/browse-edgar as of 2026-05.
//
// CIK to URL: https://data.sec.gov/api/xbrl/companyfacts/CIK{paddedCik}.json
export const TICKER_TO_CIK: Record<string, string> = {
  AAPL: "0000320193",
  MSFT: "0000789019",
  AMZN: "0001018724",
  GOOGL: "0001652044",
  META: "0001326801",
  NVDA: "0001045810",
  "BRK-B": "0001067983", // Berkshire Hathaway (B-shares share parent CIK)
  TSLA: "0001318605",
  JPM: "0000019617",
  V: "0001403161",
  JNJ: "0000200406",
  WMT: "0000104169",
  PG: "0000080424",
  MA: "0001141391",
  UNH: "0000731766",
  HD: "0000354950",
  BAC: "0000070858",
  XOM: "0000034088",
  CVX: "0000093410",
  KO: "0000021344",
  PEP: "0000077476",
  MCD: "0000063908",
  DIS: "0001744489",
  NKE: "0000320187",
  INTC: "0000050863",
  CSCO: "0000858877",
  ORCL: "0001341439",
  IBM: "0000051143",
  T: "0000732717",
  VZ: "0000732712",
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
