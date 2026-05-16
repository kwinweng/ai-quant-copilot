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

// Phase 6.5 W2.2: per-ticker fetch outcome so the runner can write a precise
// dataQuality.missingTickers list with reasons, rather than treating every
// empty Map as the same kind of failure.
//
// status:
//   "ok"        — got ≥ 1 monthly bar
//   "no_data"   — upstream said this ticker has no data in the window
//                 (e.g. delisted before window starts, or Yahoo never
//                 indexed it). Deterministic — not retried.
//   "transient" — network / rate-limit / unknown error after retries
//                 exhausted. The ticker may or may not have data; we just
//                 couldn't reach Yahoo. Surfacing this separately from
//                 "no_data" lets the user re-run the study to recover.
export interface TickerFetchOutcome {
  status: "ok" | "no_data" | "transient";
  pointCount: number;
  reason?: string;
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
  /** Phase 6.5 W2.2: optional sink for per-ticker outcome metadata. Pass a
   * Map and the fetcher will populate it as each ticker resolves. The runner
   * uses this to build dataQuality.priceCoverage.missingTickerDetails. */
  outcomes?: Map<string, TickerFetchOutcome>;
}

// Pattern-match Yahoo errors into "no_data" (deterministic, don't retry) vs
// "transient" (retryable). The yahoo-finance2 lib doesn't expose distinct
// error classes, so we string-match the message — fragile but contained.
// Exported for unit tests; the runtime callers all go through fetchWithRetry.
export function classifyError(err: unknown): {
  status: "no_data" | "transient";
  reason: string;
} {
  const msg = err instanceof Error ? err.message : String(err);
  // Empty-result errors from yahoo-finance2 — the ticker simply has no bars
  // in the requested window. This is the common case for true bankrupts
  // (LEHMQ / WAMUQ / BSC) where Yahoo never kept history after delisting.
  if (msg.includes("Data doesn't exist")) {
    return { status: "no_data", reason: "Yahoo 无该窗口的历史数据" };
  }
  // Schema validation — yahoo-finance2 got a response it can't parse. In
  // practice this almost always means a stripped-down "delisted" payload
  // for ex-tickers (e.g. ENRNQ post-bankruptcy). Treat as deterministic
  // no-data to avoid futile retries.
  if (msg.includes("Failed Yahoo Schema validation")) {
    return { status: "no_data", reason: "Yahoo schema 校验失败（通常为退市标的）" };
  }
  // Anything else — network blip, rate limit, 5xx — could succeed on retry.
  return { status: "transient", reason: msg };
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

  // Phase 6.5 W2.2: small helper that attempts one retry for transient errors
  // (network / rate-limit) but skips retry for deterministic "no_data" cases.
  // Static back-off keeps the code simple — Yahoo's rate-limit window is
  // ~1 sec so this is enough to clear most transients without blowing up
  // the wall-clock budget.
  const fetchWithRetry = async (
    ticker: string,
  ): Promise<{ map: Map<MonthKey, number>; outcome: TickerFetchOutcome }> => {
    try {
      const map = await fetchOne(ticker, period1, period2);
      return {
        map,
        outcome:
          map.size > 0
            ? { status: "ok", pointCount: map.size }
            : {
                status: "no_data",
                pointCount: 0,
                reason: "Yahoo 返回空 quotes 数组",
              },
      };
    } catch (err1) {
      const c1 = classifyError(err1);
      if (c1.status === "no_data") {
        return {
          map: new Map(),
          outcome: { status: "no_data", pointCount: 0, reason: c1.reason },
        };
      }
      // Transient — wait 1s and retry once.
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const map = await fetchOne(ticker, period1, period2);
        return {
          map,
          outcome:
            map.size > 0
              ? { status: "ok", pointCount: map.size }
              : {
                  status: "no_data",
                  pointCount: 0,
                  reason: "Yahoo 返回空 quotes 数组（重试后）",
                },
        };
      } catch (err2) {
        const c2 = classifyError(err2);
        return {
          map: new Map(),
          outcome: { status: c2.status, pointCount: 0, reason: c2.reason },
        };
      }
    }
  };

  await new Promise<void>((resolve, reject) => {
    const tryDispatch = () => {
      while (inFlight < concurrency && nextIdx < total) {
        const ticker = tickers[nextIdx++];
        inFlight++;
        fetchWithRetry(ticker)
          .then(({ map, outcome }) => {
            out[ticker] = map;
            opts.outcomes?.set(ticker, outcome);
            completed++;
            if (outcome.status !== "ok") {
              console.warn(
                `[backtest] ${ticker} → ${outcome.status}: ${outcome.reason ?? "no reason given"}`,
              );
            }
            opts.onTickerDone?.({
              ticker,
              completed,
              total,
              pointCount: outcome.pointCount,
            });
          })
          .catch((err) => {
            // fetchWithRetry never throws, but guard anyway.
            console.error(
              `[backtest] fetchWithRetry unexpectedly threw for ${ticker}:`,
              err,
            );
            out[ticker] = new Map();
            opts.outcomes?.set(ticker, {
              status: "transient",
              pointCount: 0,
              reason: err instanceof Error ? err.message : String(err),
            });
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
