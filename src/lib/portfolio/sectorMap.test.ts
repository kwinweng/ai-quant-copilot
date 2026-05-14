// Phase 14 — sectorMap.ts unit tests.
//
// Critical guarantees:
//   1. Every ticker in UNIVERSE has a sector mapping (no "Unknown" in prod)
//   2. sectorAllocationFromWeights sums to the same total as input weights

import { describe, expect, it } from "vitest";
import { UNIVERSE } from "../backtest/universe";
import {
  sectorOf,
  sectorAllocationFromWeights,
  TICKER_TO_SECTOR,
} from "./sectorMap";

describe("sectorMap coverage", () => {
  it("every ticker in UNIVERSE has a sector mapping", () => {
    const missing: string[] = [];
    for (const t of UNIVERSE) {
      if (sectorOf(t) === "Unknown") missing.push(t);
    }
    expect(missing).toEqual([]);
  });

  it("no sector mapping points to an empty string", () => {
    for (const [ticker, sector] of Object.entries(TICKER_TO_SECTOR)) {
      expect(sector).toBeTruthy();
      expect(typeof sector).toBe("string");
      // ticker should be valid uppercase
      expect(/^[A-Z\-]+$/.test(ticker)).toBe(true);
    }
  });

  it("sectorAllocationFromWeights aggregates correctly for a Tech-heavy book", () => {
    const w = { AAPL: 0.4, MSFT: 0.3, JPM: 0.3 };
    const agg = sectorAllocationFromWeights(w);
    expect(agg.Tech).toBeCloseTo(0.7, 6);
    expect(agg.Financials).toBeCloseTo(0.3, 6);
  });

  it("sectorAllocationFromWeights ignores zero/negative weights", () => {
    const w = { AAPL: 0.5, MSFT: 0, JPM: -0.1, JNJ: 0.5 };
    const agg = sectorAllocationFromWeights(w);
    expect(agg.Tech).toBeCloseTo(0.5, 6);
    expect(agg.Healthcare).toBeCloseTo(0.5, 6);
    expect(agg.Financials).toBeUndefined();
  });

  it("sectorAllocationFromWeights preserves total weight (no constraint, no leakage)", () => {
    const w = { AAPL: 0.25, JPM: 0.2, JNJ: 0.15, BA: 0.4 };
    const agg = sectorAllocationFromWeights(w);
    const total = Object.values(agg).reduce((s, x) => s + x, 0);
    expect(total).toBeCloseTo(1.0, 6);
  });
});
