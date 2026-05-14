// Phase 15 — calibration.ts unit tests.

import { describe, expect, it } from "vitest";
import { computeCalibration, isReviewStale } from "./calibration";

describe("computeCalibration", () => {
  it("returns nulls when no actual data is available", () => {
    const r = computeCalibration({
      startMonth: "2026-01",
      actualMonthly: [],
      backtestMonthly: [
        { date: "2025-12", strategy: 0.01, benchmark: 0.005 },
      ],
      adviceLog: [],
    });
    expect(r.monthsObserved).toBe(0);
    expect(r.hitRate).toBeNull();
    expect(r.trackingError).toBeNull();
    expect(r.actualCagr).toBeNull();
    expect(r.executionRate).toBeNull();
  });

  it("filters out actuals from before startMonth", () => {
    const r = computeCalibration({
      startMonth: "2026-02",
      actualMonthly: [
        { date: "2025-12", ret: 0.05 }, // before start, ignored
        { date: "2026-02", ret: 0.01 },
      ],
      backtestMonthly: [
        { date: "2025-12", strategy: 0.05, benchmark: 0.04 },
        { date: "2026-02", strategy: 0.012, benchmark: 0.005 },
      ],
      adviceLog: [],
    });
    expect(r.monthsObserved).toBe(1);
    expect(r.periodStart).toBe("2026-02");
  });

  it("computes hit rate as same-sign rate vs backtest", () => {
    const r = computeCalibration({
      startMonth: "2026-01",
      actualMonthly: [
        { date: "2026-01", ret: 0.01 }, // backtest +0.012 → hit
        { date: "2026-02", ret: -0.02 }, // backtest +0.005 → miss
        { date: "2026-03", ret: -0.01 }, // backtest -0.008 → hit
      ],
      backtestMonthly: [
        { date: "2026-01", strategy: 0.012, benchmark: 0 },
        { date: "2026-02", strategy: 0.005, benchmark: 0 },
        { date: "2026-03", strategy: -0.008, benchmark: 0 },
      ],
      adviceLog: [],
    });
    expect(r.monthsObserved).toBe(3);
    expect(r.hitRate).toBeCloseTo(2 / 3, 4);
  });

  it("computes tracking error as annualized stdev of (actual - expected)", () => {
    // Diffs: 0, 0.01, -0.01 → mean 0, stdev = sqrt(2 × 0.0001 / 2) = 0.01
    // Annualized = 0.01 × sqrt(12) ≈ 0.0346
    const r = computeCalibration({
      startMonth: "2026-01",
      actualMonthly: [
        { date: "2026-01", ret: 0.01 },
        { date: "2026-02", ret: 0.02 },
        { date: "2026-03", ret: 0.00 },
      ],
      backtestMonthly: [
        { date: "2026-01", strategy: 0.01, benchmark: 0 },
        { date: "2026-02", strategy: 0.01, benchmark: 0 },
        { date: "2026-03", strategy: 0.01, benchmark: 0 },
      ],
      adviceLog: [],
    });
    expect(r.trackingError).toBeCloseTo(0.01 * Math.sqrt(12), 3);
  });

  it("computes executionRate over (confirmed + skipped), excluding pending", () => {
    const r = computeCalibration({
      startMonth: "2026-01",
      actualMonthly: [],
      backtestMonthly: [],
      adviceLog: [
        { status: "confirmed" },
        { status: "confirmed" },
        { status: "skipped" },
        { status: "pending" }, // pending not counted
      ],
    });
    expect(r.executionRate).toBeCloseTo(2 / 3, 4);
    expect(r.adviceCounts).toEqual({ pending: 1, confirmed: 2, skipped: 1 });
  });

  it("returns null executionRate when no decisions made", () => {
    const r = computeCalibration({
      startMonth: "2026-01",
      actualMonthly: [],
      backtestMonthly: [],
      adviceLog: [{ status: "pending" }, { status: "pending" }],
    });
    expect(r.executionRate).toBeNull();
  });

  it("computes CAGR over the overlap window", () => {
    // 3 months of +1% each compounds to 1.01^3 = 1.0303 → annualized = ?
    // (1.0303) ^ (12/3) = 1.0303^4 ≈ 1.1263 → CAGR ≈ 12.6%
    const r = computeCalibration({
      startMonth: "2026-01",
      actualMonthly: [
        { date: "2026-01", ret: 0.01 },
        { date: "2026-02", ret: 0.01 },
        { date: "2026-03", ret: 0.01 },
      ],
      backtestMonthly: [
        { date: "2026-01", strategy: 0.005, benchmark: 0 },
        { date: "2026-02", strategy: 0.005, benchmark: 0 },
        { date: "2026-03", strategy: 0.005, benchmark: 0 },
      ],
      adviceLog: [],
    });
    expect(r.actualCagr).toBeCloseTo(Math.pow(1.01, 12) - 1, 3);
    expect(r.expectedCagr).toBeCloseTo(Math.pow(1.005, 12) - 1, 3);
  });

  it("skips months where backtest data is missing", () => {
    const r = computeCalibration({
      startMonth: "2026-01",
      actualMonthly: [
        { date: "2026-01", ret: 0.01 },
        { date: "2026-02", ret: 0.02 }, // backtest missing → skipped
        { date: "2026-03", ret: 0.00 },
      ],
      backtestMonthly: [
        { date: "2026-01", strategy: 0.01, benchmark: 0 },
        { date: "2026-03", strategy: 0.00, benchmark: 0 },
      ],
      adviceLog: [],
    });
    expect(r.monthsObserved).toBe(2);
  });
});

describe("isReviewStale", () => {
  it("returns true for missing timestamp", () => {
    expect(isReviewStale(null)).toBe(true);
    expect(isReviewStale(undefined)).toBe(true);
    expect(isReviewStale("")).toBe(true);
  });

  it("returns false for fresh timestamp", () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(isReviewStale(oneDayAgo)).toBe(false);
  });

  it("returns true for timestamps older than 7 days", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(isReviewStale(eightDaysAgo)).toBe(true);
  });

  it("returns true for invalid timestamp", () => {
    expect(isReviewStale("not-a-date")).toBe(true);
  });
});
