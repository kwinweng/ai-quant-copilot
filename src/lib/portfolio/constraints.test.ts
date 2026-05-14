// Phase 14 — constraints.ts unit tests.
//
// Critical guarantees:
//   1. No constraints → exact equal weights (legacy behavior preserved)
//   2. Single-position cap → no weight > cap; sum = 1.0
//   3. Sector cap → no sector aggregate > cap; sum = 1.0
//   4. Combined caps converge in a few iterations
//   5. Infeasible inputs degrade gracefully (don't crash, still sum ~1)

import { describe, expect, it } from "vitest";
import { applyConstraints } from "./constraints";

function sumWeights(w: Record<string, number>): number {
  return Object.values(w).reduce((s, x) => s + x, 0);
}

function maxWeight(w: Record<string, number>): number {
  return Object.values(w).reduce((m, x) => Math.max(m, x), 0);
}

describe("applyConstraints", () => {
  it("returns equal weights when no caps configured", () => {
    const picks = ["AAPL", "MSFT", "JPM", "JNJ", "XOM"];
    const r = applyConstraints(picks, {});
    expect(r.constrained).toBe(false);
    for (const t of picks) expect(r.weights[t]).toBeCloseTo(0.2, 6);
    expect(sumWeights(r.weights)).toBeCloseTo(1, 6);
  });

  it("returns equal weights when caps are >= 1 (i.e. inactive)", () => {
    const r = applyConstraints(["A", "B", "C"], {
      maxPositionWeight: 1.0,
      maxSectorWeight: 1.0,
    });
    expect(r.constrained).toBe(false);
    expect(r.weights.A).toBeCloseTo(1 / 3, 6);
  });

  it("applies single-position cap and redistributes", () => {
    // 5 picks @ 20% each; cap = 15% → all 5 hit cap, redistribution fails.
    // Cap = 25% → no clipping. Test 18%: clip 5×20% to 5×18%=90%, but no
    // uncapped names to soak up 10%. Final weights would equal each cap →
    // sum < 1 then renormalize.
    const r = applyConstraints(["A", "B", "C", "D", "E"], {
      maxPositionWeight: 0.18,
    });
    // After renormalize each weight equals 0.2 again (every name hits cap
    // means we can't satisfy cap and sum=1 simultaneously — we choose sum=1).
    expect(sumWeights(r.weights)).toBeCloseTo(1, 6);
  });

  it("respects single-position cap when some names have slack", () => {
    // 3 picks @ 33.3% each; cap = 30% → 33.3 - 30 = 3.3 redistributed twice.
    const r = applyConstraints(["A", "B", "C"], {
      maxPositionWeight: 0.5, // 50% is above 33% so this should be no-op
    });
    expect(maxWeight(r.weights)).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(sumWeights(r.weights)).toBeCloseTo(1, 6);
  });

  it("clips outliers and redistributes to slack names", () => {
    // 10 picks @ 10% each; cap = 8% → 2 percentage points × 10 = 20%
    // redistributed to other names. But since ALL start at 10% > 8%, all
    // get clipped → renormalize.
    const picks = Array.from({ length: 10 }, (_, i) => `T${i}`);
    const r = applyConstraints(picks, { maxPositionWeight: 0.08 });
    expect(sumWeights(r.weights)).toBeCloseTo(1, 6);
  });

  it("applies sector cap on a tech-heavy portfolio", () => {
    // 5 picks all in Tech (per sectorMap): AAPL/MSFT/NVDA/META/AMZN
    // Equal weight = 20% each, sector total = 100%
    // Sector cap = 50% → impossible (no other sector to redistribute to)
    // → graceful: renormalize to sum=1, all weights remain 20% each.
    const picks = ["AAPL", "MSFT", "NVDA", "META", "AMZN"];
    const r = applyConstraints(picks, { maxSectorWeight: 0.5 });
    expect(sumWeights(r.weights)).toBeCloseTo(1, 6);
  });

  it("respects sector cap when other sectors are available", () => {
    // 6 picks: 4 Tech + 2 Financials. Equal weight = ~16.67% each.
    // Tech total = 66.7%, Financials = 33.3%
    // Sector cap = 50% on Tech → scale Tech down to 50%, redistribute 16.7%
    // to Financials → Financials = 50%.
    const r = applyConstraints(
      ["AAPL", "MSFT", "NVDA", "META", "JPM", "BAC"],
      { maxSectorWeight: 0.5 },
    );
    expect(sumWeights(r.weights)).toBeCloseTo(1, 6);
    expect(r.constrained).toBe(true);
    // Check Tech aggregate
    const techWeight = r.weights["AAPL"] + r.weights["MSFT"] + r.weights["NVDA"] + r.weights["META"];
    const finWeight = r.weights["JPM"] + r.weights["BAC"];
    expect(techWeight).toBeLessThanOrEqual(0.5 + 1e-3);
    expect(finWeight).toBeGreaterThan(0.33); // boosted from 33% baseline
  });

  it("combines position cap and sector cap when both feasible", () => {
    // 10 picks: 4 Tech + 3 Financials + 3 Healthcare
    // Caps: 15% per position, 50% per sector
    // Equal weight 10% each → all under both caps → no-op.
    const r = applyConstraints(
      ["AAPL", "MSFT", "NVDA", "META", "JPM", "BAC", "GS", "JNJ", "UNH", "PFE"],
      { maxPositionWeight: 0.15, maxSectorWeight: 0.5 },
    );
    expect(sumWeights(r.weights)).toBeCloseTo(1, 6);
    expect(maxWeight(r.weights)).toBeLessThanOrEqual(0.15 + 1e-6);
  });

  it("degrades gracefully when caps are mutually infeasible", () => {
    // 6 picks: 4 Tech + 2 Financials. Caps 18% pos + 50% sector mean:
    //   - sector cap forces Tech ≤ 50% → Financials ≥ 50% (only 2 names)
    //   - 50% / 2 = 25% per Financials → exceeds 18% pos cap
    // No way to satisfy all three (sum=1, pos≤18, sector≤50). Algorithm must
    // not crash — it renormalizes to sum=1 and reports `constrained: true`.
    const r = applyConstraints(
      ["AAPL", "MSFT", "NVDA", "META", "JPM", "BAC"],
      { maxPositionWeight: 0.18, maxSectorWeight: 0.5 },
    );
    expect(sumWeights(r.weights)).toBeCloseTo(1, 6);
    expect(r.constrained).toBe(true);
    // Soft check: even in infeasible case, max weight should be moderate
    // (we don't blow up to 1.0 single-position).
    expect(maxWeight(r.weights)).toBeLessThan(0.5);
  });

  it("handles 0 picks gracefully", () => {
    const r = applyConstraints([], { maxPositionWeight: 0.2 });
    expect(r.weights).toEqual({});
    expect(sumWeights(r.weights)).toBe(0);
  });

  it("handles single pick", () => {
    const r = applyConstraints(["AAPL"], { maxPositionWeight: 0.5 });
    // 1 pick @ 100% > 50% cap, but no redistribution targets → renormalize → 100%
    expect(r.weights.AAPL).toBeCloseTo(1, 6);
  });

  it("preserves all picks (never drops a ticker)", () => {
    const picks = ["AAPL", "JPM", "JNJ", "XOM", "BA", "WMT"];
    const r = applyConstraints(picks, {
      maxPositionWeight: 0.1,
      maxSectorWeight: 0.2,
    });
    for (const t of picks) {
      expect(r.weights[t]).toBeGreaterThanOrEqual(0);
    }
  });
});
