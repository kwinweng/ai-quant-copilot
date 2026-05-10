import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { FundamentalSnapshot, FundamentalSource } from "./types";
import { YahooFundamentalsProvider } from "./yahoo";
import { SecEdgarProvider } from "./sec";
import { mergeFundamentals } from "./merge";
import { withInflightDedup } from "@/lib/util/inflight";

// Phase 4 cache TTL: re-fetch a snapshot if our latest cached row is older
// than this. Fundamentals change quarterly, so a day is plenty fresh.
const CACHE_TTL_HOURS = 24;

const yahoo = new YahooFundamentalsProvider();
const sec = new SecEdgarProvider();

function isFresh(asOf: Date): boolean {
  const ageMs = Date.now() - asOf.getTime();
  return ageMs < CACHE_TTL_HOURS * 60 * 60 * 1000;
}

type CachedRow = {
  ticker: string;
  source: string;
  fiscalDate: Date;
  reportedAt: Date | null;
  pe: number | null;
  pb: number | null;
  ps: number | null;
  evEbitda: number | null;
  roe: number | null;
  roic: number | null;
  grossMargin: number | null;
  debtToEquity: number | null;
  revenueGrowth: number | null;
  epsGrowth: number | null;
  marketCap: number | null;
  netIncomeTTM: number | null;
  revenuesTTM: number | null;
  stockholdersEquity: number | null;
  raw: Prisma.JsonValue;
};

function rowToSnapshot(row: CachedRow): FundamentalSnapshot {
  return {
    ticker: row.ticker,
    source: row.source as FundamentalSource,
    fiscalDate: row.fiscalDate,
    reportedAt: row.reportedAt ?? undefined,
    pe: row.pe ?? undefined,
    pb: row.pb ?? undefined,
    ps: row.ps ?? undefined,
    evEbitda: row.evEbitda ?? undefined,
    roe: row.roe ?? undefined,
    roic: row.roic ?? undefined,
    grossMargin: row.grossMargin ?? undefined,
    debtToEquity: row.debtToEquity ?? undefined,
    revenueGrowth: row.revenueGrowth ?? undefined,
    epsGrowth: row.epsGrowth ?? undefined,
    marketCap: row.marketCap ?? undefined,
    netIncomeTTM: row.netIncomeTTM ?? undefined,
    revenuesTTM: row.revenuesTTM ?? undefined,
    stockholdersEquity: row.stockholdersEquity ?? undefined,
    raw: row.raw,
  };
}

async function writeCached(snap: FundamentalSnapshot): Promise<void> {
  const data = {
    asOf: new Date(),
    reportedAt: snap.reportedAt ?? null,
    pe: snap.pe ?? null,
    pb: snap.pb ?? null,
    ps: snap.ps ?? null,
    evEbitda: snap.evEbitda ?? null,
    roe: snap.roe ?? null,
    roic: snap.roic ?? null,
    grossMargin: snap.grossMargin ?? null,
    debtToEquity: snap.debtToEquity ?? null,
    revenueGrowth: snap.revenueGrowth ?? null,
    epsGrowth: snap.epsGrowth ?? null,
    marketCap: snap.marketCap ?? null,
    netIncomeTTM: snap.netIncomeTTM ?? null,
    revenuesTTM: snap.revenuesTTM ?? null,
    stockholdersEquity: snap.stockholdersEquity ?? null,
    raw:
      snap.raw == null
        ? Prisma.DbNull
        : (snap.raw as unknown as Prisma.InputJsonValue),
  };
  await prisma.fundamentalSnapshot.upsert({
    where: {
      ticker_source_fiscalDate: {
        ticker: snap.ticker,
        source: snap.source,
        fiscalDate: snap.fiscalDate,
      },
    },
    create: {
      ticker: snap.ticker,
      source: snap.source,
      fiscalDate: snap.fiscalDate,
      ...data,
    },
    update: data,
  });
}

