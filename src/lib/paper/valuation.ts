// Phase 10: paper portfolio valuation helpers.
//
// Given a portfolio created at startedAt with target weights and an initial
// USD value, compute today's value by:
//   1. Resolving the starting share counts from initial weights × initial
//      value ÷ price at startedAt month.
//   2. Multiplying current shares by the latest price for each ticker.
//
// We treat the portfolio as buy-and-hold from inception — no rebalancing,
// no dividends reinvested. That matches a casual "snapshot at the latest
// rebalance" mental model. Future phases can add rebalance schedules.

export interface PortfolioHolding {
  ticker: string;
  weight: number; // 0..1, weights sum to ~1
}

export interface ValuationInput {
  holdings: PortfolioHolding[];
  initialValue: number; // USD at startedAt
  startedAt: string; // YYYY-MM
  // ticker → { startPrice, currentPrice }
  prices: Record<string, { startPrice?: number; currentPrice?: number }>;
}

export interface ValuationResult {
  startValue: number;
  currentValue: number;
  totalReturnPct: number;
  // Per-ticker contribution (USD). Tickers without price data appear
  // with zero contribution and a flag.
  positions: Array<{
    ticker: string;
    weight: number;
    startPrice?: number;
    currentPrice?: number;
    shares?: number;
    currentNotional?: number;
    unavailable: boolean;
  }>;
}

/**
 * Compute current portfolio value from inception holdings + price points.
 * Conservative: tickers without complete price coverage are excluded
 * from the current valuation (their slice contributes 0), so the user
 * sees a downward bias rather than misleadingly high "infinite return"
 * artifacts. This matches the paper-trading mental model: "what would
 * I be holding if I'd locked in at the rebalance?"
 */
export function valuatePortfolio(input: ValuationInput): ValuationResult {
  const startValue = input.initialValue;
  const positions: ValuationResult["positions"] = [];
  let currentValue = 0;
  for (const h of input.holdings) {
    const px = input.prices[h.ticker];
    const startPrice = px?.startPrice;
    const currentPrice = px?.currentPrice;
    if (
      typeof startPrice !== "number" ||
      typeof currentPrice !== "number" ||
      !Number.isFinite(startPrice) ||
      !Number.isFinite(currentPrice) ||
      startPrice <= 0
    ) {
      positions.push({
        ticker: h.ticker,
        weight: h.weight,
        startPrice,
        currentPrice,
        unavailable: true,
      });
      continue;
    }
    const dollarsAtStart = startValue * h.weight;
    const shares = dollarsAtStart / startPrice;
    const notional = shares * currentPrice;
    currentValue += notional;
    positions.push({
      ticker: h.ticker,
      weight: h.weight,
      startPrice,
      currentPrice,
      shares,
      currentNotional: notional,
      unavailable: false,
    });
  }
  return {
    startValue,
    currentValue,
    totalReturnPct:
      startValue > 0 ? ((currentValue - startValue) / startValue) * 100 : 0,
    positions,
  };
}

/**
 * Equal-weight a list of tickers into PortfolioHolding[]. Used when seeding
 * a paper portfolio from a study's last rebalance event (which stores
 * holdings as an unweighted ticker array).
 */
export function equalWeight(tickers: readonly string[]): PortfolioHolding[] {
  if (tickers.length === 0) return [];
  const w = 1 / tickers.length;
  return tickers.map((ticker) => ({ ticker, weight: w }));
}
