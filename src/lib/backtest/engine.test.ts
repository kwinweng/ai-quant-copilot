import { describe, it, expect } from "vitest";
import { runBacktest } from "./engine";
import type { MonthlyPrices } from "./prices";
import type { FactorScores } from "./factor";
import {
  TimeVaryingUniverseProvider,
  type UniverseProvider,
} from "./universeProvider";

// =====================================================================
// Helpers — build monthly prices, scores, and benchmark Maps from compact
// per-ticker arrays anchored at startDate. Each test below assembles its
// fixture from these so the actual logic under test stays visible.
// =====================================================================

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

function buildAxis(start: Date, months: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < months; i++) {
    out.push(monthKey(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))));
  }
  return out;
}

function priceSeriesFor(
  axis: string[],
  values: number[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < axis.length; i++) {
    if (i < values.length) m.set(axis[i], values[i]);
  }
  return m;
}

function constantScores(
  tickers: string[],
  axis: string[],
  scoreByTicker: Record<string, number>,
): FactorScores {
  // Same score every month → engine picks the same top-N regardless of month.
  const out: FactorScores = {};
  for (const t of tickers) {
    out[t] = new Map();
    for (const m of axis) out[t].set(m, scoreByTicker[t] ?? 0);
  }
  return out;
}

// =====================================================================
// Tests
// =====================================================================

describe("runBacktest — month axis spacing (Sprint #5 H3)", () => {
  it("preserves 1-month spacing on the equity axis", () => {
    const start = new Date(Date.UTC(2020, 0, 1)); // 2020-01
    const end = new Date(Date.UTC(2020, 11, 1)); // 2020-12
    const axis = buildAxis(start, 12);
    const prices: MonthlyPrices = {
      A: priceSeriesFor(
        axis,
        Array.from({ length: 12 }, (_, i) => 100 + i),
      ),
      B: priceSeriesFor(
        axis,
        Array.from({ length: 12 }, (_, i) => 100 - i),
      ),
    };
    const scores = constantScores(["A", "B"], axis, { A: 1, B: 0 });
    const benchmark = priceSeriesFor(
      axis,
      Array.from({ length: 12 }, (_, i) => 100 + i / 2),
    );

    const result = runBacktest({
      prices,
      benchmark,
      scores,
      startDate: start,
      endDate: end,
      rebalanceMonths: 3,
      txCostBps: 5,
      topQuintilePct: 0.5, // top 1 of 2
    });

    // Axis must be strictly 1 calendar month apart.
    for (let i = 1; i < result.axis.length; i++) {
      const [py, pm] = result.axis[i - 1].split("-").map(Number);
      const [cy, cm] = result.axis[i].split("-").map(Number);
      const monthsBetween = (cy - py) * 12 + (cm - pm);
      expect(monthsBetween).toBe(1);
    }
  });
});

describe("runBacktest — missing prices (graceful degradation)", () => {
  it("missing tickers from the universe simply contribute no return", () => {
    const start = new Date(Date.UTC(2020, 0, 1));
    const end = new Date(Date.UTC(2020, 11, 1));
    const axis = buildAxis(start, 12);
    const prices: MonthlyPrices = {
      A: priceSeriesFor(
        axis,
        Array.from({ length: 12 }, (_, i) => 100 + i),
      ),
      // B has NO prices at all (e.g. delisted).
      B: new Map(),
    };
    const scores = constantScores(["A", "B"], axis, { A: 0.5, B: 1.0 });
    const benchmark = priceSeriesFor(
      axis,
      Array.from({ length: 12 }, () => 100),
    );

    const result = runBacktest({
      prices,
      benchmark,
      scores,
      startDate: start,
      endDate: end,
      rebalanceMonths: 1,
      txCostBps: 0,
      topQuintilePct: 1.0, // hold both
    });

    // Engine should not crash; equity series must be defined for every month.
    expect(result.equity.length).toBeGreaterThan(0);
    for (const p of result.equity) {
      expect(Number.isFinite(p.strategy)).toBe(true);
      expect(Number.isFinite(p.benchmark)).toBe(true);
    }
  });
});

