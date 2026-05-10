import YahooFinance from "yahoo-finance2";
import type {
  FundamentalSnapshot,
  FundamentalsProvider,
} from "./types";

// Structural shape over the slice of yahoo-finance2's QuoteSummaryResult that
// we actually consume — avoids depending on the SDK's internal type paths
// (which aren't all in its `exports` map).
interface YfRaw {
  raw?: number;
}
type YfNumeric = number | YfRaw | Date | undefined;
interface YfQuoteSummary {
  defaultKeyStatistics?: {
    trailingPE?: YfNumeric;
    priceToBook?: YfNumeric;
    enterpriseToEbitda?: YfNumeric;
    enterpriseValue?: YfNumeric;
    ebitda?: YfNumeric;
    lastFiscalYearEnd?: YfNumeric;
  };
  summaryDetail?: {
    trailingPE?: YfNumeric;
    priceToSalesTrailing12Months?: YfNumeric;
  };
  financialData?: {
    returnOnEquity?: YfNumeric;
    grossMargins?: YfNumeric;
    debtToEquity?: YfNumeric;
    revenueGrowth?: YfNumeric;
    earningsGrowth?: YfNumeric;
    ebitda?: YfNumeric;
    totalDebt?: YfNumeric;
    totalCash?: YfNumeric;
  };
}

// Single shared client — same notice suppression as prices.ts.
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Yahoo's quoteSummary modules we need:
//   defaultKeyStatistics → trailingPE, priceToBook, enterpriseToEbitda
//   summaryDetail        → priceToSalesTrailing12Months
//   financialData        → returnOnEquity, grossMargins, debtToEquity,
//                          revenueGrowth, earningsGrowth
//   incomeStatementHistory → ROIC fallback (calc-able), but yahoo-finance2 ships
//                            this so we keep the option open
const YAHOO_MODULES = [
  "defaultKeyStatistics",
  "summaryDetail",
  "financialData",
] as const;

function pct(x: unknown): number | undefined {
  if (typeof x !== "number" || !Number.isFinite(x)) return undefined;
  // Yahoo returns ratios as decimals (e.g. 0.342 = 34.2%). Promote to %.
  return Math.round(x * 1000) / 10;
}

function num(x: unknown): number | undefined {
  if (typeof x !== "number" || !Number.isFinite(x)) return undefined;
  return Math.round(x * 100) / 100;
}

// yahoo-finance2 returns Yahoo's "raw" objects which sometimes wrap values as
// { raw: number, fmt: string }. The SDK's typings normalize most of this, but
// we still defensively unwrap.
function unwrap(x: unknown): number | undefined {
  if (typeof x === "number") return x;
  if (
    typeof x === "object" &&
    x !== null &&
    "raw" in x &&
    typeof (x as { raw: unknown }).raw === "number"
  ) {
    return (x as { raw: number }).raw;
  }
  return undefined;
}

export class YahooFundamentalsProvider implements FundamentalsProvider {
  readonly name = "yahoo" as const;

  async fetch(ticker: string): Promise<FundamentalSnapshot | undefined> {
    let summary: YfQuoteSummary | undefined;
    try {
      summary = (await yf.quoteSummary(ticker, {
        modules: [...YAHOO_MODULES],
      })) as YfQuoteSummary;
    } catch (err) {
      console.warn(
        `[fundamentals/yahoo] quoteSummary failed for ${ticker}:`,
        err instanceof Error ? err.message : err,
      );
      return undefined;
    }

    if (!summary) return undefined;

    const dks = summary.defaultKeyStatistics;
    const sd = summary.summaryDetail;
    const fd = summary.financialData;

    if (!dks && !sd && !fd) {
      // Empty payload — treat as no data rather than partial garbage.
      return undefined;
    }

    // Most recent quarter end; Yahoo doesn't expose this directly on the modules
    // we use, so fall back to "now" — the cache TTL gates staleness anyway.
    const fiscalDate = dks?.lastFiscalYearEnd
      ? new Date(unwrap(dks.lastFiscalYearEnd) ?? Date.now() / 1000) // unix s
      : new Date();
    // lastFiscalYearEnd from yahoo-finance2 is already a Date in current SDK
    // versions; the unwrap path is defensive for older response shapes.
    const fiscal =
      dks?.lastFiscalYearEnd instanceof Date
        ? dks.lastFiscalYearEnd
        : fiscalDate;

    return {
      ticker,
      source: "yahoo",
      fiscalDate: fiscal,
      pe: num(unwrap(dks?.trailingPE) ?? unwrap(sd?.trailingPE)),
      pb: num(unwrap(dks?.priceToBook)),
      ps: num(unwrap(sd?.priceToSalesTrailing12Months)),
      // Phase 4+ improvement: if Yahoo's direct enterpriseToEbitda is missing
      // but the components are present, derive it. This recovers a few tickers
      // where Yahoo computes EV and EBITDA but skips the ratio.
      evEbitda: (() => {
        const direct = unwrap(dks?.enterpriseToEbitda);
        if (typeof direct === "number" && Number.isFinite(direct)) {
          return num(direct);
        }
        const ev = unwrap(dks?.enterpriseValue);
        const ebitda = unwrap(dks?.ebitda) ?? unwrap(fd?.ebitda);
        if (
          typeof ev === "number" &&
          typeof ebitda === "number" &&
          Number.isFinite(ev) &&
          Number.isFinite(ebitda) &&
          ebitda !== 0
        ) {
          return num(ev / ebitda);
        }
        return undefined;
      })(),
      roe: pct(unwrap(fd?.returnOnEquity)),
      // Yahoo doesn't expose ROIC via quoteSummary; left undefined and the
      // factor scoring code treats undefined as missing.
      roic: undefined,
      grossMargin: pct(unwrap(fd?.grossMargins)),
      debtToEquity: num(
        // financialData.debtToEquity is an absolute %, e.g. 192 means 1.92.
        // Normalize to a ratio (192 → 1.92) for consistency with SEC.
        unwrap(fd?.debtToEquity) != null
          ? (unwrap(fd?.debtToEquity) as number) / 100
          : undefined,
      ),
      revenueGrowth: pct(unwrap(fd?.revenueGrowth)),
      epsGrowth: pct(unwrap(fd?.earningsGrowth)),
      raw: { defaultKeyStatistics: dks, summaryDetail: sd, financialData: fd },
    };
  }
}
