import { describe, it, expect } from "vitest";
import {
  TimeVaryingUniverseProvider,
  type UniverseSnapshotRow,
} from "./universeProvider";

// Compact fixture covering the corner cases: month with a direct hit,
// month without one (falls back to prior), pre-history gap, post-history
// extrapolation. Lehman's bankruptcy month is the canonical real-world test
// — present in 2008-08, gone by 2008-09 — so this fixture mirrors what the
// actual seed JSON encodes.
const SNAPSHOTS: UniverseSnapshotRow[] = [
  { monthKey: "1996-01", tickers: ["AAPL", "IBM", "LEHMQ"] },
  { monthKey: "1996-02", tickers: ["AAPL", "IBM", "LEHMQ"] },
  // Big gap — no constituents recorded for several years. (Real data is
  // continuous; the fixture compresses it to exercise the fallback path.)
  { monthKey: "2008-08", tickers: ["AAPL", "IBM", "LEHMQ", "MSFT"] },
  { monthKey: "2008-09", tickers: ["AAPL", "IBM", "MSFT"] }, // LEH out
  { monthKey: "2008-10", tickers: ["AAPL", "IBM", "MSFT"] },
  { monthKey: "2024-01", tickers: ["AAPL", "MSFT", "NVDA"] }, // IBM out
];

function build(): TimeVaryingUniverseProvider {
  return new TimeVaryingUniverseProvider({
    name: "sp500-pit",
    description: "test fixture",
    snapshots: SNAPSHOTS,
  });
}

describe("TimeVaryingUniverseProvider.tickersAt — direct hits", () => {
  it("returns exact-match month tickers", () => {
    const p = build();
    expect(p.tickersAt("2008-08")).toEqual(["AAPL", "IBM", "LEHMQ", "MSFT"]);
    expect(p.tickersAt("2008-09")).toEqual(["AAPL", "IBM", "MSFT"]);
  });

  it("Lehman (LEHMQ) is in the August 2008 snapshot but not September", () => {
    // This is the Phase 6.5 acceptance signal — the canonical historical
    // landmine that proves we're not hiding bankrupts.
    const p = build();
    expect(p.tickersAt("2008-08")).toContain("LEHMQ");
    expect(p.tickersAt("2008-09")).not.toContain("LEHMQ");
  });
});

describe("TimeVaryingUniverseProvider.tickersAt — fallback behavior", () => {
  it("falls back to the closest prior month when requested month has no snapshot", () => {
    const p = build();
    // 2008-07 falls between 1996-02 and 2008-08 in our fixture; should
    // return the 1996-02 snapshot (closest prior).
    expect(p.tickersAt("2008-07")).toEqual(["AAPL", "IBM", "LEHMQ"]);
  });

  it("returns empty for months before any snapshot exists", () => {
    const p = build();
    expect(p.tickersAt("1995-12")).toEqual([]);
    expect(p.tickersAt("1900-01")).toEqual([]);
  });

  it("returns the latest snapshot for months past the seed's last data point", () => {
    const p = build();
    // Real prod case: seed runs through 2026-01, user starts a backtest
    // ending 2026-05. We should reuse the latest snapshot rather than fail.
    expect(p.tickersAt("2026-05")).toEqual(["AAPL", "MSFT", "NVDA"]);
    expect(p.tickersAt("2099-12")).toEqual(["AAPL", "MSFT", "NVDA"]);
  });
});

describe("TimeVaryingUniverseProvider.allTickers", () => {
  it("returns the union of every ticker that was ever in the universe (no window)", () => {
    const p = build();
    expect(p.allTickers()).toEqual(["AAPL", "IBM", "LEHMQ", "MSFT", "NVDA"]);
  });

  it("restricts the union to tickers present within the requested window", () => {
    const p = build();
    // 2008-08 through 2008-10 only: Lehman appears in Aug, drops off after.
    // Result should include LEHMQ (it was tradeable mid-window) but not NVDA
    // (only appears in 2024).
    const within2008 = p.allTickers({
      startMonth: "2008-08",
      endMonth: "2008-10",
    });
    expect(within2008).toContain("LEHMQ");
    expect(within2008).toContain("MSFT");
    expect(within2008).not.toContain("NVDA");
  });

  it("a window with no covered months returns empty", () => {
    const p = build();
    // Between 1996-02 and 2008-08 we deliberately have no snapshots in the
    // fixture; a window like 2000-01 → 2000-12 should yield nothing.
    expect(p.allTickers({ startMonth: "2000-01", endMonth: "2000-12" })).toEqual(
      [],
    );
  });

  it("returns sorted output for stable downstream consumption", () => {
    const p = build();
    const all = p.allTickers();
    const sorted = [...all].sort();
    expect(all).toEqual(sorted);
  });
});

describe("TimeVaryingUniverseProvider.load — DB integration shape", () => {
  it("queries by indexName and orders by monthKey ascending", async () => {
    let captured: Parameters<typeof p.universeSnapshot.findMany>[0] | null =
      null;
    const p = {
      universeSnapshot: {
        findMany: async (args: {
          where: { indexName: string };
          orderBy: { monthKey: "asc" };
          select: { monthKey: true; tickers: true };
        }) => {
          captured = args;
          return [
            { monthKey: "2008-08", tickers: ["LEHMQ"] },
            { monthKey: "2008-09", tickers: ["AAPL"] },
          ];
        },
      },
    };
    const provider = await TimeVaryingUniverseProvider.load(p, "SP500");
    expect(captured).not.toBeNull();
    expect(captured!.where.indexName).toBe("SP500");
    expect(captured!.orderBy.monthKey).toBe("asc");
    expect(provider.tickersAt("2008-08")).toEqual(["LEHMQ"]);
  });

  it("throws a helpful error when no snapshots are seeded", async () => {
    const p = {
      universeSnapshot: {
        findMany: async () => [] as { monthKey: string; tickers: string[] }[],
      },
    };
    await expect(
      TimeVaryingUniverseProvider.load(p, "SP500"),
    ).rejects.toThrow(/seed-sp500-history/);
  });

  it("description() mentions the data source and coverage window", async () => {
    const p = {
      universeSnapshot: {
        findMany: async () => [
          { monthKey: "1996-01", tickers: ["AAPL"] },
          { monthKey: "2026-01", tickers: ["AAPL"] },
        ],
      },
    };
    const provider = await TimeVaryingUniverseProvider.load(p, "SP500");
    expect(provider.description()).toContain("1996-01");
    expect(provider.description()).toContain("2026-01");
    expect(provider.description()).toContain("PIT");
  });
});
