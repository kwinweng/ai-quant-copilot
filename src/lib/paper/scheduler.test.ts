import { describe, it, expect } from "vitest";
import { isRebalanceMonth } from "./scheduler";

describe("isRebalanceMonth", () => {
  it("monthly always returns true", () => {
    expect(isRebalanceMonth("monthly", "2024-01", "2024-05")).toBe(true);
    expect(isRebalanceMonth("monthly", "2024-01", "2024-01")).toBe(true);
  });

  it("quarterly: anchor is a rebalance month", () => {
    expect(isRebalanceMonth("quarterly", "2024-01", "2024-01")).toBe(true);
  });

  it("quarterly: hits at +3, +6, +9 from anchor", () => {
    expect(isRebalanceMonth("quarterly", "2024-01", "2024-04")).toBe(true);
    expect(isRebalanceMonth("quarterly", "2024-01", "2024-07")).toBe(true);
    expect(isRebalanceMonth("quarterly", "2024-01", "2025-01")).toBe(true);
  });

  it("quarterly: skips off-cadence months", () => {
    expect(isRebalanceMonth("quarterly", "2024-01", "2024-02")).toBe(false);
    expect(isRebalanceMonth("quarterly", "2024-01", "2024-03")).toBe(false);
    expect(isRebalanceMonth("quarterly", "2024-01", "2024-05")).toBe(false);
  });

  it("returns false for months before the anchor", () => {
    expect(isRebalanceMonth("quarterly", "2024-04", "2024-01")).toBe(false);
  });

  it("unknown label defaults to monthly cadence (cadence=1)", () => {
    expect(isRebalanceMonth("totally-bogus", "2024-01", "2024-05")).toBe(true);
  });

  // Regression: ISSUE-001 — cron ignored study rebalance cadence
  // Found by /qa on 2026-05-12
  // Report: .gstack/qa-reports/qa-report-aiquant-2026-05-12.md
  //
  // The production-active study uses 中文 label "季度" (quarterly), which
  // REBALANCE_MONTHS maps to cadence=3. Previously isRebalanceMonth was
  // exported but never called by the cron route — so quarterly portfolios
  // got an "advice" written every month instead of every 3 months. The
  // fix wires isRebalanceMonth into processPortfolio(). This test guards
  // the helper's handling of the Chinese cadence label end-to-end.
  it("handles Chinese cadence labels (季度 → 3-month cadence)", () => {
    expect(isRebalanceMonth("季度", "2026-02", "2026-02")).toBe(true);
    expect(isRebalanceMonth("季度", "2026-02", "2026-05")).toBe(true);
    expect(isRebalanceMonth("季度", "2026-02", "2026-08")).toBe(true);
    expect(isRebalanceMonth("季度", "2026-02", "2026-03")).toBe(false);
    expect(isRebalanceMonth("季度", "2026-02", "2026-04")).toBe(false);
    expect(isRebalanceMonth("季度", "2026-02", "2026-06")).toBe(false);
  });

  it("handles Chinese monthly label (月度 → every month)", () => {
    expect(isRebalanceMonth("月度", "2026-02", "2026-02")).toBe(true);
    expect(isRebalanceMonth("月度", "2026-02", "2026-03")).toBe(true);
    expect(isRebalanceMonth("月度", "2026-02", "2027-01")).toBe(true);
  });
});
