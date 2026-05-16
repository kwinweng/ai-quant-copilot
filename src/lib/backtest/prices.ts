import YahooFinance from "yahoo-finance2";

// Single shared client with notice suppression — the "ripHistorical" notice
// prints once per process, the survey notice fires randomly, neither is
// actionable in our server context.
const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

export type MonthKey = string; // "YYYY-MM"

export interface MonthlyPrices {
  // Map preserves insertion order, which is chronological after we sort.
  [ticker: string]: Map<MonthKey, number>;
}

export function monthKeyOf(date: Date): MonthKey {
  const y = date.getUTCFullYear();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}
// Back-compat alias for internal callers; kept private but functionally identical.
const monthKey = monthKeyOf;

// Pad start by 13 months so the first factor month (12-1 momentum needs 12
// trailing prices + skip 1) lands exactly at the user's requested startDate.
function paddedStart(startDate: Date, lookbackMonths: number): Date {
  const d = new Date(startDate);
  d.setUTCMonth(d.getUTCMonth() - lookbackMonths);
  return d;
}

export interface FetchPricesOptions {
  tickers: readonly string[];
  startDate: Date;
  endDate: Date;
  /** Months of pre-roll history to pull so factor warm-up doesn't truncate
   * the user's requested window. Defaults to 13. */
  lookbackMonths?: number;
  /** Concurrency cap — Yahoo will rate-limit aggressive parallelism. */
  concurrency?: number;
  /** Optional progress callback fired after each ticker resolves. */
  onTickerDone?: (info: {
    ticker: string;
    completed: number;
    total: number;
    pointCount: number;
  }) => void;
}

async function fetchOne(
  ticker: string,
  period1: Date,
  period2: Date,
): Promise<Map<MonthKey, number>> {
  const result = await yahooFinance.chart(ticker, {
    period1,
    period2,
    interval: "1mo",
  });
  const map = new Map<MonthKey, number>();
  // Sprint #6 M3: drop any bar whose date is strictly after period2 (the
  // exclusive upper bound). Yahoo's monthly endpoint usually returns one
  // mid-month "in-progress" bar for the current calendar month when our
  // window includes it, plus the prior month's end-of-month bar. The
  // in-progress one would land in the same MonthKey as the EOM and
  // overwrite it ("last write wins") — fine as a current-snapshot price
  // but wrong for backtest purposes where we sample at month-end. The
  // explicit cutoff prevents that overwrite.
  const cutoffMs = period2.getTime();
  for (const q of result.quotes) {
    if (q.date == null) continue;
    const ts = new Date(q.date).getTime();
    if (ts > cutoffMs) continue;
    const price = q.adjclose ?? q.close;
    if (price == null || !Number.isFinite(price)) continue;
    const key = monthKey(new Date(q.date));
    // For multiple bars within the same month (already filtered above),
    // last write wins by design — usually identical EOM values anyway.
    map.set(key, price);
  }
  return map;
}

export async function fetchMonthlyPrices(
  opts: FetchPricesOptions,
): Promise<MonthlyPrices> {
  const concurrency = opts.concurrency ?? 8;
  const lookback = opts.lookbackMonths ?? 13;
  const period1 = paddedStart(opts.startDate, lookback);
  // Yahoo treats period2 as exclusive; bump by one day to include endDate's
  // last bar.
  const period2 = new Date(opts.endDate);
  period2.setUTCDate(period2.getUTCDate() + 1);

  const tickers = [...opts.tickers];
  const out: MonthlyPrices = {};
  let inFlight = 0;
  let nextIdx = 0;
  let completed = 0;
  const total = tickers.length;

  await new Promise<void>((resolve, reject) => {
    const tryDispatch = () => {
      while (inFlight < concurrency && nextIdx < total) {
        const ticker = tickers[nextIdx++];
        inFlight++;
        fetchOne(ticker, period1, period2)
          .then((map) => {
            out[ticker] = map;
            completed++;
            opts.onTickerDone?.({
              ticker,
              completed,
              total,
              pointCount: map.size,
            });
          })
          .catch((err) => {
            // A single delisted/malformed ticker shouldn't kill the whole
            // backtest. Log and treat as no-data — the engine handles missing
            // months gracefully.
            console.warn(
              `[backtest] Yahoo Finance fetch failed for ${ticker}:`,
              err instanceof Error ? err.message : err,
            );
            out[ticker] = new Map();
            completed++;
            opts.onTickerDone?.({
              ticker,
              completed,
              total,
              pointCount: 0,
            });
          })
          .finally(() => {
            inFlight--;
            if (completed === total) resolve();
            else tryDispatch();
          });
      }
      if (total === 0) resolve();
    };
    try {
      tryDispatch();
    } catch (err) {
      reject(err);
    }
  });

  return out;
}

// Build the canonical sorted month axis between startDate and endDate
// (inclusive on both ends). The engine indexes everything by this list.
export function buildMonthAxis(startDate: Date, endDate: Date): MonthKey[] {
  const out: MonthKey[] = [];
  const cursor = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1),
  );
  const last = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1),
  );
  while (cursor <= last) {
    out.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

export function priorMonth(key: MonthKey, lag: number): MonthKey {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - lag, 1));
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}
