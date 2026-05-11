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
});
