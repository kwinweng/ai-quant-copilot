import { describe, it, expect } from "vitest";
import { equalWeight, valuatePortfolio } from "./valuation";

describe("equalWeight", () => {
  it("returns weights summing to 1 across all tickers", () => {
    const result = equalWeight(["A", "B", "C", "D"]);
    expect(result).toHaveLength(4);
    const total = result.reduce((s, h) => s + h.weight, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(result[0].weight).toBeCloseTo(0.25, 6);
  });

  it("returns empty array for empty input", () => {
    expect(equalWeight([])).toEqual([]);
  });

  it("preserves ticker order from input", () => {
    const result = equalWeight(["TSLA", "AAPL", "MSFT"]);
    expect(result.map((h) => h.ticker)).toEqual(["TSLA", "AAPL", "MSFT"]);
  });
});

describe("valuatePortfolio", () => {
  it("computes shares from initial weights × initial value ÷ start price", () => {
    // $100k initial, 50/50 split, both stocks at $100 start.
    // → 500 shares of each at start.
    const result = valuatePortfolio({
      holdings: [
        { ticker: "A", weight: 0.5 },
        { ticker: "B", weight: 0.5 },
      ],
      initialValue: 100_000,
      startedAt: "2020-01",
      prices: {
        A: { startPrice: 100, currentPrice: 100 },
        B: { startPrice: 100, currentPrice: 100 },
      },
    });
    expect(result.startValue).toBe(100_000);
    expect(result.currentValue).toBeCloseTo(100_000, 6);
    expect(result.totalReturnPct).toBeCloseTo(0, 6);
    expect(result.positions[0].shares).toBeCloseTo(500, 6);
    expect(result.positions[1].shares).toBeCloseTo(500, 6);
  });

  it("doubles value when both prices double (50/50)", () => {
    const result = valuatePortfolio({
      holdings: [
        { ticker: "A", weight: 0.5 },
        { ticker: "B", weight: 0.5 },
      ],
      initialValue: 100_000,
      startedAt: "2020-01",
      prices: {
        A: { startPrice: 100, currentPrice: 200 },
        B: { startPrice: 100, currentPrice: 200 },
      },
    });
    expect(result.currentValue).toBeCloseTo(200_000, 6);
    expect(result.totalReturnPct).toBeCloseTo(100, 6);
  });

  it("handles uneven weights correctly", () => {
    // 80% A doubled, 20% B halved → 0.8 × 2 + 0.2 × 0.5 = 1.7 → +70%
    const result = valuatePortfolio({
      holdings: [
        { ticker: "A", weight: 0.8 },
        { ticker: "B", weight: 0.2 },
      ],
      initialValue: 100_000,
      startedAt: "2020-01",
      prices: {
        A: { startPrice: 100, currentPrice: 200 },
        B: { startPrice: 100, currentPrice: 50 },
      },
    });
    expect(result.totalReturnPct).toBeCloseTo(70, 6);
    expect(result.currentValue).toBeCloseTo(170_000, 6);
  });

  it("marks unavailable tickers as such and excludes their slice from current value", () => {
    // A doubles, B has no price data → only A's 50% contributes to current value.
    const result = valuatePortfolio({
      holdings: [
        { ticker: "A", weight: 0.5 },
        { ticker: "B", weight: 0.5 },
      ],
      initialValue: 100_000,
      startedAt: "2020-01",
      prices: {
        A: { startPrice: 100, currentPrice: 200 },
        B: {}, // unavailable
      },
    });
    // A's slice was $50k → doubles → $100k. B's slice excluded.
    expect(result.currentValue).toBeCloseTo(100_000, 6);
    expect(result.positions[1].unavailable).toBe(true);
    expect(result.positions[1].shares).toBeUndefined();
    expect(result.positions[0].unavailable).toBe(false);
  });

  it("returns 0% return for zero initial value (degenerate)", () => {
    const result = valuatePortfolio({
      holdings: [{ ticker: "A", weight: 1 }],
      initialValue: 0,
      startedAt: "2020-01",
      prices: { A: { startPrice: 100, currentPrice: 200 } },
    });
    expect(result.totalReturnPct).toBe(0);
  });

  it("guards against zero or negative start price", () => {
    const result = valuatePortfolio({
      holdings: [{ ticker: "A", weight: 1 }],
      initialValue: 100_000,
      startedAt: "2020-01",
      prices: { A: { startPrice: 0, currentPrice: 100 } },
    });
    expect(result.positions[0].unavailable).toBe(true);
    expect(result.currentValue).toBe(0);
  });

  it("position ordering matches input holdings", () => {
    const result = valuatePortfolio({
      holdings: [
        { ticker: "C", weight: 0.3 },
        { ticker: "A", weight: 0.4 },
        { ticker: "B", weight: 0.3 },
      ],
      initialValue: 100_000,
      startedAt: "2020-01",
      prices: {
        A: { startPrice: 100, currentPrice: 100 },
        B: { startPrice: 100, currentPrice: 100 },
        C: { startPrice: 100, currentPrice: 100 },
      },
    });
    expect(result.positions.map((p) => p.ticker)).toEqual(["C", "A", "B"]);
  });
});
