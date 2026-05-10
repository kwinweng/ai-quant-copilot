// Phase 6: UniverseProvider abstraction. Today only the static implementation
// exists, but the engine + runner now go through the interface so Phase 6.5
// can plug in a time-varying provider (Wikipedia historical S&P 500
// constituents) without re-touching the engine.
//
// Why an interface this early: keeping the call sites stable means the eventual
// time-varying implementation is a near-zero-risk change at the engine layer.

import { UNIVERSE } from "./universe";
import type { MonthKey } from "./prices";

export interface UniverseProvider {
  readonly name: string;
  /**
   * The set of tickers eligible for selection at the given backtest month.
   * Phase 6 (current): returns the same static list every month.
   * Phase 6.5 (planned): time-varying based on historical index membership.
   */
  tickersAt(month: MonthKey): readonly string[];

  /**
   * The union of all tickers ever in the universe across the backtest window.
   * Used by the runner to know which tickers to fetch prices/fundamentals
   * for upfront. For static providers this is just the full list.
   */
  allTickers(): readonly string[];

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
