import { TICKER_TO_CIK } from "@/lib/backtest/universe";
import type {
  FundamentalSnapshot,
  FundamentalsProvider,
} from "./types";

// SEC EDGAR XBRL companyfacts endpoint.
// Docs: https://www.sec.gov/edgar/sec-api-documentation
//
// Returns a giant JSON keyed by GAAP/IFRS taxonomy concept. Each concept has
// `units.USD[]` or `units.shares[]` arrays of facts ordered by `end` (period
// end date). Each fact has a `filed` date (the PIT anchor) and a `form` like
// "10-K" or "10-Q".
//
// SEC requires a User-Agent identifying the requester. We read it from
// SEC_USER_AGENT env var per the Phase 4 memory, falling back to a generic
// string with a contact hint that's better than nothing for development.

const DEFAULT_UA =
  "AI Quant Copilot (research; contact: kwinweng@gmail.com)";

const SEC_BASE = "https://data.sec.gov";

interface FactPoint {
  start?: string;
  end: string;
  val: number;
  filed: string;
  form: string;
  fp?: string; // "FY" | "Q1" | ...
  fy?: number;
}

interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: {
    "us-gaap"?: Record<
      string,
      { label?: string; description?: string; units: Record<string, FactPoint[]> }
    >;
  };
}

function userAgent(): string {
  return process.env.SEC_USER_AGENT?.trim() || DEFAULT_UA;
}

async function fetchCompanyFacts(
  cik: string,
): Promise<CompanyFacts | undefined> {
  const url = `${SEC_BASE}/api/xbrl/companyfacts/CIK${cik}.json`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": userAgent(),
        Accept: "application/json",
      },
      // SEC throttles aggressive callers — keep a single request honest.
      cache: "no-store",
    });
  } catch (err) {
    console.warn(
      `[fundamentals/sec] network error for ${cik}:`,
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }

  if (!res.ok) {
    console.warn(
      `[fundamentals/sec] HTTP ${res.status} for ${cik}: ${res.statusText}`,
    );
    return undefined;
  }
  return (await res.json()) as CompanyFacts;
}

// Pick the most recent annual ("10-K" or "10-K/A") fact, falling back to most
// recent quarterly if no annual exists.
function latestAnnual(points: FactPoint[] | undefined): FactPoint | undefined {
  if (!points || points.length === 0) return undefined;
  const annuals = points
    .filter((p) => p.form === "10-K" || p.form === "10-K/A")
    .sort((a, b) => b.end.localeCompare(a.end));
  if (annuals.length > 0) return annuals[0];
  return [...points].sort((a, b) => b.end.localeCompare(a.end))[0];
}

// Sum a group of quarterly facts into a TTM total. Used for revenue / income
// where 10-Q values are quarterly (Q1, Q2, Q3) and 10-K is the full year.
function ttm(points: FactPoint[] | undefined): {
  value: number;
  endDate: string;
  filed: string;
} | undefined {
  if (!points || points.length === 0) return undefined;
  // Annual filing wins outright — it's already TTM.
  const latest10K = points
    .filter((p) => p.form === "10-K" || p.form === "10-K/A")
    .sort((a, b) => b.end.localeCompare(a.end))[0];
  if (latest10K) {
    return {
      value: latest10K.val,
      endDate: latest10K.end,
      filed: latest10K.filed,
    };
  }
  // Otherwise sum the four most recent non-overlapping quarterly periods.
  // SEC's XBRL has 1-quarter durations for income-statement concepts.
  const quarterly = points
    .filter((p) => p.form === "10-Q" || p.form === "10-Q/A")
    .sort((a, b) => b.end.localeCompare(a.end));
  if (quarterly.length < 4) return undefined;
  const last4 = quarterly.slice(0, 4);
  const value = last4.reduce((s, p) => s + p.val, 0);
  return { value, endDate: last4[0].end, filed: last4[0].filed };
}

function getConcept(
  facts: CompanyFacts,
  ...concepts: string[]
): FactPoint[] | undefined {
  const ns = facts.facts["us-gaap"];
  if (!ns) return undefined;
  for (const c of concepts) {
    const node = ns[c];
    if (!node) continue;
    // Prefer USD units; fall back to first available unit.
    const usd = node.units["USD"];
    if (usd && usd.length > 0) return usd;
    const first = Object.values(node.units)[0];
    if (first && first.length > 0) return first;
  }
  return undefined;
}

export class SecEdgarProvider implements FundamentalsProvider {
  readonly name = "sec" as const;

