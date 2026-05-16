// Phase 6: UniverseProvider abstraction. Today the static implementation is
// the default; Phase 6.5 adds TimeVaryingUniverseProvider backed by the
// UniverseSnapshot table (PIT-correct index constituents). Engine + runner
// integration lands in W2 — W1 just wires the data layer.
//
// Why an interface this early: keeping call sites stable means the eventual
// time-varying implementation is a near-zero-risk change at the engine layer.

import { UNIVERSE } from "./universe";
import type { MonthKey } from "./prices";

export interface UniverseProvider {
  readonly name: string;
  /**
   * The set of tickers eligible for selection at the given backtest month.
   * Phase 6 (static): returns the same list every month.
   * Phase 6.5 (time-varying): returns the PIT index constituents at month.
   */
  tickersAt(month: MonthKey): readonly string[];

  /**
   * The union of all tickers ever in the universe across the requested
   * window. Static providers ignore the window. The runner uses this to
   * decide which tickers to pre-fetch prices / fundamentals for. Omitting
   * the window unions across the provider's entire loaded range — convenient
   * for unit tests but wasteful for the runner.
   */
  allTickers(window?: {
    startMonth: MonthKey;
    endMonth: MonthKey;
  }): readonly string[];

  /**
   * Honest disclosure about this provider's bias profile. Surfaced in the
   * Result page DataQualityCard so users see what they're trading off.
   */
  description(): string;
}

class StaticUniverseProvider implements UniverseProvider {
  readonly name = "static-60";

  private readonly tickers: readonly string[];

  constructor(tickers: readonly string[]) {
    this.tickers = tickers;
  }

  tickersAt(_month: MonthKey): readonly string[] {
    return this.tickers;
  }

  allTickers(): readonly string[] {
    return this.tickers;
  }

  description(): string {
    return `静态 ${this.tickers.length} 只大市值美股，覆盖 8 个 GICS 板块，所有标的在整个回测窗口期保持不变。仍存在幸存者偏差（每只标的今天仍在交易），Phase 6.5 计划升级为时变指数成分股以消除`;
  }
}

// Default provider used by the runner. Switch this out to plug in
// Phase 6.5 / 7+ alternatives without touching downstream code.
export const defaultUniverseProvider: UniverseProvider =
  new StaticUniverseProvider(UNIVERSE);

// ============================================================
// Phase 6.5 — Time-varying universe (PIT index constituents)
// ============================================================

export interface UniverseSnapshotRow {
  monthKey: MonthKey;
  tickers: readonly string[];
}

/**
 * Time-varying provider backed by the UniverseSnapshot table. Constructed
 * with a fully-loaded list of monthly snapshots so the engine can call
 * `tickersAt` synchronously inside the rebalance loop. Use `load()` to
 * build one from the DB; pass snapshots directly in tests.
 */
export class TimeVaryingUniverseProvider implements UniverseProvider {
  readonly name: string;
  private readonly description_: string;
  private readonly byMonth: Map<MonthKey, readonly string[]>;
  private readonly sortedMonths: MonthKey[];

  constructor(opts: {
    name: string;
    description: string;
    snapshots: readonly UniverseSnapshotRow[];
  }) {
    this.name = opts.name;
    this.description_ = opts.description;
    this.byMonth = new Map();
    for (const s of opts.snapshots) {
      this.byMonth.set(s.monthKey, s.tickers);
    }
    this.sortedMonths = [...this.byMonth.keys()].sort();
  }

  /**
   * If the requested month has a snapshot, return it. Otherwise return the
   * closest prior month's snapshot — this gives a sensible fallback for the
   * "user starts a backtest a few months past the seed's latest month"
   * case, while still returning empty for months before any data exists.
   */
  tickersAt(month: MonthKey): readonly string[] {
    const direct = this.byMonth.get(month);
    if (direct) return direct;
    // Binary search for the largest month ≤ requested.
    let lo = 0;
    let hi = this.sortedMonths.length - 1;
    let bestIdx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (this.sortedMonths[mid] <= month) {
        bestIdx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (bestIdx < 0) return [];
    return this.byMonth.get(this.sortedMonths[bestIdx]) ?? [];
  }

  allTickers(window?: {
    startMonth: MonthKey;
    endMonth: MonthKey;
  }): readonly string[] {
    const start = window?.startMonth;
    const end = window?.endMonth;
    const seen = new Set<string>();
    for (const month of this.sortedMonths) {
      if (start && month < start) continue;
      if (end && month > end) continue;
      const tickers = this.byMonth.get(month);
      if (tickers) for (const t of tickers) seen.add(t);
    }
    return [...seen].sort();
  }

  description(): string {
    return this.description_;
  }

  /**
   * Build a provider from the DB. Pulls every snapshot for `indexName` in
   * one query — typical row count is 360 (1996-2026 monthly), payload <2 MB.
   */
  static async load(
    prisma: {
      universeSnapshot: {
        findMany: (args: {
          where: { indexName: string };
          orderBy: { monthKey: "asc" };
          select: { monthKey: true; tickers: true };
        }) => Promise<{ monthKey: string; tickers: string[] }[]>;
      };
    },
    indexName: string,
  ): Promise<TimeVaryingUniverseProvider> {
    const rows = await prisma.universeSnapshot.findMany({
      where: { indexName },
      orderBy: { monthKey: "asc" },
      select: { monthKey: true, tickers: true },
    });
    if (rows.length === 0) {
      throw new Error(
        `[universeProvider] No snapshots found for indexName="${indexName}". ` +
          `Run \`npx tsx scripts/seed-sp500-history.ts\` to hydrate the table.`,
      );
    }
    const name = indexName === "SP500" ? "sp500-pit" : indexName.toLowerCase();
    const display = indexName === "SP500" ? "S&P 500" : indexName;
    // Honest framing — see ROADMAP Phase 6.5 价值叙事重新校准 + memory
    // project_yahoo_delisted_gap.md. Universe is PIT-correct; price coverage
    // for actual bankrupts (LEHMQ / WAMUQ / BSC / MER / CFC / ENE) is empty
    // from Yahoo, so the runner reports those as missing ticker-months in
    // dataQuality rather than claiming "no survivorship bias".
    const description =
      `${display} 指数成分股（PIT-correct universe）：每个再平衡月份使用当时真实的指数成分，` +
      `选股池历史精确。⚠️ 价格层数据来自 Yahoo Finance，对真破产标的（如 Lehman / WaMu / Bear Stearns）` +
      `无历史价格，会在结果页 dataQuality 里明确披露为缺失 ticker-month。这是免费数据源的天花板。` +
      `数据源：fja05680/sp500 历史档案，覆盖 ${rows[0].monthKey} → ${rows[rows.length - 1].monthKey}。`;
    return new TimeVaryingUniverseProvider({
      name,
      description,
      snapshots: rows.map((r) => ({ monthKey: r.monthKey, tickers: r.tickers })),
    });
  }
}
