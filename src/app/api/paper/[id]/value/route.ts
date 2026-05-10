import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, notFound, serverError } from "@/lib/api";
import { fetchMonthlyPrices } from "@/lib/backtest/prices";
import { valuatePortfolio, type PortfolioHolding } from "@/lib/paper/valuation";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/paper/[id]/value — pull the latest Yahoo prices for the holdings,
// compute current value vs initial value, return positions breakdown.
//
// Cached implicitly by Yahoo fetch + the prisma row. In a future phase we'd
// add a server-side cache to avoid hammering Yahoo on every page load.
export async function GET(_req: Request, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;
  const { id } = await ctx.params;

  try {
    const portfolio = await prisma.paperPortfolio.findFirst({
      where: { id, userId: session!.user.id },
    });
    if (!portfolio) return notFound("Paper portfolio not found");

    const holdings = (portfolio.holdings as unknown as PortfolioHolding[]) ?? [];
    if (holdings.length === 0) {
      return NextResponse.json({
        portfolio,
        valuation: {
          startValue: portfolio.initialValue,
          currentValue: portfolio.initialValue,
          totalReturnPct: 0,
          positions: [],
        },
        benchmark: null,
      });
    }

    // Fetch monthly prices from a window starting before sourceRebalanceDate
    // through "today" (Yahoo will return through the latest available month).
    const tickers = holdings.map((h) => h.ticker);
    const startedYearMonth = portfolio.sourceRebalanceDate; // YYYY-MM
    const [y, m] = startedYearMonth.split("-").map(Number);
    const startDate = new Date(Date.UTC(y, m - 1, 1));
    // Use today as endDate (Yahoo gives us through the latest available bar).
    const endDate = new Date();

    // Pull holdings' prices + benchmark in parallel
    const allFetchTickers = [...tickers, portfolio.benchmark];
    const fetched = await fetchMonthlyPrices({
      tickers: allFetchTickers,
      startDate,
      endDate,
      lookbackMonths: 0, // no warm-up needed for paper trading
    });

    // Build "startPrice" and "currentPrice" maps for each holding ticker.
    const priceMap: Record<
      string,
      { startPrice?: number; currentPrice?: number }
    > = {};
    for (const t of tickers) {
      const series = fetched[t];
      if (!series || series.size === 0) {
        priceMap[t] = {};
        continue;
      }
      const startPrice = series.get(startedYearMonth);
      // Latest available price = last entry in the chronological Map
      let lastPrice: number | undefined;
      for (const v of series.values()) lastPrice = v;
      priceMap[t] = { startPrice, currentPrice: lastPrice };
    }

    const valuation = valuatePortfolio({
      holdings,
      initialValue: portfolio.initialValue,
      startedAt: portfolio.sourceRebalanceDate,
      prices: priceMap,
    });

    // Benchmark valuation: same approach, treat benchmark as a 1-asset portfolio.
    let benchmark: {
      ticker: string;
      startValue: number;
      currentValue: number;
      totalReturnPct: number;
    } | null = null;
    const benchSeries = fetched[portfolio.benchmark];
    if (benchSeries && benchSeries.size > 0) {
      const startPrice = benchSeries.get(startedYearMonth);
      let currentPrice: number | undefined;
      for (const v of benchSeries.values()) currentPrice = v;
      if (
        typeof startPrice === "number" &&
        typeof currentPrice === "number" &&
        startPrice > 0
      ) {
        const ret = (currentPrice - startPrice) / startPrice;
        benchmark = {
          ticker: portfolio.benchmark,
          startValue: portfolio.initialValue,
          currentValue: portfolio.initialValue * (1 + ret),
          totalReturnPct: ret * 100,
        };
      }
    }

    return NextResponse.json({ portfolio, valuation, benchmark });
  } catch (err) {
    console.error("GET /api/paper/[id]/value failed", err);
    return serverError();
  }
}

// DELETE — archive the paper portfolio (soft delete; can be unarchived later).
export async function DELETE(_req: Request, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;
  const { id } = await ctx.params;
  try {
    const result = await prisma.paperPortfolio.updateMany({
      where: { id, userId: session!.user.id },
      data: { archived: true },
    });
    if (result.count === 0) return notFound("Paper portfolio not found");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/paper/[id]/value failed", err);
    return serverError();
  }
}
