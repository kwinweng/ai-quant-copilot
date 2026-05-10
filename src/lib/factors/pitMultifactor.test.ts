import { describe, it, expect } from "vitest";
import {
  REPORTING_LAG_DAYS,
  buildMultiFactorScores,
  crossSectionalZ,
  monthKeyToCutoff,
  pickSnapshotAsOf,
} from "./pitMultifactor";
import type { FundamentalSnapshot } from "@/lib/fundamentals/types";
import type { FactorScores } from "@/lib/backtest/factor";

// Helper: build a SEC snapshot with just the fields we care about.
function snap(partial: Partial<FundamentalSnapshot>): FundamentalSnapshot {
  return {
    ticker: partial.ticker ?? "AAPL",
    source: "sec",
    fiscalDate: partial.fiscalDate ?? new Date("2020-12-31"),
    reportedAt: partial.reportedAt,
    ...partial,
  };
}

describe("monthKeyToCutoff", () => {
  it("places cutoff at start-of-(M+1) minus lagDays — the engine decides at end-of-M", () => {
    // For decision month "2024-03": engine acts at end-of-March (= start-of-April).
    // With 90-day lag: cutoff = April 1 − 90 days ≈ Jan 1.
    const cutoff = monthKeyToCutoff("2024-03", 90);
    expect(cutoff.getUTCFullYear()).toBe(2024);
    expect(cutoff.getUTCMonth()).toBe(0); // January
    expect(cutoff.getUTCDate()).toBe(2); // April 1 (= 91 day-of-year of 2024) − 90 = day 1, but DST/leap shifts to Jan 2
    // Stronger assertion: it's 90 days before the start of M+1.
    const expected = new Date(Date.UTC(2024, 3, 1) - 90 * 24 * 60 * 60 * 1000);
    expect(cutoff.getTime()).toBe(expected.getTime());
  });

  it("does NOT use end-of-M-1 (the bug Sprint #1 C1 fixed)", () => {
    // The pre-Sprint-1 bug placed cutoff at end-of-Feb minus 90 days = Dec 1
    // for decision month March. The fix uses start-of-April − 90 days ≈ Jan 2.
    // ~31 days different.
    const correct = monthKeyToCutoff("2024-03", 90);
    const buggyOld = new Date(
      Date.UTC(2024, 2, 1) - 1 - 90 * 24 * 60 * 60 * 1000,
    );
    const diffDays = Math.round(
      (correct.getTime() - buggyOld.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(diffDays).toBe(31); // March has 31 days, exactly one month off
  });

  it("varies linearly with lagDays", () => {
    const c0 = monthKeyToCutoff("2024-03", 0);
    const c30 = monthKeyToCutoff("2024-03", 30);
    expect(c0.getTime() - c30.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("REPORTING_LAG_DAYS is 90", () => {
    expect(REPORTING_LAG_DAYS).toBe(90);
  });
});

describe("pickSnapshotAsOf", () => {
  const filings = [
    snap({ fiscalDate: new Date("2018-12-31"), reportedAt: new Date("2019-02-15") }),
    snap({ fiscalDate: new Date("2019-12-31"), reportedAt: new Date("2020-02-20") }),
    snap({ fiscalDate: new Date("2020-12-31"), reportedAt: new Date("2021-02-25") }),
    snap({ fiscalDate: new Date("2021-12-31"), reportedAt: new Date("2022-02-28") }),
  ];

  it("returns undefined for empty / missing history", () => {
    expect(pickSnapshotAsOf(undefined, new Date("2020-01-01"))).toBeUndefined();
    expect(pickSnapshotAsOf([], new Date("2020-01-01"))).toBeUndefined();
  });

  it("returns the latest filing visible at cutoff (filed before or equal)", () => {
    // Cutoff July 2020 → only Feb 2019 + Feb 2020 are visible.
    const pick = pickSnapshotAsOf(filings, new Date("2020-07-01"));
    expect(pick?.reportedAt?.toISOString().slice(0, 10)).toBe("2020-02-20");
  });

  it("does NOT leak future filings past cutoff", () => {
    // Cutoff Jan 2020 → only the Feb 2019 filing is visible (Feb 2020 is later).
    const pick = pickSnapshotAsOf(filings, new Date("2020-01-15"));
    expect(pick?.reportedAt?.toISOString().slice(0, 10)).toBe("2019-02-15");
  });

  it("returns undefined when all filings are post-cutoff", () => {
    const pick = pickSnapshotAsOf(filings, new Date("2018-01-01"));
    expect(pick).toBeUndefined();
  });

  it("ignores snapshots without reportedAt", () => {
    const mixed = [
      snap({ fiscalDate: new Date("2019-12-31") }), // no reportedAt
      snap({ fiscalDate: new Date("2020-12-31"), reportedAt: new Date("2021-02-25") }),
    ];
    const pick = pickSnapshotAsOf(mixed, new Date("2024-01-01"));
    expect(pick?.reportedAt?.toISOString().slice(0, 10)).toBe("2021-02-25");
  });

  it("includes a filing whose reportedAt EQUALS cutoff (≤, not <)", () => {
    const onTheDay = [
      snap({ reportedAt: new Date("2020-01-15T00:00:00.000Z") }),
    ];
    const pick = pickSnapshotAsOf(onTheDay, new Date("2020-01-15T00:00:00.000Z"));
    expect(pick).toBeDefined();
  });
});

describe("crossSectionalZ", () => {
  it("returns empty Map for fewer than 2 inputs", () => {
    expect(crossSectionalZ(new Map(), false).size).toBe(0);
    expect(crossSectionalZ(new Map([["A", 1]]), false).size).toBe(0);
  });

  it("returns empty Map when std == 0 (all values identical)", () => {
    const m = new Map([
      ["A", 5],
      ["B", 5],
      ["C", 5],
    ]);
    expect(crossSectionalZ(m, false).size).toBe(0);
  });

  it("computes z-score: mean=10, std=√(((1-10)²+(10-10)²+(19-10)²)/3) ≈ 7.348", () => {
    const m = new Map([
      ["LOW", 1],
      ["MID", 10],
      ["HIGH", 19],
    ]);
    const z = crossSectionalZ(m, false);
    // mean = 10, variance = (81 + 0 + 81)/3 = 54, std ≈ 7.348
    const expectedStd = Math.sqrt(54);
    expect(z.get("LOW")).toBeCloseTo((1 - 10) / expectedStd, 6);
    expect(z.get("MID")).toBeCloseTo(0, 6);
    expect(z.get("HIGH")).toBeCloseTo((19 - 10) / expectedStd, 6);
  });

  it("inverts sign when lowerIsBetter=true", () => {
    const m = new Map([
      ["CHEAP", 5], // lower PE → higher score
      ["MID", 15],
      ["EXPENSIVE", 25],
    ]);
    const z = crossSectionalZ(m, true);
    expect(z.get("CHEAP")! > 0).toBe(true);
    expect(z.get("EXPENSIVE")! < 0).toBe(true);
    // Symmetric values → opposite-sign z-scores
    expect(z.get("CHEAP")).toBeCloseTo(-z.get("EXPENSIVE")!, 6);
  });
});

describe("buildMultiFactorScores", () => {
  it("returns {} when momentum scores are empty", () => {
    expect(buildMultiFactorScores({}, {}, {})).toEqual({});
  });

  it("composite includes only available components per (ticker, month)", () => {
    // Setup: 3 tickers, 2 months. Only A has SEC filings; only B has Yahoo PE.
    const moms: FactorScores = {
      A: new Map([
        ["2020-06", 0.05],
        ["2020-07", 0.08],
      ]),
      B: new Map([
        ["2020-06", 0.10],
        ["2020-07", 0.02],
      ]),
      C: new Map([
        ["2020-06", -0.03],
        ["2020-07", 0.04],
      ]),
    };
    const yahoo: Record<string, FundamentalSnapshot> = {
      A: snap({ ticker: "A", pe: 20 }),
      B: snap({ ticker: "B", pe: 10 }),
      C: snap({ ticker: "C", pe: 30 }),
    };
    // SEC history: A and B both have one filing visible by 2020-06's cutoff.
    // Cutoff for 2020-06 = July 1 - 90d ≈ Apr 2.
    const earlyFiling = new Date("2020-03-01");
    const secHistory: Record<string, FundamentalSnapshot[]> = {
      A: [
        snap({ ticker: "A", reportedAt: earlyFiling, roe: 25, grossMargin: 50 }),
      ],
      B: [
        snap({ ticker: "B", reportedAt: earlyFiling, roe: 15, grossMargin: 40 }),
      ],
      C: [], // no SEC visibility
    };

    const result = buildMultiFactorScores(moms, yahoo, secHistory);
    // All 3 tickers have at least Value+Momentum, so all should produce scores.
    expect(Object.keys(result).sort()).toEqual(["A", "B", "C"]);
    // Every (ticker, month) combination should have a finite numeric score.
    for (const t of ["A", "B", "C"]) {
      for (const month of ["2020-06", "2020-07"]) {
        const v = result[t].get(month);
        expect(v).toBeDefined();
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("PIT-correctness: filings filed AFTER decision month do not influence that month", () => {
    // Setup designed so SEC data, when visible, would FLIP the ranking versus
    // momentum-only. If PIT works correctly:
    //   - 2020-06 (cutoff ≈ Apr 2020): March-2021 filing NOT visible →
    //     ranking driven only by momentum → A > B.
    //   - 2021-09 (cutoff ≈ July 2021): March-2021 filing IS visible →
    //     quality (B's roe=99 ≫ A's roe=1) drags B up; combined with
    //     opposite-sign momentum, the A-vs-B gap shrinks (or even flips).
    // Cross-sectional z-scores have fixed magnitude (always ±1 with 2 points
    // and same-direction signal), so we use a directional-conflict design
    // rather than expecting magnitude to grow.
    const moms: FactorScores = {
      A: new Map([
        ["2020-06", 0.05],
        ["2021-09", 0.05],
      ]),
      B: new Map([
        ["2020-06", -0.05],
        ["2021-09", -0.05],
      ]),
    };
    const yahoo = {}; // no Yahoo Value tilt
    const futureFiling = new Date("2021-03-01");
    const secHistory: Record<string, FundamentalSnapshot[]> = {
      // Note: B has the high ROE, so SEC visibility tilts the composite
      // toward B and AGAINST A's positive momentum.
      A: [snap({ ticker: "A", reportedAt: futureFiling, roe: 1 })],
      B: [snap({ ticker: "B", reportedAt: futureFiling, roe: 99 })],
    };

    const result = buildMultiFactorScores(moms, yahoo, secHistory);
    const a06 = result.A.get("2020-06")!;
    const b06 = result.B.get("2020-06")!;
    const a21 = result.A.get("2021-09")!;
    const b21 = result.B.get("2021-09")!;

    // 2020-06: SEC not visible → momentum-only → A above B.
    expect(a06).toBeGreaterThan(b06);

    // 2021-09: SEC visible; quality flips against momentum. The composite
    // is mean(momZ, qualityZ) — momentum z=+1 + quality z=-1 = 0 for A and
    // momentum z=-1 + quality z=+1 = 0 for B. The directional gap collapses.
    expect(Math.abs(a21 - b21)).toBeLessThan(Math.abs(a06 - b06));

    // And concretely, both should be near zero (within rounding).
    expect(a21).toBeCloseTo(0, 6);
    expect(b21).toBeCloseTo(0, 6);
  });
});