/**
 * Get a merged Yahoo+SEC snapshot for a ticker, using cache when fresh.
 * Never throws — returns undefined if both providers come back empty.
 *
 * Phase 4 follow-up C5: parallel calls for the same ticker share a single
 * in-flight Promise to avoid two simultaneous Yahoo+SEC fetches.
 */
export async function getMergedSnapshot(
  ticker: string,
): Promise<FundamentalSnapshot | undefined> {
  return withInflightDedup(inflightMergedSnapshot, ticker, async () => {
    const [yahooRow, secRow] = await Promise.all([
      prisma.fundamentalSnapshot.findFirst({
        where: { ticker, source: "yahoo" },
        orderBy: { asOf: "desc" },
      }),
      prisma.fundamentalSnapshot.findFirst({
        where: { ticker, source: "sec" },
        orderBy: { asOf: "desc" },
      }),
    ]);

    const needYahoo = !yahooRow || !isFresh(yahooRow.asOf);
    const needSec = !secRow || !isFresh(secRow.asOf);

    const [yahooSnap, secSnap] = await Promise.all([
      needYahoo
        ? yahoo.fetch(ticker).then(async (s) => {
            if (s) {
              try {
                await writeCached(s);
              } catch (err) {
                console.warn(
                  `[fundamentals/cache] persist yahoo ${ticker} failed:`,
                  err instanceof Error ? err.message : err,
                );
              }
              return s;
            }
            return yahooRow ? rowToSnapshot(yahooRow) : undefined;
          })
        : Promise.resolve(rowToSnapshot(yahooRow!)),
      needSec
        ? sec.fetch(ticker).then(async (s) => {
            if (s) {
              try {
                await writeCached(s);
              } catch (err) {
                console.warn(
                  `[fundamentals/cache] persist sec ${ticker} failed:`,
                  err instanceof Error ? err.message : err,
                );
              }
              return s;
            }
            return secRow ? rowToSnapshot(secRow) : undefined;
          })
        : Promise.resolve(rowToSnapshot(secRow!)),
    ]);

    return mergeFundamentals(yahooSnap, secSnap);
  });
}

// =====================================================================
// Phase 4+ PIT support: SEC historical snapshots
// =====================================================================
// One row per (ticker, fiscalDate) for SEC. Refresh policy:
//   • If we have *any* SEC row for the ticker fresher than CACHE_TTL_HOURS,
//     reuse the lot — the SEC list rarely changes outside of new filings,
//     and a daily refresh window catches new 10-Ks promptly enough.
//   • Otherwise fetch full history via SecEdgarProvider.fetchAll() and upsert
//     every row.
//
// SEC's full historical list for a single ticker is small (<500 rows), so a
// rebuild is cheap.

