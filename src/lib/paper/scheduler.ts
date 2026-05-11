// Phase 12: paper-trading scheduler — compute "what should this study hold
// right now?" without re-running the whole backtest.
//
// Reuses the same factor pipeline as backtest/runner.ts but evaluates only
// the latest fully-closed month. The output is a sorted ticker list that
// the strategy *would* select today, equal-weighted into top quintile.
//
// Design choices:
// - We refetch monthly prices for the universe with a 15-month window so
//   12-1 momentum is computable for the latest month. This avoids any
//   dependence on the prior backtest run's caches.
// - For multifactor studies we also pull Yahoo + SEC fundamentals via the
//   same cache layer the runner uses. PIT cutoff is applied identically
//   (REPORTING_LAG_DAYS = 90 from end-of-month).
// - We don't write any DB rows here — that's the caller's job. This module
//   is the pure compute layer so it stays unit-testable.

import { UNIVERSE, rebalanceMonthsOf } from "@/lib/backtest/universe";
import { fetchMonthlyPrices, type MonthKey } from "@/lib/backtest/prices";
import { compute121Momentum, rankByFactor } from "@/lib/backtest/factor";
import { buildMultiFactorScores } from "@/lib/factors/pitMultifactor";
import {
  getMergedSnapshotsForUniverse,
  getSecHistoryForUniverse,
} from "@/lib/fundamentals/cache";

export interface AdviceInputStudy {
  // Subset of Study used by the scheduler — keeps the public API minimal so
  // the cron endpoint can pass a Prisma row directly.
  id: string;
  factorMix: string;
  rebalance: string;
  // We keep startDate / endDate for symmetry with backtest, but the scheduler
  // ignores endDate — it always evaluates "today" (the latest fully-closed
  // month Yahoo will return).
}

export interface AdviceResult {
  // YYYY-MM the advice is FOR — i.e. the latest fully-closed decision month
  // we could resolve from price data.
  asOfMonth: MonthKey;
  // Strategy's recommended holdings at asOfMonth, top quintile by factor
  // composite, alphabetically sorted (engine sorts by score DESC but the
  // caller usually just wants set comparisons, so we normalize).
  tickers: string[];
  // Average composite z-score of the suggested holdings (or raw 12-1
  // momentum for legacy studies). Useful for "the strategy is leaning
  // aggressively" sanity checks. Undefined when no factor data was usable.
  avgScore?: number;
}

const TOP_QUINTILE_PCT = 0.2;
const LOOKBACK_MONTHS_FOR_MOMENTUM = 15; // 12-1 needs 12, add 3 for buffer.

/**
 * Compute the strategy's current advised holdings. Returns null when prices
 * are insufficient to score any ticker (e.g. universe entirely missing —
 * shouldn't happen but defensive).
 */
export async function computeCurrentAdvice(
  study: AdviceInputStudy,
): Promise<AdviceResult | null> {
  const today = new Date();
  // Yahoo returns monthly closes through whatever month is currently in
  // progress; we let the factor code pick the latest month where a 12-1
  // momentum score actually resolves.
  const endDate = today;
  const startDate = new Date(
    Date.UTC(
      today.getUTCFullYear() - 2, // 2y of history is plenty for a single-month decision
      today.getUTCMonth(),
      1,
    ),
  );

  const prices = await fetchMonthlyPrices({
    tickers: [...UNIVERSE],
    startDate,
    endDate,
    lookbackMonths: LOOKBACK_MONTHS_FOR_MOMENTUM,
  });

  // Raw 12-1 momentum scores (always needed — either as the sole factor for
  // legacy studies or as the momentum leg of the multi-factor composite).
  const momentumScores = compute121Momentum(prices);

  // For multifactor studies, blend in Value + Quality using PIT-aligned SEC
  // history + Yahoo fundamentals via the same cache the runner uses.
  let composite = momentumScores;
  if (study.factorMix === "multifactor") {
    const tickers = [...UNIVERSE];
    const [yahooSnapshots, secHistory] = await Promise.all([
      getMergedSnapshotsForUniverse(tickers),
      getSecHistoryForUniverse(tickers),
    ]);
    composite = buildMultiFactorScores(
      momentumScores,
      yahooSnapshots,
      secHistory,
      prices,
    );
  }

  // Pick the latest month any ticker actually has a score at — that's the
  // decision month. Rank, then take top quintile.
  const monthsWithScores = new Set<MonthKey>();
  for (const t of Object.keys(composite)) {
    for (const m of composite[t].keys()) monthsWithScores.add(m);
  }
  const sortedMonths = Array.from(monthsWithScores).sort();
  if (sortedMonths.length === 0) return null;
  const asOfMonth = sortedMonths[sortedMonths.length - 1];
  const ranked = rankByFactor(composite, asOfMonth);
  if (ranked.length === 0) return null;
  const topN = Math.max(1, Math.floor(ranked.length * TOP_QUINTILE_PCT));
  const top = ranked.slice(0, topN);
  const tickers = top.map((r) => r.ticker).sort();
  const avgScore =
    top.reduce((sum, r) => sum + r.score, 0) / Math.max(1, top.length);
  // Suppress noisy NaN for legacy studies whose factor pipeline produced
  // non-finite intermediate values.
  return {
    asOfMonth,
    tickers,
    avgScore: Number.isFinite(avgScore) ? avgScore : undefined,
  };
}

/**
 * Cadence helper — given a study.rebalance label (e.g. "monthly", "quarterly"),
 * decide whether `month` is a rebalance month relative to `anchorMonth`.
 *
 * Used by the scheduler to skip advice generation for portfolios whose study
 * is quarterly when the current month isn't a quarter boundary from the
 * portfolio's anchor. This matches the engine's `rebalanceMonths` semantics.
 */
export function isRebalanceMonth(
  rebalanceLabel: string,
  anchorMonth: MonthKey,
  month: MonthKey,
): boolean {
  const cadence = rebalanceMonthsOf(rebalanceLabel);
  if (cadence <= 1) return true; // monthly = always
  const [ay, am] = anchorMonth.split("-").map(Number);
  const [my, mm] = month.split("-").map(Number);
  const monthsDiff = (my - ay) * 12 + (mm - am);
  return monthsDiff >= 0 && monthsDiff % cadence === 0;
}
