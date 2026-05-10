// Sprint #7: extracted from runner.ts so the PIT logic can be unit-tested
// without spinning up Prisma / the runner orchestration. All exports are pure
// functions — no I/O, no DB, no time-of-day side effects.
//
// History: these helpers (monthKeyToCutoff / pickSnapshotAsOf /
// crossSectionalZ / buildMultiFactorScores) lived inline in runner.ts since
// Phase 4.2. Moving them here is a no-behavior-change refactor; runner.ts
// now imports from this module.

import type { FundamentalSnapshot } from "@/lib/fundamentals/types";
import type { FactorScores } from "@/lib/backtest/factor";
import type { MonthKey } from "@/lib/backtest/prices";

// ============================================================
// Constants
// ============================================================

// Phase 4 PIT default — typical 10-K filing delay. Quality factor visibility
// at decision month M is gated by `reportedAt ≤ end-of-M − REPORTING_LAG_DAYS`.
export const REPORTING_LAG_DAYS = 90;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============================================================
// PIT cutoff
// ============================================================

/**
 * Phase 4 follow-up C1: align cutoff with engine semantics.
 *
 * The engine's loop uses scores[t][decisionMonth] to choose holdings, then
 * holds through performanceMonth = decisionMonth + 1. compute121Momentum
 * builds scores[t][M] from price[M-1] / price[M-12] − 1 (skip-1), so the
 * score at M is fully knowable at end-of-M-1 / start-of-M.
 *
 * Concretely: at decisionMonth M, the strategy is acting at the END of M
 * (immediately before performanceMonth begins). At that moment, every
 * filing with `filed ≤ end-of-M` is visible. Apply the reporting lag on
 * top of that to model "filings filed >= lag days ago are visible".
 *
 * end-of-M is the same instant as start-of-(M+1), so:
 *   cutoff = start-of-(M+1) − lagDays
 */
export function monthKeyToCutoff(month: MonthKey, lagDays: number): Date {
  const [y, m] = month.split("-").map(Number);
  // Date.UTC's month arg is 0-indexed; passing m (which is 1-indexed in our
  // MonthKey) yields the start of M+1.
  const nextMonthStart = Date.UTC(y, m, 1);
  return new Date(nextMonthStart - lagDays * MS_PER_DAY);
}

// ============================================================
// SEC as-of selection
// ============================================================

/**
 * Pick the latest SEC filing visible at `cutoff` time. History is assumed
 * sorted oldest-first by fiscalDate. We filter on `reportedAt` (the SEC
 * submission date), not `fiscalDate` — submissions can lag the fiscal end
 * by 60-90 days, and we must not leak future filings into earlier months.
 *
 * Returns undefined when no filing was visible by cutoff.
 */
export function pickSnapshotAsOf(
  history: FundamentalSnapshot[] | undefined,
  cutoff: Date,
): FundamentalSnapshot | undefined {
  if (!history || history.length === 0) return undefined;
  let pick: FundamentalSnapshot | undefined;
  for (const snap of history) {
    const filed = snap.reportedAt;
    if (!filed) continue;
    if (filed.getTime() <= cutoff.getTime()) {
      // Keep the *latest* qualifying filing — equivalent to the most recent
      // filing visible at cutoff time.
      if (
        !pick ||
        (pick.reportedAt && filed.getTime() > pick.reportedAt.getTime())
      ) {
        pick = snap;
      }
    }
  }
  return pick;
}

// ============================================================
// Cross-sectional z-score
// ============================================================

/**
 * Cross-sectional z-score over a single point in time.
 *
 * - Returns empty Map when fewer than 2 inputs (z is meaningless on 1 point)
 * - Returns empty Map when std == 0 (every input identical → can't normalize)
 * - lowerIsBetter=true negates the z so "better" always points positive
 *   (used for PE / PB / PS / EV-EBITDA / debt-to-equity which are good when low)
 */
export function crossSectionalZ(
  values: Map<string, number>,
  lowerIsBetter: boolean,
): Map<string, number> {
  if (values.size < 2) return new Map();
  const arr = Array.from(values.values());
  const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
  const std = Math.sqrt(
    arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length,
  );
  if (std === 0) return new Map();
  const out = new Map<string, number>();
  for (const [t, v] of values) {
    const z = (v - mean) / std;
    out.set(t, lowerIsBetter ? -z : z);
  }
  return out;
}

// ============================================================
// Multi-factor composite
// ============================================================

/**
 * Build month-varying multi-factor FactorScores combining:
 *   (a) per-month cross-sectional momentum z-scores (already month-varying),
 *   (b) per-month PIT Quality+Growth z-scores using SEC filings filed before
 *       month M − REPORTING_LAG_DAYS (eliminates look-ahead),
 *   (c) a *static* Yahoo Value tilt (PE/PB/PS/EV-EBITDA from current snapshot,
 *       since Yahoo has no historical API).
 *
 * Composite per (ticker, month) = mean of available components. A ticker
 * with no SEC visibility at month M still gets Value+Momentum; a ticker
 * with no momentum signal in month M still gets Value+Quality.
 *
 * Honest caveat: Yahoo Value is point-in-NOW, restated. Disclosed in the
 * Result page DataQualityCard (`混合 PIT`).
 */
