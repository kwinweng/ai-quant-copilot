import { describe, it, expect } from "vitest";
import {
  computeAnnualReturns,
  computeDrawdownSeries,
  computeResultMetrics,
} from "./metrics";
import type { BacktestPath } from "./engine";

// Helper builders so each test fixture stays compact + readable.
function path(opts: Partial<BacktestPath>): BacktestPath {
  return {
    axis: opts.axis ?? [],
    equity: opts.equity ?? [],
    returns: opts.returns ?? [],
    rebalances: opts.rebalances ?? [],
    holdingsByMonth: opts.holdingsByMonth ?? {},
  };
}

describe("computeResultMetrics — CAGR", () => {
  it("annualizes simple monthly compounding correctly", () => {
    // 100 → 200 over 12 months = 100% annual return = CAGR 100%.
    const equity = [
      { date: "2020-01", strategy: 100, benchmark: 100 },
      ...Array.from({ length: 11 }, (_, i) => ({
        date: `2020-${String(i + 2).padStart(2, "0")}`,
        // Linear ramp from 100 to 200 (close enough — CAGR uses just endpoints).
        strategy: 100 + (i + 1) * (100 / 12),
        benchmark: 100 + (i + 1) * (100 / 12),
      })),
      { date: "2021-01", strategy: 200, benchmark: 200 },
    ];
    const m = computeResultMetrics(path({ equity, returns: [] }));
    // months = equity.length - 1 = 12, years = 1, CAGR = (200/100)^1 - 1 = 100%.
    expect(m.strategy.cagr).toBeCloseTo(100, 1);
    expect(m.spy.cagr).toBeCloseTo(100, 1);
  });

  it("returns 0 for degenerate / too-short series", () => {
    const m = computeResultMetrics(
      path({ equity: [{ date: "2020-01", strategy: 100, benchmark: 100 }] }),
    );
    expect(m.strategy.cagr).toBe(0);
  });
});

describe("computeResultMetrics — Sharpe / volatility", () => {
  it("zero-volatility series → Sharpe = 0", () => {
    const equity = Array.from({ length: 13 }, (_, i) => ({
      date: `2020-${String(i + 1).padStart(2, "0")}`,
      strategy: 100,
      benchmark: 100,
    }));
    const returns = Array.from({ length: 12 }, (_, i) => ({
      date: `2020-${String(i + 1).padStart(2, "0")}`,
      strategy: 0,
      benchmark: 0,
      active: 0,
    }));
    const m = computeResultMetrics(path({ equity, returns }));
    expect(m.strategy.sharpe).toBe(0);
    expect(m.strategy.annualVol).toBe(0);
  });

  it("Sharpe = mean / std × √12 — verify on synthetic returns", () => {
    // 12 returns alternating +0.02 / -0.01: mean = 0.005, std ≈ 0.01497
    // Sharpe ≈ 0.005 / 0.01497 × √12 ≈ 1.157
    const returns = Array.from({ length: 12 }, (_, i) => ({
      date: `2020-${String(i + 1).padStart(2, "0")}`,
      strategy: i % 2 === 0 ? 0.02 : -0.01,
      benchmark: 0.005,
      active: i % 2 === 0 ? 0.015 : -0.015,
    }));
    // Equity series consistent with returns
    const equity = [{ date: "2019-12", strategy: 100, benchmark: 100 }];
    let s = 100,
      b = 100;
    for (const r of returns) {
      s *= 1 + r.strategy;
      b *= 1 + r.benchmark;
      equity.push({ date: r.date, strategy: s, benchmark: b });
    }
    const m = computeResultMetrics(path({ equity, returns }));
    expect(m.strategy.sharpe).toBeCloseTo(1.16, 1);
  });
});

describe("computeResultMetrics — Max Drawdown", () => {
  it("captures the worst peak-to-trough drop", () => {
    // 100 → 120 → 60 → 80: peak=120, trough=60, MDD = (60-120)/120 = -50%
    const equity = [
      { date: "2020-01", strategy: 100, benchmark: 100 },
      { date: "2020-02", strategy: 120, benchmark: 100 },
      { date: "2020-03", strategy: 60, benchmark: 100 },
      { date: "2020-04", strategy: 80, benchmark: 100 },
    ];
    const m = computeResultMetrics(path({ equity, returns: [] }));
    expect(m.strategy.maxDrawdown).toBe(-50);
  });

  it("monotone increasing series → MDD = 0", () => {
    const equity = Array.from({ length: 13 }, (_, i) => ({
      date: `2020-${String(i + 1).padStart(2, "0")}`,
      strategy: 100 * (1 + i * 0.01),
      benchmark: 100,
    }));
    const m = computeResultMetrics(path({ equity, returns: [] }));
    expect(m.strategy.maxDrawdown).toBe(0);
  });
});