describe("runBacktest — rebalance frequency", () => {
  it("monthly rebalance fires more often than quarterly on the same window", () => {
    const start = new Date(Date.UTC(2020, 0, 1));
    const end = new Date(Date.UTC(2020, 11, 1));
    const axis = buildAxis(start, 12);
    // Two tickers with diverging price paths so the ranking flips over time —
    // creates real rebalances rather than identical hold-forever behavior.
    const prices: MonthlyPrices = {
      A: priceSeriesFor(
        axis,
        axis.map((_, i) => 100 + i * 2),
      ),
      B: priceSeriesFor(
        axis,
        axis.map((_, i) => 100 + (11 - i) * 2),
      ),
    };
    const scores: FactorScores = {
      A: new Map(axis.map((m, i) => [m, i / 12])), // increasing score
      B: new Map(axis.map((m, i) => [m, 1 - i / 12])), // decreasing score
    };
    const benchmark = priceSeriesFor(
      axis,
      Array.from({ length: 12 }, () => 100),
    );

    const monthly = runBacktest({
      prices,
      benchmark,
      scores,
      startDate: start,
      endDate: end,
      rebalanceMonths: 1,
      txCostBps: 0,
      topQuintilePct: 0.5,
    });
    const quarterly = runBacktest({
      prices,
      benchmark,
      scores,
      startDate: start,
      endDate: end,
      rebalanceMonths: 3,
      txCostBps: 0,
      topQuintilePct: 0.5,
    });
    expect(monthly.rebalances.length).toBeGreaterThan(quarterly.rebalances.length);
  });
});

describe("runBacktest — Phase 6.5 PIT universe filtering", () => {
  it("with no universeProvider, every scored ticker is eligible every month (legacy path)", () => {
    const start = new Date(Date.UTC(2020, 0, 1));
    const end = new Date(Date.UTC(2020, 11, 1));
    const axis = buildAxis(start, 12);
    const prices: MonthlyPrices = {
      A: priceSeriesFor(axis, axis.map((_, i) => 100 + i)),
      B: priceSeriesFor(axis, axis.map((_, i) => 100 - i)),
    };
    // A always wins the rank.
    const scores = constantScores(["A", "B"], axis, { A: 1, B: 0 });
    const benchmark = priceSeriesFor(axis, axis.map(() => 100));

    const result = runBacktest({
      prices,
      benchmark,
      scores,
      startDate: start,
      endDate: end,
      rebalanceMonths: 1,
      txCostBps: 0,
      topQuintilePct: 0.5, // top 1 of 2
    });

    // Without a provider, A should be picked every rebalance.
    for (const r of result.rebalances) {
      expect(r.holdings).toEqual(["A"]);
    }
  });

  it("PIT provider excludes ineligible tickers from rebalance picks even when they top the score", () => {
    // Scenario: A has the best score every month but is only "in the index"
    // for the first two months. After that, only B is eligible. The engine
    // must pick A at first, then switch to B once A drops out — proving the
    // PIT filter overrides raw factor ranking.
    const start = new Date(Date.UTC(2020, 0, 1));
    const end = new Date(Date.UTC(2020, 11, 1));
    const axis = buildAxis(start, 12);
    const prices: MonthlyPrices = {
      A: priceSeriesFor(axis, axis.map((_, i) => 100 + i)),
      B: priceSeriesFor(axis, axis.map((_, i) => 100 + i)),
    };
    const scores = constantScores(["A", "B"], axis, { A: 1, B: 0 });
    const benchmark = priceSeriesFor(axis, axis.map(() => 100));

    const provider: UniverseProvider = new TimeVaryingUniverseProvider({
      name: "test-pit",
      description: "fixture",
      snapshots: axis.map((m, i) => ({
        monthKey: m,
        tickers: i <= 1 ? ["A", "B"] : ["B"],
      })),
    });

    const result = runBacktest({
      prices,
      benchmark,
      scores,
      startDate: start,
      endDate: end,
      rebalanceMonths: 1,
      txCostBps: 0,
      topQuintilePct: 0.5, // top 1 of pool
      universeProvider: provider,
    });

    // First rebalance(s): A is eligible & wins.
    // Once A drops from the index, picks must switch to B.
    const aEverPicked = result.rebalances.some((r) => r.holdings.includes("A"));
    const bEverPicked = result.rebalances.some((r) => r.holdings.includes("B"));
    expect(aEverPicked).toBe(true);
    expect(bEverPicked).toBe(true);

    // After the second rebalance month, A must never appear (no longer in index).
    const lateRebalances = result.rebalances.filter((r) => r.date > axis[1]);
    for (const r of lateRebalances) {
      expect(r.holdings).not.toContain("A");
    }
  });

  it("topN scales with per-month eligible pool size, not with the historical union", () => {
    // 5 tickers in score, but only 2 are in the index any given month. topN at
    // 40% should be 1 (40% × 2 = 0.8 → max(1, round) = 1), not 2 (40% × 5).
    const start = new Date(Date.UTC(2020, 0, 1));
    const end = new Date(Date.UTC(2020, 11, 1));
    const axis = buildAxis(start, 12);
    const all = ["A", "B", "C", "D", "E"];
    const prices: MonthlyPrices = {};
    for (const t of all) {
      prices[t] = priceSeriesFor(axis, axis.map(() => 100));
    }
    const scores: FactorScores = {};
    for (let i = 0; i < all.length; i++) {
      scores[all[i]] = new Map(axis.map((m) => [m, i])); // E > D > C > B > A
    }
    const benchmark = priceSeriesFor(axis, axis.map(() => 100));

    const provider = new TimeVaryingUniverseProvider({
      name: "test-pit-small",
      description: "fixture",
      // Only D and E are eligible at every month.
      snapshots: axis.map((m) => ({ monthKey: m, tickers: ["D", "E"] })),
    });

    const result = runBacktest({
      prices,
      benchmark,
      scores,
      startDate: start,
      endDate: end,
      rebalanceMonths: 1,
      txCostBps: 0,
      topQuintilePct: 0.4,
      universeProvider: provider,
    });

    // Per-month pool = 2 tickers. topN = max(1, round(0.4 × 2)) = 1.
    for (const r of result.rebalances) {
      expect(r.holdings).toHaveLength(1);
      // The single pick must be E (highest score among the eligible pair).
      expect(r.holdings[0]).toBe("E");
    }
  });
});

