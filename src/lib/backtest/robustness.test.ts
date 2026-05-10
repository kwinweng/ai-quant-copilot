import { describe, it, expect } from "vitest";
import {
  bootstrapMetricCI,
  buildRobustnessReport,
  halfSplit,
  splitInSampleOutOfSample,
} from "./robustness";
import type { BacktestPath } from "./engine";

function buildPath(returns: number[], startDate = "2020-01"): BacktestPath {
  // Build a synthetic BacktestPath with the given monthly strategy returns.
  // Equity series isn't required by robustness — only path.returns is read —
  // but we populate it so future helpers don't choke on undefined.
  const months: { date: string; strategy: number; benchmark: number }[] = [];
  let s = 100;
  let b = 100;
  const [year, mo] = startDate.split("-").map(Number);
  months.push({
    date: `${year}-${String(mo).padStart(2, "0")}`,
    strategy: s,
    benchmark: b,
  });
  const returnPoints: {
    date: string;
    strategy: number;
    benchmark: number;
    active: number;
  }[] = [];
  for (let i = 0; i < returns.length; i++) {
    const m = new Date(Date.UTC(year, mo - 1 + i + 1, 1));
    const key = `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`;
    s *= 1 + returns[i];
    b *= 1.005; // benchmark steady 0.5%/mo
    months.push({ date: key, strategy: s, benchmark: b });
    returnPoints.push({
      date: key,
      strategy: returns[i],
      benchmark: 0.005,
      active: returns[i] - 0.005,
    });
  }
  return {
    axis: months.map((m) => m.date),
    equity: months,
    returns: returnPoints,
    rebalances: [],
    holdingsByMonth: {},
  };
}

describe("splitInSampleOutOfSample", () => {
  it("70/30 split preserves total months count", () => {
    const dates = Array.from({ length: 100 }, (_, i) => `2020-${i + 1}`);
    const returns = Array.from({ length: 100 }, () => 0.01);
    const { inSample, outOfSample } = splitInSampleOutOfSample(
      dates,
      returns,
      0.7,
    );
    expect(inSample.monthsCount + outOfSample.monthsCount).toBe(100);
    expect(inSample.monthsCount).toBe(70);
    expect(outOfSample.monthsCount).toBe(30);
  });

  it("computes annualized CAGR correctly for the in-sample half", () => {
    // 12 months of +1% monthly compounding → ~12.68% CAGR
    const dates = Array.from({ length: 12 }, (_, i) => `2020-${i + 1}`);
    const returns = Array.from({ length: 12 }, () => 0.01);
    const { inSample } = splitInSampleOutOfSample(dates, returns, 1.0);
    expect(inSample.cagr).toBeCloseTo(12.68, 1);
  });

  it("returns empty placeholders for tiny / empty inputs", () => {
    const { inSample, outOfSample } = splitInSampleOutOfSample([], [], 0.7);
    expect(inSample.monthsCount).toBe(0);
    expect(outOfSample.monthsCount).toBe(0);
  });
});

describe("halfSplit", () => {
  it("splits returns into two halves of equal-ish length", () => {
    const dates = Array.from({ length: 24 }, (_, i) => `2020-${i + 1}`);
    const returns = Array.from({ length: 24 }, () => 0.005);
    const halves = halfSplit(dates, returns);
    expect(halves).toHaveLength(2);
    expect(halves[0].monthsCount).toBe(12);
    expect(halves[1].monthsCount).toBe(12);
  });

  it("returns empty array when fewer than 2 returns", () => {
    expect(halfSplit([], [])).toEqual([]);
    expect(halfSplit(["2020-01"], [0.01])).toEqual([]);
  });
});

