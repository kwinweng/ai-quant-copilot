import { describe, it, expect } from "vitest";
import {
  ATTRIBUTION_BENCHMARKS,
  attributeAgainstBenchmark,
  buildBenchmarkAttribution,
  _internal,
} from "./benchmarkAttribution";
import type { MonthKey } from "./prices";

const { ols } = _internal;

// =====================================================================
// OLS math correctness
// =====================================================================

describe("ols (two-variable)", () => {
  it("perfect 1:1 dependence: beta=1, alpha=0, R²=1", () => {
    const xs = [0.01, 0.02, 0.03, 0.04, 0.05];
    const ys = xs;
    const fit = ols(ys, xs);
    expect(fit.beta).toBeCloseTo(1, 6);
    expect(fit.alpha).toBeCloseTo(0, 6);
    expect(fit.rSquared).toBeCloseTo(1, 6);
    expect(fit.correlation).toBeCloseTo(1, 6);
  });

  it("ys = 2*xs: beta=2, alpha=0", () => {
    const xs = [-0.01, 0.0, 0.02, 0.04];
    const ys = xs.map((x) => 2 * x);
    const fit = ols(ys, xs);
    expect(fit.beta).toBeCloseTo(2, 6);
    expect(fit.alpha).toBeCloseTo(0, 6);
    expect(fit.rSquared).toBeCloseTo(1, 6);
  });

  it("alpha intercept: ys = 0.005 + 0.5*xs", () => {
    const xs = [-0.01, 0, 0.01, 0.02];
    const ys = xs.map((x) => 0.005 + 0.5 * x);
    const fit = ols(ys, xs);
    expect(fit.alpha).toBeCloseTo(0.005, 6);
    expect(fit.beta).toBeCloseTo(0.5, 6);
  });

  it("orthogonal series: beta=0, R²=0", () => {
    // Symmetric ys around their mean, xs of constant slope → no linear
    // relationship → beta should be ~0.
    const xs = [-0.02, -0.01, 0, 0.01, 0.02];
    const ys = [0.01, -0.01, 0.01, -0.01, 0.01]; // alternating, zero correlation with monotone xs
    const fit = ols(ys, xs);
    expect(Math.abs(fit.beta)).toBeLessThan(0.5);
    expect(fit.rSquared).toBeLessThan(0.2);
  });

  it("returns zeros when input has <2 observations", () => {
    expect(ols([], [])).toEqual({
      alpha: 0,
      beta: 0,
      rSquared: 0,
      correlation: 0,
    });
    expect(ols([1], [1])).toEqual({
      alpha: 0,
      beta: 0,
      rSquared: 0,
      correlation: 0,
    });
  });

  it("zero-variance xs (constant benchmark): beta=0, alpha=mean(ys)", () => {
    const xs = [0.01, 0.01, 0.01];
    const ys = [0.02, 0.04, 0.06];
    const fit = ols(ys, xs);
    expect(fit.beta).toBe(0);
    expect(fit.alpha).toBeCloseTo(0.04, 6);
  });
});

// =====================================================================
// attributeAgainstBenchmark — date alignment + missing-month handling
// =====================================================================

