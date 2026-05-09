import { MonthKey, MonthlyPrices, priorMonth } from "./prices";

export interface FactorScores {
  [ticker: string]: Map<MonthKey, number>;
}

// 12-1 momentum: at end of month M, factor = price[M-1] / price[M-12] - 1.
// Skipping the most recent month is the classic Jegadeesh-Titman convention
// to avoid the short-term reversal effect.
export function compute121Momentum(prices: MonthlyPrices): FactorScores {
  const out: FactorScores = {};
  for (const ticker of Object.keys(prices)) {
    const series = prices[ticker];
    const scores = new Map<MonthKey, number>();
    for (const month of series.keys()) {
      const skipKey = priorMonth(month, 1); // M-1
      const baseKey = priorMonth(month, 12); // M-12
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

// Helper: rank tickers by factor at a given month, returning the sorted list
// (highest factor first). Tickers without a factor value at month M are
// excluded.
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
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