describe("computeResultMetrics — turnover", () => {
  it("annualizes one-way turnover from rebalance events", () => {
    // 12 months, 4 rebalances at 0.5 turnover each: total = 2.0
    // annual = 2.0 / 12 × 12 = 2.0 = 200%
    const equity = Array.from({ length: 13 }, (_, i) => ({
      date: `2020-${String(i + 1).padStart(2, "0")}`,
      strategy: 100,
      benchmark: 100,
    }));
    const rebalances = [
      { date: "2020-01", holdings: ["A"], turnover: 0.5, txCostApplied: 0 },
      { date: "2020-04", holdings: ["A"], turnover: 0.5, txCostApplied: 0 },
      { date: "2020-07", holdings: ["A"], turnover: 0.5, txCostApplied: 0 },
      { date: "2020-10", holdings: ["A"], turnover: 0.5, txCostApplied: 0 },
    ];
    const m = computeResultMetrics(path({ equity, returns: [], rebalances }));
    expect(m.strategy.turnover).toBe(200);
  });

  it("0 rebalances → turnover = 0 (not null)", () => {
    const equity = Array.from({ length: 13 }, (_, i) => ({
      date: `2020-${String(i + 1).padStart(2, "0")}`,
      strategy: 100,
      benchmark: 100,
    }));
    const m = computeResultMetrics(path({ equity, returns: [] }));
    expect(m.strategy.turnover).toBe(0);
  });
});

describe("computeResultMetrics — benchmark self-comparison", () => {
  it("SPY block has alpha=0, beta=1, IR=null, turnover=null, winRate=null", () => {
    const equity = Array.from({ length: 13 }, (_, i) => ({
      date: `2020-${String(i + 1).padStart(2, "0")}`,
      strategy: 100 * (1 + i * 0.01),
      benchmark: 100 * (1 + i * 0.005),
    }));
    const returns = Array.from({ length: 12 }, (_, i) => ({
      date: `2020-${String(i + 1).padStart(2, "0")}`,
      strategy: 0.01,
      benchmark: 0.005,
      active: 0.005,
    }));
    const m = computeResultMetrics(path({ equity, returns }));
    expect(m.spy.alpha).toBe(0);
    expect(m.spy.beta).toBe(1);
    expect(m.spy.informationRatio).toBeNull();
    expect(m.spy.turnover).toBeNull();
    expect(m.spy.winRate).toBeNull();
  });
});

describe("computeDrawdownSeries", () => {
  it("emits 0 at peak, negative values during drawdown", () => {
    const series = computeDrawdownSeries(
      path({
        equity: [
          { date: "2020-01", strategy: 100, benchmark: 100 },
          { date: "2020-02", strategy: 120, benchmark: 100 },
          { date: "2020-03", strategy: 90, benchmark: 95 },
        ],
      }),
    );
    expect(series[0].strategy).toBe(0); // first point is the peak
    expect(series[1].strategy).toBe(0); // new peak
    expect(series[2].strategy).toBe(-25); // (90-120)/120 = -25%
    expect(series[2].spy).toBe(-5); // (95-100)/100 = -5%
  });
});

describe("computeAnnualReturns", () => {
  it("groups by calendar year and uses Y-1 close as Y open", () => {
    const equity = [
      { date: "2020-01", strategy: 100, benchmark: 100 },
      { date: "2020-12", strategy: 110, benchmark: 105 },
      { date: "2021-12", strategy: 121, benchmark: 110.25 },
    ];
    const annual = computeAnnualReturns(path({ equity }));
    expect(annual).toHaveLength(2);
    // 2020: open is first observed (100), close 110 → +10%
    expect(annual[0]).toEqual({ year: "2020", strategy: 10, spy: 5 });
    // 2021: open is 2020's close (110), close 121 → +10%
    expect(annual[1]).toEqual({ year: "2021", strategy: 10, spy: 5 });
  });

  it("returns empty array when equity is empty", () => {
    expect(computeAnnualReturns(path({ equity: [] }))).toEqual([]);
  });
});
