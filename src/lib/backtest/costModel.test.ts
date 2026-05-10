import { describe, it, expect } from "vitest";
import {
  costFunctionForMode,
  liquidityTierOf,
  simpleCost,
  tieredCost,
  tieredBaseBps,
  tierAssignmentGapsForUniverse,
  tierMix,
} from "./costModel";

describe("liquidityTierOf", () => {
  it("classifies known mega-caps as mega", () => {
    expect(liquidityTierOf("AAPL")).toBe("mega");
    expect(liquidityTierOf("MSFT")).toBe("mega");
    expect(liquidityTierOf("NVDA")).toBe("mega");
  });

  it("classifies large-caps as large", () => {
    expect(liquidityTierOf("JPM")).toBe("large");
    expect(liquidityTierOf("WMT")).toBe("large");
    expect(liquidityTierOf("DIS")).toBe("large");
  });

  it("classifies mid / fading names as mid", () => {
    expect(liquidityTierOf("KSS")).toBe("mid");
    expect(liquidityTierOf("X")).toBe("mid");
    expect(liquidityTierOf("F")).toBe("mid");
    expect(liquidityTierOf("INTC")).toBe("mid");
  });

  it("falls back to mid for unknown tickers (conservative)", () => {
    expect(liquidityTierOf("UNKNOWN_TICKER_XYZ")).toBe("mid");
  });
});

describe("tieredBaseBps", () => {
  it("mega < large < mid (sanity check on tier ordering)", () => {
    expect(tieredBaseBps("AAPL")).toBeLessThan(tieredBaseBps("JPM"));
    expect(tieredBaseBps("JPM")).toBeLessThan(tieredBaseBps("KSS"));
  });

  it("returns 1 / 4 / 10 bps for the three tiers (calibrated values)", () => {
    expect(tieredBaseBps("AAPL")).toBe(1);
    expect(tieredBaseBps("JPM")).toBe(4);
    expect(tieredBaseBps("KSS")).toBe(10);
  });
});

describe("simpleCost (legacy uniform-bps)", () => {
  it("drag = turnover × bps / 10000", () => {
    const drag = simpleCost({
      prevHoldings: ["A", "B"],
      nextHoldings: ["A", "C"],
      turnover: 0.5,
      userCommissionBps: 10,
    });
    // 0.5 × 10/10000 = 0.0005
    expect(drag).toBeCloseTo(0.0005, 8);
  });

  it("returns 0 for zero turnover", () => {
    expect(
      simpleCost({
        prevHoldings: ["A"],
        nextHoldings: ["A"],
        turnover: 0,
        userCommissionBps: 10,
      }),
    ).toBe(0);
  });

  it("ignores ticker identity entirely (uniform)", () => {
    // Mega-cap vs mid-cap with same turnover → same cost in simple model.
    const a = simpleCost({
      prevHoldings: ["AAPL"],
      nextHoldings: ["MSFT"],
      turnover: 0.5,
      userCommissionBps: 10,
    });
    const b = simpleCost({
      prevHoldings: ["KSS"],
      nextHoldings: ["X"],
      turnover: 0.5,
      userCommissionBps: 10,
    });
    expect(a).toBe(b);
  });
});