describe("bootstrapMetricCI — IID resampling", () => {
  it("is deterministic with a fixed seed (reproducibility)", () => {
    const returns = Array.from({ length: 50 }, (_, i) =>
      Math.sin(i * 0.3) * 0.02,
    );
    const a = bootstrapMetricCI(returns, (rs) => rs.reduce((s, r) => s + r, 0), 100, 42);
    const b = bootstrapMetricCI(returns, (rs) => rs.reduce((s, r) => s + r, 0), 100, 42);
    expect(a).toEqual(b);
  });

  it("CI bounds bracket the median for any non-degenerate input", () => {
    const returns = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 0.02 : -0.01));
    const ci = bootstrapMetricCI(returns, (rs) => rs.reduce((s, r) => s + r, 0) / rs.length, 200, 7);
    expect(ci.ci95Lower).toBeLessThanOrEqual(ci.median);
    expect(ci.median).toBeLessThanOrEqual(ci.ci95Upper);
  });

  it("returns zeros for tiny / empty input", () => {
    const empty = bootstrapMetricCI([], () => 1, 1000, 1);
    expect(empty.iterations).toBe(0);
    expect(empty.ci95Upper).toBe(0);
  });

  it("iterations field reflects actual count run", () => {
    const returns = Array.from({ length: 20 }, () => 0.01);
    const ci = bootstrapMetricCI(returns, (rs) => rs[0], 50, 1);
    expect(ci.iterations).toBe(50);
  });
});

describe("buildRobustnessReport — end-to-end shape", () => {
  it("populates all sections from a path", () => {
    const returns = Array.from({ length: 60 }, (_, i) =>
      i % 3 === 0 ? 0.03 : i % 3 === 1 ? -0.01 : 0.01,
    );
    const path = buildPath(returns);
    const report = buildRobustnessReport(path, { bootstrapIterations: 200 });
    expect(report.whole.monthsCount).toBe(60);
    expect(report.inSample.monthsCount).toBe(42);
    expect(report.outOfSample.monthsCount).toBe(18);
    expect(report.subperiods).toHaveLength(2);
    expect(report.bootstrap.sharpe.iterations).toBe(200);
    expect(report.bootstrap.cagr.iterations).toBe(200);
    expect(report.bootstrap.maxDrawdown.iterations).toBe(200);
    // generatedAt should be a parseable ISO string
    expect(Number.isFinite(Date.parse(report.generatedAt))).toBe(true);
  });

  it("monotone-positive returns: zero Max DD, finite Sharpe, positive CAGR", () => {
    // 36 months alternating +2% / +1% — both positive so no drawdowns ever,
    // but variance is non-zero so Sharpe is well-defined and finite.
    const returns = Array.from({ length: 36 }, (_, i) =>
      i % 2 === 0 ? 0.02 : 0.01,
    );
    const path = buildPath(returns);
    const report = buildRobustnessReport(path, { bootstrapIterations: 200 });
    // Average 1.5%/month compounded over 3 years ≈ (1.015)^36 / 1 - 1 → annualized ≈ 19.6%
    expect(report.whole.cagr).toBeGreaterThan(15);
    expect(report.whole.cagr).toBeLessThan(25);
    // Strictly increasing equity → no drawdown
    expect(report.whole.maxDrawdown).toBe(0);
    // Positive mean + small std → high Sharpe (but finite + reasonable)
    expect(report.whole.sharpe).toBeGreaterThan(0);
    expect(Number.isFinite(report.whole.sharpe)).toBe(true);
    expect(report.whole.sharpe).toBeLessThan(50); // sanity ceiling
  });

  it("regime-shift returns: in-sample and out-of-sample diverge", () => {
    // First 70% positive, last 30% negative → out-of-sample CAGR < in-sample CAGR
    const returns = [
      ...Array(70).fill(0.02),
      ...Array(30).fill(-0.02),
    ];
    const path = buildPath(returns);
    const report = buildRobustnessReport(path, { bootstrapIterations: 50 });
    expect(report.outOfSample.cagr).toBeLessThan(report.inSample.cagr);
    expect(report.outOfSample.cagr).toBeLessThan(0); // crashing in OOS half
    expect(report.inSample.cagr).toBeGreaterThan(0);
  });
});