describe("attributeAgainstBenchmark", () => {
  it("aligns strategy and benchmark by date, skipping missing months", () => {
    const stratReturns = [
      { date: "2020-02" as MonthKey, strategy: 0.02 },
      { date: "2020-03" as MonthKey, strategy: -0.01 },
      { date: "2020-04" as MonthKey, strategy: 0.03 },
    ];
    // Benchmark prices: months align so returns at 2020-02, -03, -04 match.
    const benchPrices = new Map<MonthKey, number>([
      ["2020-01", 100],
      ["2020-02", 102], // ret = +2%
      ["2020-03", 100], // ret = -1.96%
      ["2020-04", 103], // ret = +3%
    ]);
    const axis = ["2020-01", "2020-02", "2020-03", "2020-04"];
    const fit = attributeAgainstBenchmark(stratReturns, benchPrices, axis);
    expect(fit.monthsObserved).toBe(3);
    // Strategy returns near-perfectly track benchmark → R² close to 1.
    expect(fit.rSquared).toBeGreaterThan(0.9);
  });

  it("returns zeros when benchmark has no overlapping months", () => {
    const stratReturns = [
      { date: "2020-01" as MonthKey, strategy: 0.01 },
      { date: "2020-02" as MonthKey, strategy: 0.01 },
    ];
    const benchPrices = new Map<MonthKey, number>([
      ["2024-01", 100],
      ["2024-02", 102],
    ]);
    const fit = attributeAgainstBenchmark(stratReturns, benchPrices, [
      "2024-01",
      "2024-02",
    ]);
    expect(fit.monthsObserved).toBe(0);
    expect(fit.alphaAnnualPct).toBe(0);
    expect(fit.beta).toBe(0);
  });

  it("annualizes alpha by × 12 × 100", () => {
    // Strategy = bench × 1.0 (beta=1) + 0.005/month alpha. Bench returns
    // VARY across months (otherwise varX=0 collapses OLS into alpha=mean(y),
    // which masks the actual alpha-vs-beta decomposition we want to test).
    const axis = ["2020-01", "2020-02", "2020-03", "2020-04", "2020-05"];
    const benchPrices = new Map<MonthKey, number>([
      ["2020-01", 100],
      ["2020-02", 102], // +2%
      ["2020-03", 100.98], // -1%
      ["2020-04", 104.01], // +3%
      ["2020-05", 103.49], // -0.5%
    ]);
    // Strategy mirrors bench (so beta=1 with R² ≈ 1) + 0.005 alpha/month.
    const benchReturns = [0.02, -0.01, 0.03, -0.005];
    const stratReturns = [
      { date: "2020-02" as MonthKey, strategy: benchReturns[0] + 0.005 },
      { date: "2020-03" as MonthKey, strategy: benchReturns[1] + 0.005 },
      { date: "2020-04" as MonthKey, strategy: benchReturns[2] + 0.005 },
      { date: "2020-05" as MonthKey, strategy: benchReturns[3] + 0.005 },
    ];
    const fit = attributeAgainstBenchmark(stratReturns, benchPrices, axis);
    // Monthly alpha ≈ 0.005 → annualized ≈ 6%
    expect(fit.alphaAnnualPct).toBeCloseTo(6, 0);
    expect(fit.beta).toBeCloseTo(1, 1);
    expect(fit.rSquared).toBeGreaterThan(0.95);
  });
});

// =====================================================================
// buildBenchmarkAttribution — top-level
// =====================================================================

describe("buildBenchmarkAttribution", () => {
  it("emits one row per ATTRIBUTION_BENCHMARKS entry, even when data missing", () => {
    const stratReturns = [
      { date: "2020-02" as MonthKey, strategy: 0.01 },
      { date: "2020-03" as MonthKey, strategy: 0.01 },
    ];
    // Provide only SPY; the others should appear with monthsObserved=0.
    const benchmarks: Record<string, Map<MonthKey, number>> = {
      SPY: new Map<MonthKey, number>([
        ["2020-01", 100],
        ["2020-02", 102],
        ["2020-03", 103],
      ]),
    };
    const report = buildBenchmarkAttribution(
      stratReturns,
      benchmarks,
      ["2020-01", "2020-02", "2020-03"],
    );
    expect(report.benchmarks.length).toBe(ATTRIBUTION_BENCHMARKS.length);
    const spy = report.benchmarks.find((b) => b.ticker === "SPY");
    const qqq = report.benchmarks.find((b) => b.ticker === "QQQ");
    expect(spy?.monthsObserved).toBe(2);
    expect(qqq?.monthsObserved).toBe(0);
  });

  it("generatedAt is parseable ISO", () => {
    const report = buildBenchmarkAttribution([], {}, []);
    expect(Number.isFinite(Date.parse(report.generatedAt))).toBe(true);
  });
});
