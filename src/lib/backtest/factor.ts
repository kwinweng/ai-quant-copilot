import { MonthKey, MonthlyPrices, priorMonth } from "./prices";

export interface FactorScores {
  [ticker: string]: Map<MonthKey, number>;
}

// Generalized momentum: at end of month M,
//   factor = price[M-skipMonths] / price[M-lookbackMonths] - 1.
// Skipping the most recent month(s) follows Jegadeesh-Titman to avoid the
// short-term reversal effect. The classic 12-1 momentum is
// computeMomentum(prices, 12, 1).
export function computeMomentum(
  prices: MonthlyPrices,
  lookbackMonths: number,
  skipMonths: number = 1,
): FactorScores {
  const out: FactorScores = {};
  for (const ticker of Object.keys(prices)) {
    const series = prices[ticker];
    const scores = new Map<MonthKey, number>();
    for (const month of series.keys()) {
      const skipKey = priorMonth(month, skipMonths);
      const baseKey = priorMonth(month, lookbackMonths);
      const skipPrice = series.get(skipKey);
      const basePrice = series.get(baseKey);
      if (
        skipPrice == null ||
        basePrice == null ||
        !Number.isFinite(skipPrice) ||
        !Number.isFinite(basePrice) ||
        basePrice <= 0
      ) {
        continue;
      }
      scores.set(month, skipPrice / basePrice - 1);
    }
    out[ticker] = scores;
  }
  return out;
}

// 12-1 momentum: kept as a thin wrapper for the canonical baseline.
export function compute121Momentum(prices: MonthlyPrices): FactorScores {
  return computeMomentum(prices, 12, 1);
}

// Helper: rank tickers by factor at a given month, returning the sorted list
// (highest factor first). Tickers without a factor value at month M are
// excluded.
//
// Sprint #6 M2: tied scores get a deterministic tiebreaker (ticker ASC) so
// reruns of the same backtest pick the same holdings. V8's Array.sort is
// stable as of recent runtimes, but we don't want to rely on equal-score
// inputs preserving insertion order across object-key iteration.
export function rankByFactor(
  scores: FactorScores,
  month: MonthKey,
): { ticker: string; score: number }[] {
  const ranked: { ticker: string; score: number }[] = [];
  for (const ticker of Object.keys(scores)) {
    const v = scores[ticker].get(month);
    if (v == null || !Number.isFinite(v)) continue;
    ranked.push({ ticker, score: v });
  }
  ranked.sort(
    (a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker),
  );
  return ranked;
}
