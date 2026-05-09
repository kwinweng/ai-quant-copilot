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
