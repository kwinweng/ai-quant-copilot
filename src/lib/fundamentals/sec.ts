import { resolveCik } from "./cikMap";
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
    const cik = await resolveCik(ticker);
    if (!cik) {
      console.warn(
        `[fundamentals/sec] no CIK for ${ticker} (hardcoded + remote both empty)`,
      );
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
    // Sprint #5 H4: prefer LongTermDebtNoncurrent so we don't double-count
    // the current portion of long-term debt. If it's not tagged, the broader
    // LongTermDebt concept usually already excludes the current portion.
    const longTermDebt = latestAnnual(
      getConcept(facts, "LongTermDebtNoncurrent", "LongTermDebt"),
    );
    // Short-term debt: only use concepts that don't overlap with longTermDebt.
    // ShortTermBorrowings is the canonical "real short-term" tag. DebtCurrent
    // captures the current portion of all debt (often equivalent on the BS).
    // LongTermDebtCurrent (= long-term debt due in 12 months) was previously
    // mixed in but conflicts with our long-term concept choice — drop it.
    const shortTermDebt = latestAnnual(
      getConcept(facts, "ShortTermBorrowings", "DebtCurrent"),
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

    // Phase 4+ improvement: ROIC self-computed from SEC concepts.
    //
    // Pure-NOPAT formula (NetIncome + after-tax interest expense ÷ invested
    // capital) requires consistent InterestExpense and IncomeTaxExpense tags
    // across filers — those vary too much to be reliable for a 30-ticker
    // batch. We use the simplified textbook proxy instead:
    //
    //   ROIC ≈ NetIncome (TTM) / InvestedCapital
    //   InvestedCapital = StockholdersEquity + TotalDebt
    //
    // It's not strictly "ROIC" in the academic sense (no after-tax interest
    // adjustment), but it's a defensible quality signal that's computable for
    // every filer and points the same direction as full ROIC. We label this
    // explicitly in the data quality panel via factorTypeNote.
    const investedCapital =
      (stockholdersEquity?.val ?? 0) +
      (longTermDebt?.val ?? 0) +
      (shortTermDebt?.val ?? 0);
    const roic =
      netIncome && investedCapital > 0
        ? Math.round((netIncome.value / investedCapital) * 1000) / 10
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

    // Phase 4 follow-up C3: pick a canonical "as-of" anchor for fiscalDate
    // and reportedAt. The previous code had a truthy bug: when only
    // stockholdersEquity was present (netIncome and revenues both undefined),
    // it still entered the truthy branch but returned `undefined` from the
    // ternary, leaving fiscalDate set to "today" — which would wrongly key
    // a brand-new cache row each time we re-read.
    //
    // ttm() returns { value, endDate, filed }; latestAnnual() returns a raw
    // FactPoint with { end, filed }. Different shapes — handle each.
    let fiscalDate = new Date();
    let reportedAt: Date | undefined;
    const ttmAnchor = netIncome ?? revenues;
    if (ttmAnchor) {
      fiscalDate = new Date(ttmAnchor.endDate);
      reportedAt = ttmAnchor.filed ? new Date(ttmAnchor.filed) : undefined;
    } else if (stockholdersEquity) {
      fiscalDate = new Date(stockholdersEquity.end);
      reportedAt = stockholdersEquity.filed
        ? new Date(stockholdersEquity.filed)
        : undefined;
    }

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
      roic,
      grossMargin,
      debtToEquity,
      revenueGrowth,
      epsGrowth,
      // Phase 5: pass through the absolute USD inputs for downstream
      // PIT-correct historical Value computation.
      netIncomeTTM: netIncome?.value,
      revenuesTTM: revenues?.value,
      stockholdersEquity: stockholdersEquity?.val,
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

  /**
   * Phase 4+ PIT support: emit one snapshot per historical 10-K filing.
   *
   * For each fiscal-year-end (10-K end date), we pick the values from that
   * specific filing (matched by `end` date), then derive ROE / ROIC / etc.
   * The `reportedAt` field carries the SEC submission date, which the
   * backtest engine uses to gate visibility (a strategy at month M can only
   * see filings filed before M − reportingLag).
   *
   * Returns history sorted oldest-first.
   */
  async fetchAll(ticker: string): Promise<FundamentalSnapshot[]> {
    const cik = await resolveCik(ticker);
    if (!cik) return [];
    const facts = await fetchCompanyFacts(cik);
    if (!facts) return [];

    const annualsOf = (
      points: FactPoint[] | undefined,
    ): Map<string, FactPoint> => {
      const m = new Map<string, FactPoint>();
      if (!points) return m;
      for (const p of points) {
        if (p.form !== "10-K" && p.form !== "10-K/A") continue;
        // Within a fiscal year-end key, prefer the most recent filing — covers
        // amendments (10-K/A) replacing the original.
        const existing = m.get(p.end);
        if (!existing || existing.filed.localeCompare(p.filed) < 0) {
          m.set(p.end, p);
        }
      }
      return m;
    };

    const revenues = annualsOf(
      getConcept(
        facts,
        "Revenues",
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "SalesRevenueNet",
        "SalesRevenueServicesNet",
      ),
    );
    const grossProfit = annualsOf(getConcept(facts, "GrossProfit"));
    const netIncome = annualsOf(
      getConcept(facts, "NetIncomeLoss", "ProfitLoss"),
    );
    const stockholdersEquity = annualsOf(
      getConcept(
        facts,
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
      ),
    );
    // Sprint #5 H4: same de-duped long/short debt concept choice as the
    // single-snapshot path above — keeps historical PIT ROIC consistent with
    // the current snapshot.
    const longTermDebt = annualsOf(
      getConcept(facts, "LongTermDebtNoncurrent", "LongTermDebt"),
    );
    const shortTermDebt = annualsOf(
      getConcept(facts, "ShortTermBorrowings", "DebtCurrent"),
    );
    const epsAnnual = annualsOf(
      getConcept(facts, "EarningsPerShareBasic", "EarningsPerShareDiluted"),
    );

    // Union of all fiscal-year-end dates we have any data for.
    const fiscalEnds = new Set<string>();
    for (const m of [
      revenues,
      grossProfit,
      netIncome,
      stockholdersEquity,
      longTermDebt,
      shortTermDebt,
      epsAnnual,
    ]) {
      for (const k of m.keys()) fiscalEnds.add(k);
    }
    const sortedEnds = Array.from(fiscalEnds).sort();

    const out: FundamentalSnapshot[] = [];
    for (let i = 0; i < sortedEnds.length; i++) {
      const fy = sortedEnds[i];
      const rev = revenues.get(fy);
      const gp = grossProfit.get(fy);
      const ni = netIncome.get(fy);
      const eq = stockholdersEquity.get(fy);
      const ltd = longTermDebt.get(fy);
      const std = shortTermDebt.get(fy);

      // The reportedAt anchor: max(filed) across the inputs we used. If a
      // strategy could only see one of these, the latest filing is the
      // limiting factor.
      const filedDates = [rev, gp, ni, eq, ltd, std]
        .map((p) => p?.filed)
        .filter((s): s is string => !!s);
      if (filedDates.length === 0) continue;
      const reportedAt = new Date(filedDates.sort().at(-1)!);
      const fiscalDate = new Date(fy);

      const grossMargin =
        rev && gp && rev.val > 0
          ? Math.round((gp.val / rev.val) * 1000) / 10
          : undefined;
      const roe =
        ni && eq && eq.val > 0
          ? Math.round((ni.val / eq.val) * 1000) / 10
          : undefined;
      const investedCapital =
        (eq?.val ?? 0) + (ltd?.val ?? 0) + (std?.val ?? 0);
      const roic =
        ni && investedCapital > 0
          ? Math.round((ni.val / investedCapital) * 1000) / 10
          : undefined;
      const debtToEquity =
        eq && eq.val > 0
          ? ((ltd?.val ?? 0) + (std?.val ?? 0)) / eq.val
          : undefined;

      // YoY growth — needs the prior fiscal-end, if we have it.
      let revenueGrowth: number | undefined;
      // Phase 4 follow-up C4: epsGrowth is intentionally disabled in the
      // historical path. SEC stores EPS as the per-share value reported in
      // each filing — values from pre-split 10-Ks are NOT restated when a
      // company splits stock (think NVDA 10-for-1 in 2024, AAPL 7-for-1 in
      // 2014). A naïve YoY ratio across a split year produces garbage like
      // "+900% earnings growth". Re-introduce only after we plumb
      // CommonStockSharesOutstanding to derive split-adjusted EPS, or
      // substitute NetIncome growth (which is dollar-denominated and
      // immune to splits).
      const epsGrowth: number | undefined = undefined;
      if (i > 0) {
        const prev = sortedEnds[i - 1];
        const prevRev = revenues.get(prev);
        if (rev && prevRev && prevRev.val > 0) {
          revenueGrowth =
            Math.round(((rev.val - prevRev.val) / prevRev.val) * 1000) / 10;
        }
      }

      out.push({
        ticker,
        source: "sec",
        fiscalDate,
        reportedAt,
        // SEC has no market-price-dependent ratios.
        pe: undefined,
        pb: undefined,
        ps: undefined,
        evEbitda: undefined,
        roe,
        roic,
        grossMargin,
        debtToEquity,
        revenueGrowth,
        epsGrowth,
        // Phase 5: absolute USD inputs at this fiscal year-end. Downstream
        // computeHistoricalValueZ uses ni.val / rev.val / eq.val along with
        // back-derived MarketCap_M to compute PIT-correct PE/PS/PB at every
        // backtest month within this filing's visibility window.
        netIncomeTTM: ni?.val,
        revenuesTTM: rev?.val,
        stockholdersEquity: eq?.val,
        // Sprint #6 M1: PIT history can have 10-20 rows per ticker × 30
        // tickers = 300+ rows. Carrying the per-row raw payload bloats the
        // JSONB column needlessly — derived ratios above are what the
        // backtest actually consumes. Keep just the fiscal-end key for
        // debug pinpointing.
        raw: { fiscalEnd: fy },
      });
    }
    return out;
  }
}
