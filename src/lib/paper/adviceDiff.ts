// Phase 12: pure diff helper for paper-trading rebalance advice.
//
// Given a portfolio's current ticker set and the strategy's freshly-computed
// recommendation, produce the symmetric difference. Order is alphabetical so
// UI + Telegram messages render deterministically.

export interface AdviceDiff {
  current: string[];
  suggested: string[];
  added: string[]; // in suggested, not in current → buy
  removed: string[]; // in current, not in suggested → sell
  unchanged: string[]; // in both
}

export function diffTickerSets(
  current: readonly string[],
  suggested: readonly string[],
): AdviceDiff {
  const c = new Set(current);
  const s = new Set(suggested);
  const added: string[] = [];
  const removed: string[] = [];
  const unchanged: string[] = [];
  for (const t of s) {
    if (!c.has(t)) added.push(t);
    else unchanged.push(t);
  }
  for (const t of c) if (!s.has(t)) removed.push(t);
  added.sort();
  removed.sort();
  unchanged.sort();
  return {
    current: [...c].sort(),
    suggested: [...s].sort(),
    added,
    removed,
    unchanged,
  };
}

// True when current ≡ suggested as sets (regardless of order). Use this to
// decide whether the scheduler should even bother writing an advice row.
export function tickerSetsEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const t of b) if (!sa.has(t)) return false;
  return true;
}