describe("tieredCost (Phase 7 realistic model)", () => {
  it("returns 0 for zero turnover", () => {
    expect(
      tieredCost({
        prevHoldings: ["AAPL"],
        nextHoldings: ["AAPL"],
        turnover: 0,
        userCommissionBps: 10,
      }),
    ).toBe(0);
  });

  it("first rebalance (empty prev) uses nextHoldings for spread average", () => {
    const drag = tieredCost({
      prevHoldings: [],
      nextHoldings: ["AAPL"], // mega = 1 bps spread
      turnover: 1,
      userCommissionBps: 0,
    });
    // base 1 bps + sqrt(1) × 5 bps + 0 commission = 6 bps
    // drag = 1.0 × 6 / 10000 = 0.0006
    expect(drag).toBeCloseTo(0.0006, 8);
  });

  it("changed-ticker average drives the spread component", () => {
    // Trading away a mega-cap and into a mid-cap → average spread is (1+10)/2 = 5.5 bps
    const drag = tieredCost({
      prevHoldings: ["AAPL", "MSFT"],
      nextHoldings: ["MSFT", "KSS"], // changed: AAPL out, KSS in
      turnover: 0.5,
      userCommissionBps: 0,
    });
    // avg(1, 10) = 5.5 spread, sqrt(0.5) ≈ 0.707, impact ≈ 3.54 bps
    // total ≈ 9.04 bps; drag = 0.5 × 9.04 / 10000 ≈ 0.000452
    expect(drag).toBeCloseTo(0.5 * (5.5 + Math.sqrt(0.5) * 5) / 10000, 8);
  });

  it("user commission stacks on top of spread + impact", () => {
    const noComm = tieredCost({
      prevHoldings: ["AAPL"],
      nextHoldings: ["MSFT"],
      turnover: 0.5,
      userCommissionBps: 0,
    });
    const withComm = tieredCost({
      prevHoldings: ["AAPL"],
      nextHoldings: ["MSFT"],
      turnover: 0.5,
      userCommissionBps: 10,
    });
    // User commission of 10 bps × turnover 0.5 = 5 bps drag added.
    expect(withComm - noComm).toBeCloseTo(0.5 * 10 / 10000, 8);
  });

  it("mid-cap-heavy portfolio costs more than mega-cap-heavy at same turnover", () => {
    const megaCost = tieredCost({
      prevHoldings: [],
      nextHoldings: ["AAPL", "MSFT", "NVDA"],
      turnover: 1,
      userCommissionBps: 0,
    });
    const midCost = tieredCost({
      prevHoldings: [],
      nextHoldings: ["KSS", "X", "GE"],
      turnover: 1,
      userCommissionBps: 0,
    });
    expect(midCost).toBeGreaterThan(megaCost);
  });

  it("market impact scales as sqrt(turnover) — more rebalance, disproportionately more cost per unit", () => {
    const small = tieredCost({
      prevHoldings: [],
      nextHoldings: ["AAPL"],
      turnover: 0.1,
      userCommissionBps: 0,
    });
    const big = tieredCost({
      prevHoldings: [],
      nextHoldings: ["AAPL"],
      turnover: 1.0,
      userCommissionBps: 0,
    });
    // big / small should be > 10 (linear) since impact is super-linear in turnover.
    // small drag = 0.1 × (1 + sqrt(0.1)×5) ≈ 0.1 × 2.58 = 0.258 bps
    // big drag  = 1.0 × (1 + sqrt(1.0)×5) = 6 bps
    // ratio ≈ 23 — significantly more than 10.
    expect(big / small).toBeGreaterThan(15);
  });
});

describe("costFunctionForMode", () => {
  it("returns simpleCost for 'simple'", () => {
    expect(costFunctionForMode("simple")).toBe(simpleCost);
  });

  it("returns tieredCost for 'tiered'", () => {
    expect(costFunctionForMode("tiered")).toBe(tieredCost);
  });
});

describe("tierMix", () => {
  it("counts tickers per tier", () => {
    const mix = tierMix(["AAPL", "MSFT", "JPM", "KSS"]);
    expect(mix.mega).toBe(2);
    expect(mix.large).toBe(1);
    expect(mix.mid).toBe(1);
  });

  it("returns zeros for empty input", () => {
    expect(tierMix([])).toEqual({ mega: 0, large: 0, mid: 0 });
  });
});

describe("tierAssignmentGapsForUniverse", () => {
  it("every UNIVERSE ticker has an explicit tier assignment", () => {
    expect(tierAssignmentGapsForUniverse()).toEqual([]);
  });
});
