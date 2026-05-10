// Phase 4+ improvement: ticker → CIK lookup with hardcoded primary +
// SEC remote fallback.
//
// Why this layout:
//   • The 30-ticker hardcoded map in universe.ts is the authoritative source
//     for our backtest universe — verified, padded, fast, and offline-safe.
//   • Anything outside that map (e.g. a future expansion or ad-hoc tools)
//     transparently falls back to fetching SEC's public ticker→CIK list,
//     which we cache in module-level memory for the process lifetime.
//   • The SEC list lives at https://www.sec.gov/files/company_tickers.json
//     — small (~600KB), no auth, refreshed by SEC several times per year.

import { TICKER_TO_CIK } from "@/lib/backtest/universe";

interface SecTickerEntry {
  cik_str: number; // unpadded
  ticker: string;
  title: string;
}

interface SecTickerListPayload {
  // SEC ships this as an object keyed by index ("0", "1", ...) → entry.
  [index: string]: SecTickerEntry;
}

const SEC_TICKER_LIST_URL =
  "https://www.sec.gov/files/company_tickers.json";

// Module-level memo: { ticker → padded CIK }. Populated lazily on first
// remote fallback; persists for process lifetime. We don't bother with
// per-process cache invalidation because SEC's list changes rarely and a
// PM2 reload nukes it for us.
let remoteMap: Record<string, string> | null = null;
let remoteFetchPromise: Promise<Record<string, string>> | null = null;
let remoteFetchAttemptedAt = 0;
let remoteFetchSucceeded = false;

const FETCH_RETRY_BACKOFF_MS = 60 * 60 * 1000; // 1 hour

function padCik(raw: number | string): string {
  return String(raw).padStart(10, "0");
}

async function fetchRemoteMap(): Promise<Record<string, string>> {
  const ua =
    process.env.SEC_USER_AGENT?.trim() ||
    "AI Quant Copilot (research; contact: kwinweng@gmail.com)";
  const res = await fetch(SEC_TICKER_LIST_URL, {
    headers: {
      "User-Agent": ua,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`SEC ticker list HTTP ${res.status}`);
  }
  const payload = (await res.json()) as SecTickerListPayload;
  const out: Record<string, string> = {};
  for (const k of Object.keys(payload)) {
    const entry = payload[k];
    if (!entry?.ticker || entry.cik_str == null) continue;
    // Yahoo / our universe sometimes uses dashed share-class tickers ("BRK-B")
    // while SEC uses dotted ("BRK.B") or just the parent ("BRK"). Normalize
    // both directions when seeding the map.
    const t = entry.ticker.toUpperCase();
    const cik = padCik(entry.cik_str);
    out[t] = cik;
    if (t.includes(".")) out[t.replace(/\./g, "-")] = cik;
    if (t.includes("-")) out[t.replace(/-/g, ".")] = cik;
  }
  return out;
}

async function ensureRemoteMap(): Promise<Record<string, string> | null> {
  if (remoteMap) return remoteMap;
  if (remoteFetchPromise) return remoteFetchPromise;
  // Don't spam SEC if we recently failed.
  if (
    !remoteFetchSucceeded &&
    remoteFetchAttemptedAt > 0 &&
    Date.now() - remoteFetchAttemptedAt < FETCH_RETRY_BACKOFF_MS
  ) {
    return null;
  }
  remoteFetchPromise = (async () => {
    remoteFetchAttemptedAt = Date.now();
    try {
      const m = await fetchRemoteMap();
      remoteMap = m;
      remoteFetchSucceeded = true;
      return m;
    } catch (err) {
      console.warn(
        "[fundamentals/cikMap] remote SEC ticker list fetch failed:",
        err instanceof Error ? err.message : err,
      );
      throw err;
    } finally {
      remoteFetchPromise = null;
    }
  })();
  try {
    return await remoteFetchPromise;
  } catch {
    return null;
  }
}

/**
 * Resolve a ticker to its 10-digit padded CIK, preferring the hardcoded map
 * and falling back to the SEC remote list. Returns undefined when neither
 * source has a match.
 */
export async function resolveCik(ticker: string): Promise<string | undefined> {
  const t = ticker.toUpperCase();
  const hardcoded = TICKER_TO_CIK[t];
  if (hardcoded) return hardcoded;
  const remote = await ensureRemoteMap();
  return remote?.[t];
}

/**
 * Synchronous variant for hot paths that already know the ticker is in the
 * hardcoded map. Returns undefined if not found — callers should fall through
 * to resolveCik() for the async fallback.
 */
export function resolveCikSync(ticker: string): string | undefined {
  return TICKER_TO_CIK[ticker.toUpperCase()];
}
