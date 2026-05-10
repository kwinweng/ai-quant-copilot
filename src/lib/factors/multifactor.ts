// Phase 4: cross-sectional multi-factor scoring.
//
// Each composite (Value, Quality, Growth) is a z-score average over its
// constituent fields, computed across the universe at a single point in time.
// Lower-is-better fields (PE, PB, PS, EV/EBITDA, debt/equity) are inverted
// before averaging so that "high score = good".
//
// The final multi-factor composite is itself an equal-weight z-score average
// of (Value, Quality, Momentum), where Momentum is supplied externally as
// the same 12-1 momentum already used in Phase 3.

import type { FundamentalSnapshot } from "@/lib/fundamentals/types";
import {
  VALUE_FIELDS,
  QUALITY_FIELDS,
  type FundamentalField,
} from "@/lib/fundamentals/types";

// Fields where lower numeric value is "better" (cheap valuations, low leverage).
const LOWER_IS_BETTER: ReadonlySet<FundamentalField> = new Set<FundamentalField>([
  "pe",
  "pb",
  "ps",
  "evEbitda",
  "debtToEquity",
]);

interface ZContext {
  mean: number;
  std: number;
  count: number;
  total: number; // total tickers considered (incl. missing)
}

function buildZContext(values: Array<number | undefined>): ZContext {
  const present = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  const total = values.length;
  if (present.length === 0) return { mean: 0, std: 0, count: 0, total };
  const mean = present.reduce((s, x) => s + x, 0) / present.length;
  const variance =
    present.reduce((s, x) => s + (x - mean) ** 2, 0) / present.length;
  const std = Math.sqrt(variance);
  return { mean, std, count: present.length, total };
}

function zscore(value: number | undefined, ctx: ZContext): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (ctx.std === 0 || ctx.count < 2) return 0;
  return (value - ctx.mean) / ctx.std;
}

export interface FactorScores {
  value?: number; // higher = better (cheap)
  quality?: number; // higher = better
  momentum?: number; // higher = better (already z-scored externally)
  composite?: number; // equal-weight average of available components
}

export interface FactorCoverageReport {
  // Per-field share of universe with non-null value, e.g. pe: 0.93
  byField: Record<FundamentalField, number>;
  // Per-composite share of universe with at least one component present.
  valueCoverage: number;
  qualityCoverage: number;
  // Tickers with no fundamentals data at all (after Yahoo+SEC merge).
  missingTickers: string[];
  generatedAt: string;
}

export function computeCoverage(
  tickers: readonly string[],
  fundamentals: Record<string, FundamentalSnapshot>,
): FactorCoverageReport {
  const total = tickers.length;
  const byField: Record<string, number> = {};
  for (const f of [...VALUE_FIELDS, ...QUALITY_FIELDS]) {
    let n = 0;
    for (const t of tickers) {
      const v = fundamentals[t]?.[f];
      if (typeof v === "number" && Number.isFinite(v)) n++;
    }
    byField[f] = total === 0 ? 0 : Math.round((n / total) * 1000) / 1000;
  }
  let valuePresent = 0;
  let qualityPresent = 0;
  for (const t of tickers) {
    const snap = fundamentals[t];
    if (!snap) continue;
    if (
      VALUE_FIELDS.some(
        (f) => typeof snap[f] === "number" && Number.isFinite(snap[f] as number),
      )
    ) {
      valuePresent++;
    }
    if (
      QUALITY_FIELDS.some(
        (f) => typeof snap[f] === "number" && Number.isFinite(snap[f] as number),
      )
    ) {
      qualityPresent++;
    }
  }
  const missingTickers = tickers.filter((t) => !fundamentals[t]);
  return {
    byField: byField as Record<FundamentalField, number>,
    valueCoverage: total === 0 ? 0 : Math.round((valuePresent / total) * 1000) / 1000,
    qualityCoverage:
      total === 0 ? 0 : Math.round((qualityPresent / total) * 1000) / 1000,
    missingTickers,
    generatedAt: new Date().toISOString(),
  };
}

interface MultiFactorScoresOptions {
  tickers: readonly string[];
  fundamentals: Record<string, FundamentalSnapshot>;
  // Momentum z-scores by ticker (already cross-sectionally normalized at the
  // decision month). Tickers without momentum get undefined and the composite
  // averages whatever components are available.
  momentumByTicker: Record<string, number | undefined>;
}

export interface MultiFactorScoreOutput {
  scores: Record<string, FactorScores>;
  // Components actually available per ticker — useful for transparency.
  components: Record<
    string,
    { value: boolean; quality: boolean; momentum: boolean }
  >;
}

export function computeMultiFactorScores(
  opts: MultiFactorScoresOptions,
): MultiFactorScoreOutput {
  const { tickers, fundamentals, momentumByTicker } = opts;

  // Build z-score contexts for each field cross-sectionally.
  const fieldContexts: Partial<Record<FundamentalField, ZContext>> = {};
  for (const f of [...VALUE_FIELDS, ...QUALITY_FIELDS]) {
    fieldContexts[f] = buildZContext(
      tickers.map((t) => fundamentals[t]?.[f]),
    );
  }

  const scores: Record<string, FactorScores> = {};
  const components: Record<
    string,
    { value: boolean; quality: boolean; momentum: boolean }
  > = {};

  for (const t of tickers) {
    const snap = fundamentals[t];
    const valueZs: number[] = [];
    const qualityZs: number[] = [];

    if (snap) {
      for (const f of VALUE_FIELDS) {
        const ctx = fieldContexts[f];
        if (!ctx) continue;
        const z = zscore(snap[f], ctx);
        if (z !== undefined) {
          valueZs.push(LOWER_IS_BETTER.has(f) ? -z : z);
        }
      }
      for (const f of QUALITY_FIELDS) {
        const ctx = fieldContexts[f];
        if (!ctx) continue;
        const z = zscore(snap[f], ctx);
        if (z !== undefined) {
          qualityZs.push(LOWER_IS_BETTER.has(f) ? -z : z);
        }
      }
    }

    const value =
      valueZs.length > 0
        ? valueZs.reduce((s, x) => s + x, 0) / valueZs.length
        : undefined;
    const quality =
      qualityZs.length > 0
        ? qualityZs.reduce((s, x) => s + x, 0) / qualityZs.length
        : undefined;
    const momentum = momentumByTicker[t];

    const components_ = {
      value: value !== undefined,
      quality: quality !== undefined,
      momentum: momentum !== undefined && Number.isFinite(momentum),
    };

    const composites: number[] = [];
    if (value !== undefined) composites.push(value);
    if (quality !== undefined) composites.push(quality);
    if (momentum !== undefined && Number.isFinite(momentum))
      composites.push(momentum);
    const composite =
      composites.length > 0
        ? composites.reduce((s, x) => s + x, 0) / composites.length
        : undefined;

    scores[t] = { value, quality, momentum, composite };
    components[t] = components_;
  }

  return { scores, components };
}

/**
 * Convert raw 12-1 momentum values (from compute121Momentum) into cross-
 * sectional z-scores at a single decision month. Used by the runner so the
 * multi-factor composite mixes momentum on the same scale as Value/Quality.
 */
export function zscoreMomentumAtMonth(
  rawByTicker: Record<string, number | undefined>,
): Record<string, number | undefined> {
  const tickers = Object.keys(rawByTicker);
  const ctx = buildZContext(tickers.map((t) => rawByTicker[t]));
  const out: Record<string, number | undefined> = {};
  for (const t of tickers) {
    out[t] = zscore(rawByTicker[t], ctx);
  }
  return out;
}