  async fetch(ticker: string): Promise<FundamentalSnapshot | undefined> {
    const cik = TICKER_TO_CIK[ticker];
    if (!cik) {
      console.warn(`[fundamentals/sec] no CIK for ${ticker}`);
      return undefined;
    }

    const facts = await fetchCompanyFacts(cik);
    if (!facts) return undefined;

    // Pull the raw concepts we'll need.
    // Note: GAAP concept names vary by filer — try several aliases.
    const revenues =
      ttm(
        getConcept(
          facts,
          "Revenues",
          "RevenueFromContractWithCustomerExcludingAssessedTax",
          "SalesRevenueNet",
          "SalesRevenueServicesNet",
        ),
      );
    const grossProfit = ttm(getConcept(facts, "GrossProfit"));
    const netIncome = ttm(
      getConcept(
        facts,
        "NetIncomeLoss",
        "ProfitLoss",
      ),
    );
    const stockholdersEquity = latestAnnual(
      getConcept(
        facts,
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
      ),
    );
    const longTermDebt = latestAnnual(
      getConcept(facts, "LongTermDebt", "LongTermDebtNoncurrent"),
    );
    const shortTermDebt = latestAnnual(
      getConcept(
        facts,
        "ShortTermBorrowings",
        "LongTermDebtCurrent",
        "DebtCurrent",
      ),
    );
    const epsBasic = latestAnnual(
      getConcept(facts, "EarningsPerShareBasic", "EarningsPerShareDiluted"),
    );

    // Compute derived ratios where the inputs cooperate.
    const grossMargin =
      revenues && grossProfit && revenues.value > 0
        ? Math.round((grossProfit.value / revenues.value) * 1000) / 10
        : undefined;
    const roe =
      netIncome && stockholdersEquity && stockholdersEquity.val > 0
        ? Math.round((netIncome.value / stockholdersEquity.val) * 1000) / 10
        : undefined;
    const debtToEquity =
      stockholdersEquity && stockholdersEquity.val > 0
        ? ((longTermDebt?.val ?? 0) + (shortTermDebt?.val ?? 0)) /
          stockholdersEquity.val
        : undefined;

    // Revenue growth YoY: pull two consecutive annuals if possible.
    let revenueGrowth: number | undefined;
    const revPoints = getConcept(
      facts,
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "SalesRevenueNet",
    );
    if (revPoints) {
      const annuals = revPoints
        .filter((p) => p.form === "10-K" || p.form === "10-K/A")
        .sort((a, b) => b.end.localeCompare(a.end));
      if (annuals.length >= 2 && annuals[1].val > 0) {
        revenueGrowth =
          Math.round(((annuals[0].val - annuals[1].val) / annuals[1].val) * 1000) / 10;
      }
    }

    // EPS growth YoY.
    let epsGrowth: number | undefined;
    const epsPoints = getConcept(
      facts,
      "EarningsPerShareBasic",
      "EarningsPerShareDiluted",
    );
    if (epsPoints) {
      const annuals = epsPoints
        .filter((p) => p.form === "10-K" || p.form === "10-K/A")
        .sort((a, b) => b.end.localeCompare(a.end));
      if (annuals.length >= 2 && Math.abs(annuals[1].val) > 0.01) {
        epsGrowth =
          Math.round(((annuals[0].val - annuals[1].val) / Math.abs(annuals[1].val)) * 1000) / 10;
      }
    }

    // Use the latest fiscal end + filed timestamp we encountered as the
    // canonical "as-of" anchors. Prefer netIncome's filing because it's the
    // most consistently reported.
    const anchor =
      netIncome ?? revenues ?? stockholdersEquity
        ? netIncome ?? revenues
        : undefined;
    const fiscalDate = anchor
      ? new Date(anchor.endDate ?? anchor.endDate)
      : new Date();
    const reportedAt = anchor?.filed ? new Date(anchor.filed) : undefined;

    return {
      ticker,
      source: "sec",
      fiscalDate,
      reportedAt,
      // SEC doesn't ship market-price-dependent ratios; PE/PB/PS/EV-EBITDA
      // need a current quote which Yahoo gives us. Leave them undefined and
      // let merge() fill them.
      pe: undefined,
      pb: undefined,
      ps: undefined,
      evEbitda: undefined,
      roe,
      // ROIC requires NOPAT + invested capital — both derivable from XBRL but
      // tagging varies a lot across filers. Defer to a later iteration.
      roic: undefined,
      grossMargin,
      debtToEquity,
      revenueGrowth,
      epsGrowth,
      raw: {
        entityName: facts.entityName,
        revenues,
        grossProfit,
        netIncome,
        stockholdersEquity,
        longTermDebt,
        shortTermDebt,
        epsBasic,
      },
    };
  }
}