describe("runBacktest — turnover + transaction cost drag", () => {
  it("higher tx cost reduces final equity (compared at same rebalance freq)", () => {
    const start = new Date(Date.UTC(2020, 0, 1));
    const end = new Date(Date.UTC(2020, 11, 1));
    const axis = buildAxis(start, 12);
    const prices: MonthlyPrices = {
      A: priceSeriesFor(
        axis,
        axis.map((_, i) => 100 + i * 2),
      ),
      B: priceSeriesFor(
        axis,
        axis.map((_, i) => 100 + (11 - i) * 2),
      ),
    };
    // Force constant rebalancing by flipping scores every month.
    const scores: FactorScores = {
      A: new Map(axis.map((m, i) => [m, i % 2])),
      B: new Map(axis.map((m, i) => [m, 1 - (i % 2)])),
    };
    const benchmark = priceSeriesFor(
      axis,
      Array.from({ length: 12 }, () => 100),
    );

    const cheap = runBacktest({
      prices,
      benchmark,
      scores,
      startDate: start,
      endDate: end,
      rebalanceMonths: 1,
      txCostBps: 0,
      topQuintilePct: 0.5,
    });
    const expensive = runBacktest({
      prices,
      benchmark,
      scores,
      startDate: start,
      endDate: end,
      rebalanceMonths: 1,
      txCostBps: 100, // 1% per side
      topQuintilePct: 0.5,
    });

    const cheapFinal = cheap.equity[cheap.equity.length - 1].strategy;
    const expensiveFinal = expensive.equity[expensive.equity.length - 1].strategy;
    expect(expensiveFinal).toBeLessThan(cheapFinal);
  });

  it("each rebalance event records the txCostApplied = turnover × txCostBps/10000", () => {
    const start = new Date(Date.UTC(2020, 0, 1));
    const end = new Date(Date.UTC(2020, 11, 1));
    const axis = buildAxis(start, 12);
    const prices: MonthlyPrices = {
      A: priceSeriesFor(
        axis,
        axis.map(() => 100),
      ),
      B: priceSeriesFor(
        axis,
        axis.map(() => 100),
      ),
    };
    const scores: FactorScores = {
      A: new Map(axis.map((m, i) => [m, i % 2])),
      B: new Map(axis.map((m, i) => [m, 1 - (i % 2)])),
    };
    const benchmark = priceSeriesFor(
      axis,
      Array.from({ length: 12 }, () => 100),
    );

    const result = runBacktest({
      prices,
      benchmark,
      scores,
      startDate: start,
      endDate: end,
      rebalanceMonths: 1,
      txCostBps: 50, // 0.50% per side
      topQuintilePct: 0.5,
    });

    for (const r of result.rebalances) {
      // turnover ∈ [0, 1], drag = turnover × 0.005
      expect(r.txCostApplied).toBeCloseTo(r.turnover * 0.005, 6);
    }
  });
});
