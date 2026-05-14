// Phase 15 — GET/POST /api/paper/[id]/review
//
// GET  : return cached quarterlyReview when fresh (< 7 days), else 404
//        unless ?force=1 is set (then compute fresh inline)
// POST : compute fresh review, run AI summary, persist to PaperPortfolio.
//        Billed against AiUsageDay.reviewCalls.
//
// We compute on-demand (no scheduler) because reviews are cheap and users
// only see them when they open the paper page. The 7-day cache prevents
// re-billing the AI summary on every dashboard load.

import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireUser,
  notFound,
  serverError,
  tooManyRequests,
} from "@/lib/api";
import { fetchMonthlyPrices } from "@/lib/backtest/prices";
import {
  type PortfolioHolding,
} from "@/lib/paper/valuation";
import {
  computeCalibration,
  isReviewStale,
  type CalibrationResult,
} from "@/lib/paper/calibration";
import { generateReviewSummary } from "@/lib/ai/reviewSummary";
import {
  assertUsageQuota,
  incrementUsage,
  describeAiError,
  isBillableError,
} from "@/lib/ai";

type Ctx = { params: Promise<{ id: string }> };

interface CachedReview extends CalibrationResult {
  computedAt: string;
  aiSummary: string;
  studyTitle?: string;
}

interface MonthlyReturnEntry {
  date: string;
  strategy: number;
  benchmark: number;
}

interface AdviceStatusEntry {
  status: "pending" | "confirmed" | "skipped";
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;
  const { id } = await ctx.params;
  const force = new URL(req.url).searchParams.get("force") === "1";

  try {
    const portfolio = await prisma.paperPortfolio.findFirst({
      where: { id, userId: session!.user.id },
      select: { id: true, quarterlyReview: true },
    });
    if (!portfolio) return notFound("Paper portfolio not found");
    const cached = portfolio.quarterlyReview as CachedReview | null;
    if (!force && cached && !isReviewStale(cached.computedAt)) {
      return Response.json({ review: cached, stale: false });
    }
    if (cached) {
      return Response.json({ review: cached, stale: true });
    }
    return notFound("No cached review");
  } catch (err) {
    console.error("GET /api/paper/[id]/review failed", err);
    return serverError();
  }
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;
  const { id } = await ctx.params;

  let portfolio;
  try {
    portfolio = await prisma.paperPortfolio.findFirst({
      where: { id, userId: session!.user.id },
      include: {
        advices: { select: { status: true } },
      },
    });
  } catch (err) {
    console.error("POST /api/paper/[id]/review prefetch failed", err);
    return serverError();
  }
  if (!portfolio) return notFound("Paper portfolio not found");

  // Pull the source study's backtest monthly returns + title so we have a
  // ground truth to compare against. Treat missing source as fatal — without
  // a backtest there's no calibration baseline.
  const study = await prisma.study.findFirst({
    where: { id: portfolio.sourceStudyId, userId: session!.user.id },
    select: {
      id: true,
      title: true,
      result: { select: { monthlyReturns: true } },
    },
  });
  if (!study || !study.result) {
    return notFound("Source study or result not found");
  }
  const backtestMonthly = (study.result.monthlyReturns ?? []) as unknown as MonthlyReturnEntry[];

  const quota = await assertUsageQuota(session!.user.id, "review");
  if (quota) {
    return tooManyRequests("AI 复盘今日次数已用尽，请明天再试", quota);
  }

  // ---- Fetch live actual monthly returns for the portfolio -------------
  const holdings = (portfolio.holdings as unknown as PortfolioHolding[]) ?? [];
  const tickers = holdings.map((h) => h.ticker);
  let actualMonthly: Array<{ date: string; ret: number }> = [];
  let aiBilled = false;
  let aiFailureBillable = false;

  try {
    if (tickers.length > 0) {
      const [y, m] = portfolio.sourceRebalanceDate.split("-").map(Number);
      const startDate = new Date(Date.UTC(y, m - 1, 1));
      const fetched = await fetchMonthlyPrices({
        tickers,
        startDate,
        endDate: new Date(),
        lookbackMonths: 1,
      });
      // Build month → portfolio return series:
      // monthRet = sum_i weight_i × (price_i[m] / price_i[m-1] - 1)
      // We assume held weights stay at the inception weights for the full
      // observation window (consistent with valuation.ts buy-and-hold).
      const monthSet = new Set<string>();
      for (const t of tickers) {
        const s = fetched[t];
        if (!s) continue;
        for (const m of s.keys()) monthSet.add(m);
      }
      const months = [...monthSet].sort();
      const weightByTicker: Record<string, number> = {};
      for (const h of holdings) weightByTicker[h.ticker] = h.weight;

      for (let i = 1; i < months.length; i++) {
        const prev = months[i - 1];
        const curr = months[i];
        if (curr < portfolio.sourceRebalanceDate) continue;
        let ret = 0;
        let weightSum = 0;
        for (const t of tickers) {
          const s = fetched[t];
          if (!s) continue;
          const p0 = s.get(prev);
          const p1 = s.get(curr);
          if (
            typeof p0 !== "number" ||
            typeof p1 !== "number" ||
            p0 <= 0 ||
            !Number.isFinite(p1)
          ) {
            continue;
          }
          const r = p1 / p0 - 1;
          const w = weightByTicker[t] ?? 0;
          ret += w * r;
          weightSum += w;
        }
        if (weightSum > 0) {
          actualMonthly.push({ date: curr, ret: ret / weightSum });
        }
      }
    }
  } catch (err) {
    console.warn("[review] price fetch failed:", err);
    // Continue with empty actuals — the calibration will return nulls.
  }

  const adviceLog: AdviceStatusEntry[] = portfolio.advices.map((a) => ({
    status: a.status,
  }));
  const calibration = computeCalibration({
    startMonth: portfolio.sourceRebalanceDate,
    actualMonthly,
    backtestMonthly,
    adviceLog,
  });

  let aiSummary = "";
  try {
    aiSummary = await generateReviewSummary({
      studyTitle: study.title,
      startMonth: portfolio.sourceRebalanceDate,
      monthsObserved: calibration.monthsObserved,
      hitRate: calibration.hitRate,
      trackingError: calibration.trackingError,
      actualCagr: calibration.actualCagr,
      expectedCagr: calibration.expectedCagr,
      executionRate: calibration.executionRate,
    });
    aiBilled = true;
  } catch (err) {
    console.warn("[review] AI summary threw — using fallback:", err);
    aiFailureBillable = isBillableError(err);
    aiSummary = describeAiError(err);
  }

  const cached: CachedReview = {
    ...calibration,
    studyTitle: study.title,
    computedAt: new Date().toISOString(),
    aiSummary,
  };

  try {
    await prisma.paperPortfolio.update({
      where: { id: portfolio.id },
      data: {
        quarterlyReview: cached as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.warn("[review] cache persist failed:", err);
  }

  if (aiBilled || aiFailureBillable) {
    try {
      await incrementUsage(session!.user.id, "review");
    } catch (err) {
      console.warn("[review] increment usage failed:", err);
    }
  }

  return Response.json({ review: cached, stale: false });
}

export const runtime = "nodejs";
