import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { FundamentalSnapshot, FundamentalSource } from "./types";
import { YahooFundamentalsProvider } from "./yahoo";
import { SecEdgarProvider } from "./sec";
import { mergeFundamentals } from "./merge";

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
 */
export async function getMergedSnapshot(
  ticker: string,
): Promise<FundamentalSnapshot | undefined> {
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