async function refreshSecHistory(ticker: string): Promise<FundamentalSnapshot[]> {
  const fresh = await sec.fetchAll(ticker);
  if (fresh.length === 0) return fresh;
  // Persist all rows. We don't bulk insert because Prisma's createMany skips
  // upsert semantics; iterate is fine for ~30 rows per ticker.
  for (const snap of fresh) {
    try {
      await writeCached(snap);
    } catch (err) {
      console.warn(
        `[fundamentals/cache] persist sec history ${ticker} @${snap.fiscalDate.toISOString()} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return fresh;
}

// Phase 4 follow-up C5: in-flight dedup for SEC + Yahoo refreshes.
//
// Without this, two concurrent users (or one user + SWR background poll)
// who both find the same ticker stale will each fire their own SEC fetch.
// SEC throttles aggressive callers and a small cluster of users could
// trip a 429 / IP block. We coalesce parallel refresh calls into a single
// in-flight Promise that everyone awaits.
//
// Sprint #7: extracted the dedup pattern itself to src/lib/util/inflight.ts
// so it can be unit-tested in isolation without spinning up Prisma. The
// per-key Maps still live here because they belong to this module's
// caching policy, not a generic utility.
const inflightSecHistory = new Map<string, Promise<FundamentalSnapshot[]>>();
const inflightMergedSnapshot = new Map<
  string,
  Promise<FundamentalSnapshot | undefined>
>();

function dedupedSecHistory(ticker: string): Promise<FundamentalSnapshot[]> {
  return withInflightDedup(inflightSecHistory, ticker, () =>
    refreshSecHistory(ticker),
  );
}

/**
 * Get the full SEC filing history for a single ticker, refreshing the cache
 * when the latest stored row is older than CACHE_TTL_HOURS. Sorted oldest-
 * first.
 */
export async function getSecHistory(
  ticker: string,
): Promise<FundamentalSnapshot[]> {
  const rows = await prisma.fundamentalSnapshot.findMany({
    where: { ticker, source: "sec" },
    orderBy: { fiscalDate: "asc" },
  });
  const newest = rows[rows.length - 1];
  if (newest && isFresh(newest.asOf)) {
    return rows.map(rowToSnapshot);
  }
  // Stale or empty → refresh (deduped per ticker).
  const fresh = await dedupedSecHistory(ticker);
  if (fresh.length > 0) return fresh;
  // If refresh failed (network) but we have stale rows, return them — better
  // than nothing. The data quality panel will surface staleness via asOf.
  return rows.map(rowToSnapshot);
}

/**
 * Batch helper for the runner — returns ticker → SEC history.
 *
 * Sprint #6 M1: default concurrency lowered from 4 → 2 for the SEC path.
 * companyfacts JSON is 1-5 MB per ticker (AAPL ~3 MB) and we don't release
 * the parsed object until the fetchAll() function returns. Concurrency 4
 * meant ~12-20 MB simultaneous JSON in memory; concurrency 2 halves that
 * peak with negligible wall-clock impact (SEC's own 10 req/s soft limit
 * dominates, not our parallelism).
 */
export async function getSecHistoryForUniverse(
  tickers: readonly string[],
  concurrency = 2,
  onTickerDone?: (info: {
    ticker: string;
    completed: number;
    total: number;
    snapshotCount: number;
  }) => void,
): Promise<Record<string, FundamentalSnapshot[]>> {
  const out: Record<string, FundamentalSnapshot[]> = {};
  const queue = [...tickers];
  let completed = 0;
  const total = tickers.length;
  async function worker() {
    while (queue.length > 0) {
      const t = queue.shift();
      if (!t) return;
      let history: FundamentalSnapshot[] = [];
      try {
        history = await getSecHistory(t);
        if (history.length > 0) out[t] = history;
      } catch (err) {
        console.warn(
          `[fundamentals/cache] getSecHistory ${t} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
      completed++;
      onTickerDone?.({
        ticker: t,
        completed,
        total,
        snapshotCount: history.length,
      });
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => worker()),
  );
  return out;
}

/**
 * Batch fetch with bounded concurrency. Returns ticker → snapshot map; tickers
 * with no data simply omit from the map (downstream factor code treats this
 * as "missing", which is what the Phase 4 coverage report measures).
 */
export async function getMergedSnapshotsForUniverse(
  tickers: readonly string[],
  concurrency = 4,
  onTickerDone?: (info: {
    ticker: string;
    completed: number;
    total: number;
    hasData: boolean;
  }) => void,
): Promise<Record<string, FundamentalSnapshot>> {
  const out: Record<string, FundamentalSnapshot> = {};
  const queue = [...tickers];
  let completed = 0;
  const total = tickers.length;
  async function worker() {
    while (queue.length > 0) {
      const t = queue.shift();
      if (!t) return;
      let snap: FundamentalSnapshot | undefined;
      try {
        snap = await getMergedSnapshot(t);
        if (snap) out[t] = snap;
      } catch (err) {
        console.warn(
          `[fundamentals/cache] getMergedSnapshot ${t} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
      completed++;
      onTickerDone?.({ ticker: t, completed, total, hasData: !!snap });
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => worker()),
  );
  return out;
}
