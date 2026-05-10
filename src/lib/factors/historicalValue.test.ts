import { describe, it, expect } from "vitest";
import {
  historicalMarketCap,
  latestAdjcloseByTicker,
  valueRatiosAtMonth,
  valueRatiosFromInputs,
} from "./historicalValue";
import type { FundamentalSnapshot } from "@/lib/fundamentals/types";
import type { MonthlyPrices } from "@/lib/backtest/prices";

function snap(
  partial: Partial<FundamentalSnapshot>,
): FundamentalSnapshot {
  return {
    ticker: partial.ticker ?? "AAPL",
    source: "sec",
    fiscalDate: partial.fiscalDate ?? new Date("2020-12-31"),
    reportedAt: partial.reportedAt,
    ...partial,
  };
}

describe("historicalMarketCap", () => {
  it("returns MarketCap_today × (adjclose_M / adjclose_today)", () => {
    // MarketCap_today = $1T, today's adjclose = 100, M's adjclose = 50
    // → MarketCap_M = 1T × 0.5 = $500B
    expect(historicalMarketCap(1_000_000_000_000, 100, 50)).toBeCloseTo(
      500_000_000_000,
      0,
    );
  });

  it("is split-invariant: split halves price, doubles shares — MarketCap unchanged", () => {
    // Same logical company, hypothetical 2-for-1 split. adjclose_today divides
    // by 2; MarketCap_today is unchanged. Pre-split month's adjclose is also
    // post-adjustment (divided by 2). Ratio cancels out → correct historical
    // MarketCap.
    const beforeSplit = historicalMarketCap(1_000_000_000_000, 100, 80);
    const afterSplit = historicalMarketCap(1_000_000_000_000, 50, 40);
    expect(beforeSplit).toBeCloseTo(afterSplit!, 0);
    expect(beforeSplit).toBeCloseTo(800_000_000_000, 0);
  });

  it("returns undefined when any input is missing or non-finite", () => {
    expect(historicalMarketCap(undefined, 100, 50)).toBeUndefined();
    expect(historicalMarketCap(1, undefined, 50)).toBeUndefined();
    expect(historicalMarketCap(1, 100, undefined)).toBeUndefined();
    expect(historicalMarketCap(NaN, 100, 50)).toBeUndefined();
    expect(historicalMarketCap(1, 0, 50)).toBeUndefined(); // adjcloseToday = 0 → divide-by-zero guard
  });
});

describe("valueRatiosFromInputs", () => {
  it("PE / PB / PS = MarketCap / (NI / equity / revenues)", () => {
    const r = valueRatiosFromInputs(
      100_000_000_000, // $100B MarketCap
      snap({
        netIncomeTTM: 5_000_000_000, // $5B
        stockholdersEquity: 50_000_000_000, // $50B
        revenuesTTM: 20_000_000_000, // $20B
      }),
    );
    expect(r.pe).toBeCloseTo(20, 6); // 100/5
    expect(r.pb).toBeCloseTo(2, 6); // 100/50
    expect(r.ps).toBeCloseTo(5, 6); // 100/20
  });

  it("drops PE when net income is negative or zero (factor convention)", () => {
    const r = valueRatiosFromInputs(
      100_000_000_000,
      snap({
        netIncomeTTM: -1_000_000_000, // loss
        stockholdersEquity: 50_000_000_000,
        revenuesTTM: 20_000_000_000,
      }),
    );
    expect(r.pe).toBeUndefined();
    // PB / PS still computed — they're meaningful for unprofitable firms.
    expect(r.pb).toBeCloseTo(2, 6);
    expect(r.ps).toBeCloseTo(5, 6);
  });

  it("returns empty object when MarketCap or snapshot missing", () => {
    expect(
      valueRatiosFromInputs(undefined, snap({ netIncomeTTM: 1 })),
    ).toEqual({});
    expect(valueRatiosFromInputs(1_000_000, undefined)).toEqual({});
  });

  it("handles each ratio independently when its denominator is missing", () => {
    const r = valueRatiosFromInputs(
      100_000_000_000,
      snap({
        netIncomeTTM: 5_000_000_000,
        // stockholdersEquity missing
        revenuesTTM: 20_000_000_000,
      }),
    );
    expect(r.pe).toBeCloseTo(20, 6);
    expect(r.pb).toBeUndefined();
    expect(r.ps).toBeCloseTo(5, 6);
  });
});

