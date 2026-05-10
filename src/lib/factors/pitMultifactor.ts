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
import type { MonthKey, MonthlyPrices } from "@/lib/backtest/prices";
import {
  historicalMarketCap,
  valueRatiosFromInputs,
  type HistoricalValueRatios,
} from "./historicalValue";

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
 *   (c) Phase 5: per-month PIT Value z-scores. Historical PE/PB/PS computed
 *       from MarketCap_M = MarketCap_today × (adjclose_M / adjclose_today)
 *       divided by SEC NetIncomeTTM / Revenues / StockholdersEquity at the
 *       PIT-visible filing. EV/EBITDA still falls back to Yahoo's static
 *       enterpriseToEbitda (Phase 5+ may compute it from SEC).
 *
 * Composite per (ticker, month) = mean of available components. A ticker
 * with no SEC visibility at month M still gets Yahoo-fallback Value +
 * Momentum; a ticker with no momentum signal in month M still gets
 * Value + Quality.
 *
 * After Phase 5 the strategy is fully PIT for the SEC-derivable factors.
 * Yahoo's static EV/EBITDA fallback (and tickers missing SEC data) remain
 * disclosed in the Result page's data quality panel.
 */
export function buildMultiFactorScores(
  momentumScores: FactorScores,
  yahooSnapshots: Record<string, FundamentalSnapshot>,
  secHistory: Record<string, FundamentalSnapshot[]>,
  // Phase 5: extra inputs for historical Value computation. When omitted
  // (e.g. tests that don't care about Value), the function falls back to
  // the pre-Phase-5 static Yahoo Value tilt — this keeps existing call
  // sites + tests green during the migration.
  prices?: MonthlyPrices,
): FactorScores {
  const tickers = Object.keys(momentumScores);
  if (tickers.length === 0) return {};

  // ----- Anchors for historical Value back-derivation -----
  const adjcloseToday: Record<string, number> = {};
  if (prices) {
    for (const t of tickers) {
      const series = prices[t];
      if (!series || series.size === 0) continue;
      let last: number | undefined;
      for (const v of series.values()) last = v;
      if (typeof last === "number" && Number.isFinite(last) && last > 0) {
        adjcloseToday[t] = last;
      }
    }
  }
  const useHistoricalValue =
    prices != null &&
    Object.values(yahooSnapshots).some(
      (s) => typeof s?.marketCap === "number" && (s.marketCap ?? 0) > 0,
    );

  // ----- Static Yahoo Value tilt (fallback / Phase 4-style) -----
  // Always computed because EV/EBITDA only has a Yahoo source, and because
  // tickers without SEC absolute USD inputs (or without a marketCap anchor)
  // still benefit from a Yahoo-restated tilt rather than zero contribution.
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
  const peYZ = crossSectionalZ(collectYahoo("pe"), true);
  const pbYZ = crossSectionalZ(collectYahoo("pb"), true);
  const psYZ = crossSectionalZ(collectYahoo("ps"), true);
  const evZ = crossSectionalZ(collectYahoo("evEbitda"), true);
  const yahooValueZByTicker = new Map<string, number>();
  for (const t of tickers) {
    const parts: number[] = [];
    for (const m of [peYZ, pbYZ, psYZ, evZ]) {
      const v = m.get(t);
      if (v !== undefined) parts.push(v);
    }
    if (parts.length > 0) {
      yahooValueZByTicker.set(
        t,
        parts.reduce((s, x) => s + x, 0) / parts.length,
      );
    }
  }
  // Yahoo-only EV/EBITDA z-score broken out so we can blend it with the
  // historical PE/PB/PS z (Phase 5) when prices are available.
  const yahooEvZByTicker = new Map<string, number>();
  for (const t of tickers) {
    const v = evZ.get(t);
    if (v !== undefined) yahooEvZByTicker.set(t, v);
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

  // ----- (c) Per-month PIT Value z-scores (Phase 5) -----
  // For each month, build {ticker → historical PE/PB/PS} using
  //   MarketCap_M = MarketCap_today × (adjclose_M / adjclose_today)
  //   ratio = MarketCap_M / SEC absolute denominator from PIT-visible filing
  // Then z-score each ratio cross-sectionally and average. Falls back to
  // the static Yahoo Value z when prices aren't supplied or when the
  // ticker lacks the inputs at this month.
  const monthValueZ = new Map<MonthKey, Map<string, number>>();
  if (useHistoricalValue) {
    for (const month of sortedMonths) {
      const cutoff = monthKeyToCutoff(month, REPORTING_LAG_DAYS);
      const peVals = new Map<string, number>();
      const pbVals = new Map<string, number>();
      const psVals = new Map<string, number>();
      for (const t of tickers) {
        const adjAtM = prices![t]?.get(month);
        const today = adjcloseToday[t];
        const mcapToday = yahooSnapshots[t]?.marketCap;
        const histMcap = historicalMarketCap(mcapToday, today, adjAtM);
        const pitSnap = pickSnapshotAsOf(secHistory[t], cutoff);
        const ratios: HistoricalValueRatios = valueRatiosFromInputs(
          histMcap,
          pitSnap,
        );
        if (ratios.pe !== undefined) peVals.set(t, ratios.pe);
        if (ratios.pb !== undefined) pbVals.set(t, ratios.pb);
        if (ratios.ps !== undefined) psVals.set(t, ratios.ps);
      }
      const peZ_t = crossSectionalZ(peVals, true);
      const pbZ_t = crossSectionalZ(pbVals, true);
      const psZ_t = crossSectionalZ(psVals, true);
      const out = new Map<string, number>();
      for (const t of tickers) {
        const parts: number[] = [];
        for (const m of [peZ_t, pbZ_t, psZ_t]) {
          const v = m.get(t);
          if (v !== undefined) parts.push(v);
        }
        // Blend EV/EBITDA from the static Yahoo z-score — the only Value
        // sub-factor without a historical equivalent.
        const evV = yahooEvZByTicker.get(t);
        if (evV !== undefined) parts.push(evV);
        if (parts.length === 0) {
          // Fall back to fully-static Yahoo Value when no historical inputs
          // landed for this ticker at this month.
          const fallback = yahooValueZByTicker.get(t);
          if (fallback !== undefined) out.set(t, fallback);
        } else {
          out.set(t, parts.reduce((s, x) => s + x, 0) / parts.length);
        }
      }
      monthValueZ.set(month, out);
    }
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
  // Phase 5: Value contribution is now month-varying (monthValueZ) when
  // historical inputs are available, falling back to the static Yahoo z
  // (yahooValueZByTicker) otherwise. The composite formula itself is
  // unchanged: arithmetic mean of available z-scores at each (ticker, M).
  const composite: FactorScores = {};
  for (const t of tickers) {
    const m = new Map<MonthKey, number>();
    const staticValueZ = yahooValueZByTicker.get(t);
    for (const month of sortedMonths) {
      const momZ = monthMomZ.get(month)?.get(t);
      const qualZ = monthQualityZ.get(month)?.get(t);
      const histValueZ = monthValueZ.get(month)?.get(t);
      const valueZ = histValueZ ?? staticValueZ;
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
