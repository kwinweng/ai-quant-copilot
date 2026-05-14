// Phase 14 — portfolio risk constraints.
//
// Applies single-position and sector caps to an equal-weight portfolio. The
// min_var optimizer is deferred (see ROADMAP.md). For now we:
//
//   1. Start from equal weights on the picked tickers
//   2. Cap any position > maxPositionWeight at the cap, redistribute excess
//      pro-rata to remaining names
//   3. Cap any sector > maxSectorWeight by scaling down all positions in
//      that sector, redistribute excess to other sectors pro-rata
//   4. Renormalize to sum = 1.0
//
// If after the redistribution loop the constraints still can't be satisfied
// (e.g., 5 picks all in Tech with sector cap 35%), we fall back to the
// nearest-feasible projection rather than raising — the alternative is
// crashing the backtest, which is worse UX than "best-effort cap honored".

import { sectorOf } from "./sectorMap";

export interface PortfolioConstraints {
  /** Single-position weight upper bound, 0..1. Default 0.20 = 20%. */
  maxPositionWeight?: number;
  /** Sector weight upper bound, 0..1. Default 0.35 = 35%. */
  maxSectorWeight?: number;
  /** Optimizer mode. Only "equal_weight" supported in Phase 14. */
  optimizer?: "equal_weight" | "min_var";
}

export interface ConstraintApplicationResult {
  weights: Record<string, number>;
  /** True if any cap was applied (caller may want to log "constrained" badge). */
  constrained: boolean;
  /** Whether the result fully satisfies all caps. False = best-effort fallback. */
  feasible: boolean;
}

const EPS = 1e-9;
const MAX_ITERATIONS = 32;

/**
 * Apply portfolio constraints to an equal-weight pick. Returns adjusted
 * weights summing to 1 (or 0 if input is empty).
 *
 * `picks` is the ranked top-N selection from the factor. We treat all picks
 * as eligible (i.e., we don't drop any) — capping just redistributes the
 * weight share.
 */
export function applyConstraints(
  picks: string[],
  constraints: PortfolioConstraints,
): ConstraintApplicationResult {
  const n = picks.length;
  if (n === 0) return { weights: {}, constrained: false, feasible: true };

  const maxPos = constraints.maxPositionWeight;
  const maxSec = constraints.maxSectorWeight;

  // Start with equal weights.
  const weights: Record<string, number> = {};
  const eq = 1 / n;
  for (const t of picks) weights[t] = eq;

  // No constraints → return equal-weight unchanged.
  if ((maxPos == null || maxPos >= 1) && (maxSec == null || maxSec >= 1)) {
    return { weights, constrained: false, feasible: true };
  }

  const sectorByTicker: Record<string, string> = {};
  for (const t of picks) sectorByTicker[t] = sectorOf(t);

  // Iteratively cap + redistribute. Two-phase per iteration: position caps
  // first, then sector caps. We bail out after MAX_ITERATIONS if we can't
  // converge (typically converges in 2-4 iterations for realistic inputs).
  let constrained = false;
  let feasible = false;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = false;

    // --- Phase 1: single-position cap -----------------------------------
    if (maxPos != null && maxPos < 1) {
      const cappedTickers = new Set<string>();
      let totalCapped = 0;
      for (const t of picks) {
        if (weights[t] > maxPos + EPS) {
          totalCapped += weights[t] - maxPos;
          weights[t] = maxPos;
          cappedTickers.add(t);
          constrained = true;
          changed = true;
        }
      }
      // Redistribute totalCapped to uncapped names pro-rata to their current weights.
      if (totalCapped > EPS) {
        const uncapped = picks.filter((t) => !cappedTickers.has(t));
        const uncappedSum = uncapped.reduce((s, t) => s + weights[t], 0);
        if (uncappedSum <= EPS) {
          // Everyone hit the cap — can't redistribute. Final sum will be < 1.
          // Caller renormalizes at the end.
          break;
        }
        for (const t of uncapped) {
          weights[t] += totalCapped * (weights[t] / uncappedSum);
        }
      }
    }

    // --- Phase 2: sector cap --------------------------------------------
    if (maxSec != null && maxSec < 1) {
      // Compute sector totals.
      const sectorTotals: Record<string, number> = {};
      for (const t of picks) {
        const s = sectorByTicker[t];
        sectorTotals[s] = (sectorTotals[s] ?? 0) + weights[t];
      }
      // For each over-cap sector, scale down its members proportionally.
      let totalShed = 0;
      const cappedSectors = new Set<string>();
      for (const [sector, total] of Object.entries(sectorTotals)) {
        if (total > maxSec + EPS) {
          const scale = maxSec / total;
          for (const t of picks) {
            if (sectorByTicker[t] === sector) {
              const shed = weights[t] * (1 - scale);
              weights[t] -= shed;
              totalShed += shed;
            }
          }
          cappedSectors.add(sector);
          constrained = true;
          changed = true;
        }
      }
      // Redistribute shed weight to other sectors' members pro-rata.
      if (totalShed > EPS) {
        const eligible = picks.filter(
          (t) => !cappedSectors.has(sectorByTicker[t]),
        );
        const eligibleSum = eligible.reduce((s, t) => s + weights[t], 0);
        if (eligibleSum <= EPS) {
          // All sectors capped → can't redistribute. Renormalize at the end.
          break;
        }
        for (const t of eligible) {
          weights[t] += totalShed * (weights[t] / eligibleSum);
        }
      }
    }

    if (!changed) {
      feasible = true;
      break;
    }
  }

  // Final renormalize so weights sum exactly to 1. The cap-and-redistribute
  // loop preserves the sum mathematically, but float drift accumulates.
  const sum = picks.reduce((s, t) => s + weights[t], 0);
  if (sum > EPS) {
    for (const t of picks) weights[t] /= sum;
  }

  return { weights, constrained, feasible };
}