export function buildMultiFactorScores(
  momentumScores: FactorScores,
  yahooSnapshots: Record<string, FundamentalSnapshot>,
  secHistory: Record<string, FundamentalSnapshot[]>,
): FactorScores {
  const tickers = Object.keys(momentumScores);
  if (tickers.length === 0) return {};

  // ----- (c) Static Yahoo Value tilt -----
  const collectYahoo = (
    field: keyof FundamentalSnapshot,
  ): Map<string, number> => {
    const m = new Map<string, number>();
    for (const t of tickers) {
      const v = yahooSnapshots[t]?.[field];
      if (typeof v === "number" && Number.isFinite(v)) m.set(t, v);
    }
    return m;
  };
  const peZ = crossSectionalZ(collectYahoo("pe"), true);
  const pbZ = crossSectionalZ(collectYahoo("pb"), true);
  const psZ = crossSectionalZ(collectYahoo("ps"), true);
  const evZ = crossSectionalZ(collectYahoo("evEbitda"), true);
  const valueZByTicker = new Map<string, number>();
  for (const t of tickers) {
    const parts: number[] = [];
    for (const m of [peZ, pbZ, psZ, evZ]) {
      const v = m.get(t);
      if (v !== undefined) parts.push(v);
    }
    if (parts.length > 0) {
      valueZByTicker.set(t, parts.reduce((s, x) => s + x, 0) / parts.length);
    }
  }

  // ----- Month axis -----
  const allMonths = new Set<MonthKey>();
  for (const t of tickers) {
    for (const k of momentumScores[t]?.keys() ?? []) allMonths.add(k);
  }
  const sortedMonths = Array.from(allMonths).sort();

  // ----- (a) Per-month cross-sectional momentum z-scores -----
  const monthMomZ = new Map<MonthKey, Map<string, number>>();
  for (const month of sortedMonths) {
    const vals = new Map<string, number>();
    for (const t of tickers) {
      const v = momentumScores[t]?.get(month);
      if (typeof v === "number" && Number.isFinite(v)) vals.set(t, v);
    }
    monthMomZ.set(month, crossSectionalZ(vals, false));
  }

  // ----- (b) Per-month PIT Quality+Growth z-scores using SEC history -----
  const monthQualityZ = new Map<MonthKey, Map<string, number>>();
  for (const month of sortedMonths) {
    const cutoff = monthKeyToCutoff(month, REPORTING_LAG_DAYS);
    const asOf = new Map<string, FundamentalSnapshot>();
    for (const t of tickers) {
      const pick = pickSnapshotAsOf(secHistory[t], cutoff);
      if (pick) asOf.set(t, pick);
    }
    if (asOf.size < 2) {
      monthQualityZ.set(month, new Map());
      continue;
    }
    const collect = (field: keyof FundamentalSnapshot) => {
      const m = new Map<string, number>();
      for (const [t, snap] of asOf) {
        const v = snap[field];
        if (typeof v === "number" && Number.isFinite(v)) m.set(t, v);
      }
      return m;
    };
    const roeZt = crossSectionalZ(collect("roe"), false);
    const roicZt = crossSectionalZ(collect("roic"), false);
    const gmZt = crossSectionalZ(collect("grossMargin"), false);
    const deZt = crossSectionalZ(collect("debtToEquity"), true);
    const out = new Map<string, number>();
    for (const t of tickers) {
      const parts: number[] = [];
      for (const m of [roeZt, roicZt, gmZt, deZt]) {
        const v = m.get(t);
        if (v !== undefined) parts.push(v);
      }
      if (parts.length > 0) {
        out.set(t, parts.reduce((s, x) => s + x, 0) / parts.length);
      }
    }
    monthQualityZ.set(month, out);
  }

  // ----- Composite: equal-weight mean of available components -----
  const composite: FactorScores = {};
  for (const t of tickers) {
    const m = new Map<MonthKey, number>();
    const valueZ = valueZByTicker.get(t);
    for (const month of sortedMonths) {
      const momZ = monthMomZ.get(month)?.get(t);
      const qualZ = monthQualityZ.get(month)?.get(t);
      const parts: number[] = [];
      if (momZ !== undefined) parts.push(momZ);
      if (valueZ !== undefined) parts.push(valueZ);
      if (qualZ !== undefined) parts.push(qualZ);
      if (parts.length === 0) continue;
      m.set(month, parts.reduce((s, x) => s + x, 0) / parts.length);
    }
    composite[t] = m;
  }
  return composite;
}
