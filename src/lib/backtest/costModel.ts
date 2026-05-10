// Phase 7: realistic transaction cost modeling.
//
// The original engine used a single `txCostBps` × turnover for every trade.
// That's fine for back-of-envelope but biases mid-cap strategies (which
// face wider spreads) and ignores the size-dependent market impact that
// dominates real execution costs at meaningful AUM.
//
// This module ships a "tiered" cost model that treats spread + impact +
// commission as separate components, calibrated against published academic
// + practitioner references (e.g. Almgren et al. 2005, Frazzini-Israel-
// Moskowitz 2012). It's still a heuristic — without real ADV data per
// ticker per day we can't model true impact precisely — but it's a
// significant improvement over uniform bps for any strategy that holds
// non-mega-cap names.

import { UNIVERSE } from "./universe";

// Liquidity tiers calibrated for the Phase 6 universe. Real bid-ask spreads
// (per Investopedia / FINRA TRACE data, 2024 averages):
//   Mega-cap: ~0.5–2 bps round-trip  → use 1 bps base
//   Large-cap: ~3–8 bps              → use 4 bps base
//   Mid-cap / fading: ~8–20 bps      → use 10 bps base
//
// The split was decided manually against current market-cap rankings; future
// dynamic universe changes should rebuild this table or compute it from
// ADV / market-cap data on the fly.
export type LiquidityTier = "mega" | "large" | "mid";

export const TIER_BY_TICKER: Record<string, LiquidityTier> = {
  // Mega-cap (top ~10 by current market cap)
  AAPL: "mega",
  MSFT: "mega",
  NVDA: "mega",
  GOOGL: "mega",
  AMZN: "mega",
  META: "mega",
  TSLA: "mega",
  "BRK-B": "mega",
  LLY: "mega",
  V: "mega",

  // Large-cap (next ~30 — comfortably liquid but wider than top 10)
  JPM: "large",
  MA: "large",
  UNH: "large",
  HD: "large",
  PG: "large",
  WMT: "large",
  JNJ: "large",
  XOM: "large",
  CVX: "large",
  KO: "large",
  PEP: "large",
  COST: "large",
  MCD: "large",
  ABBV: "large",
  MRK: "large",
  BAC: "large",
  ADBE: "large",
  CRM: "large",
  CSCO: "large",
  NFLX: "large",
  TMO: "large",
  AXP: "large",
  GS: "large",
  WFC: "large",
  PFE: "large",
  TMUS: "large",
  CMCSA: "large",
  DIS: "large",
  ORCL: "large",
  HON: "large",

  // Mid-cap / fading large-caps (the rest — wider spreads, possibly thinner)
  NKE: "mid",
  SBUX: "mid",
  TGT: "mid",
  F: "mid",
  COP: "mid",
  SLB: "mid",
  BA: "mid",
  CAT: "mid",
  GE: "mid",
  UPS: "mid",
  LMT: "mid",
  T: "mid",
  VZ: "mid",
  INTC: "mid",
  IBM: "mid",
  X: "mid",
  KSS: "mid",
  GM: "mid",
  EBAY: "mid",
  HPQ: "mid",
};

// Per-tier base spread (round-trip, basis points).
const TIER_BASE_BPS: Record<LiquidityTier, number> = {
  mega: 1,
  large: 4,
  mid: 10,
};

/**
 * Default tier for tickers we don't have an explicit entry for. Mid-cap is
 * the conservative choice — slightly overestimates costs for names that
 * later get added to mega/large but never underestimates.
 */
const FALLBACK_TIER: LiquidityTier = "mid";

export function liquidityTierOf(ticker: string): LiquidityTier {
  return TIER_BY_TICKER[ticker] ?? FALLBACK_TIER;
}

export function tieredBaseBps(ticker: string): number {
  return TIER_BASE_BPS[liquidityTierOf(ticker)];
}

// ============================================================
// Cost model interface
// ============================================================

export type CostMode = "simple" | "tiered";

/**
 * Cost model signature.
 *
 * Inputs:
 *   - prevHoldings / nextHoldings: ticker lists before/after rebalance
 *   - turnover: 0..1, fraction of portfolio replaced (computed by engine)
 *   - userCommissionBps: the legacy `txCostBps` field — added on top as
 *     "commission/slippage you specifically want to assume"
 *
 * Output: fractional drag (e.g. 0.0006 = 6 bps) to subtract from the
 * strategy's return on the rebalance month.
 */
export interface CostInputs {
  prevHoldings: string[];
  nextHoldings: string[];
  turnover: number;
  userCommissionBps: number;
}

export type CostFunction = (input: CostInputs) => number;

/**
 * Phase 4 default — uniform bps per turnover. Matches the engine's
 * historical behavior so old studies stay reproducible.
 */
export const simpleCost: CostFunction = ({ turnover, userCommissionBps }) =>
  turnover * (userCommissionBps / 10000);

/**
 * Phase 7 tiered model. Combines:
 *
 *   1. Per-ticker spread:
 *      avg(tieredBaseBps(t) for t in changed_tickers)  → base bps
 *
 *   2. Market impact (size-adjusted): sqrt(turnover) × 5 bps. Captures
 *      the academically supported "square-root law" — bigger rebalances
 *      cost disproportionately more per unit traded.
 *
 *   3. User commission (txCostBps): unchanged, added on top so users still
 *      have a knob for "broker-specific commissions / additional slippage".
 *
 * Cost = turnover × (baseSpread + impact + userCommission)
 *
 * "Changed tickers" are the symmetric difference between prev and next
 * holdings — symbols that were actually traded. If the same set is held
 * across rebalances (turnover=0), drag is 0 regardless.
 */
export const tieredCost: CostFunction = ({
  prevHoldings,
  nextHoldings,
  turnover,
  userCommissionBps,
}) => {
  if (turnover <= 0) return 0;

  const changed = new Set<string>();
  const prev = new Set(prevHoldings);
  for (const t of nextHoldings) if (!prev.has(t)) changed.add(t);
  for (const t of prevHoldings) if (!nextHoldings.includes(t)) changed.add(t);

  // First rebalance has empty prev → "changed" = nextHoldings (we're buying
  // the whole portfolio for the first time). Use nextHoldings in that case
  // so the average isn't NaN.
  const tickersForSpread =
    changed.size > 0 ? Array.from(changed) : nextHoldings;
  if (tickersForSpread.length === 0) return 0;
  const avgSpreadBps =
    tickersForSpread.reduce((s, t) => s + tieredBaseBps(t), 0) /
    tickersForSpread.length;

  const impactBps = Math.sqrt(Math.min(1, turnover)) * 5;
  const totalBps = avgSpreadBps + impactBps + userCommissionBps;
  return turnover * (totalBps / 10000);
};

export function costFunctionForMode(mode: CostMode): CostFunction {
  return mode === "tiered" ? tieredCost : simpleCost;
}

/**
 * Tier breakdown of a portfolio — used by Result page disclosure to show
 * "your portfolio is X% mega-cap, Y% large-cap, Z% mid-cap".
 */
export function tierMix(
  tickers: readonly string[],
): Record<LiquidityTier, number> {
  const out: Record<LiquidityTier, number> = { mega: 0, large: 0, mid: 0 };
  for (const t of tickers) out[liquidityTierOf(t)]++;
  return out;
}

// Spot-check: every ticker in UNIVERSE should have a tier assigned. If a
// future PR adds a ticker without one, this function call (e.g. in tests)
// will surface it as a missing entry.
export function tierAssignmentGapsForUniverse(): string[] {
  return UNIVERSE.filter((t) => !TIER_BY_TICKER[t]);
}