describe("valueRatiosAtMonth", () => {
  it("computes per-ticker ratios using PIT inputs", () => {
    const prices: MonthlyPrices = {
      A: new Map([
        ["2020-01", 100],
        ["2020-06", 80], // historical
        ["2020-12", 110], // "today"
      ]),
      B: new Map([
        ["2020-01", 50],
        ["2020-06", 40],
        ["2020-12", 55],
      ]),
    };
    const adjcloseToday = { A: 110, B: 55 };
    const marketCapToday = {
      A: 1_100_000_000_000, // $1.1T → MarketCap at 2020-06 = 1.1T × (80/110) = $800B
      B: 110_000_000_000, // $110B → MarketCap at 2020-06 = 110B × (40/55) = $80B
    };
    const pitSnap: Record<string, FundamentalSnapshot> = {
      A: snap({
        ticker: "A",
        netIncomeTTM: 40_000_000_000, // PE = 800B/40B = 20
        stockholdersEquity: 200_000_000_000, // PB = 800B/200B = 4
        revenuesTTM: 100_000_000_000, // PS = 800B/100B = 8
      }),
      B: snap({
        ticker: "B",
        netIncomeTTM: 4_000_000_000, // PE = 80B/4B = 20
        stockholdersEquity: 40_000_000_000, // PB = 80B/40B = 2
        revenuesTTM: 16_000_000_000, // PS = 80B/16B = 5
      }),
    };

    const out = valueRatiosAtMonth(
      "2020-06",
      ["A", "B"],
      prices,
      adjcloseToday,
      marketCapToday,
      pitSnap,
    );
    expect(out.size).toBe(2);
    expect(out.get("A")?.pe).toBeCloseTo(20, 4);
    expect(out.get("A")?.pb).toBeCloseTo(4, 4);
    expect(out.get("A")?.ps).toBeCloseTo(8, 4);
    expect(out.get("B")?.pe).toBeCloseTo(20, 4);
    expect(out.get("B")?.pb).toBeCloseTo(2, 4);
    expect(out.get("B")?.ps).toBeCloseTo(5, 4);
  });

  it("omits tickers with no price data at the requested month", () => {
    const prices: MonthlyPrices = {
      A: new Map([["2020-12", 100]]),
      B: new Map(), // no data
    };
    const out = valueRatiosAtMonth(
      "2020-06",
      ["A", "B"],
      prices,
      { A: 100 },
      { A: 1_000_000_000 },
      {
        A: snap({ ticker: "A", netIncomeTTM: 50_000_000 }),
        B: snap({ ticker: "B", netIncomeTTM: 1_000_000 }),
      },
    );
    expect(out.has("B")).toBe(false);
    // A also has no price at 2020-06 → also dropped
    expect(out.has("A")).toBe(false);
  });
});

describe("latestAdjcloseByTicker", () => {
  it("returns the chronologically last entry of each ticker's price series", () => {
    const prices: MonthlyPrices = {
      A: new Map([
        ["2020-01", 100],
        ["2020-06", 110],
        ["2020-12", 130],
      ]),
      B: new Map([
        ["2019-01", 50],
        ["2024-12", 80],
      ]),
    };
    const out = latestAdjcloseByTicker(prices);
    expect(out.A).toBe(130);
    expect(out.B).toBe(80);
  });

  it("skips empty / invalid series", () => {
    const prices: MonthlyPrices = {
      EMPTY: new Map(),
      ZERO: new Map([["2020-12", 0]]),
      NEG: new Map([["2020-12", -5]]),
      OK: new Map([["2020-12", 100]]),
    };
    const out = latestAdjcloseByTicker(prices);
    expect(out.EMPTY).toBeUndefined();
    expect(out.ZERO).toBeUndefined();
    expect(out.NEG).toBeUndefined();
    expect(out.OK).toBe(100);
  });
});
