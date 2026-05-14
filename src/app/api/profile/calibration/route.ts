// Phase 15 — GET /api/profile/calibration
//
// Aggregates cached quarterlyReview rows across all the user's paper
// portfolios for the user-level dashboard. We deliberately do NOT compute
// fresh reviews here — that's the per-portfolio review endpoint's job. If
// a portfolio has no cached review, it appears with `review: null` and the
// dashboard prompts the user to open that paper's review tab.

import { prisma } from "@/lib/prisma";
import { requireUser, serverError } from "@/lib/api";

interface CachedReviewShape {
  monthsObserved?: number;
  hitRate?: number | null;
  trackingError?: number | null;
  actualCagr?: number | null;
  expectedCagr?: number | null;
  executionRate?: number | null;
  computedAt?: string;
  aiSummary?: string;
}

export async function GET() {
  const { session, response } = await requireUser();
  if (response) return response;

  try {
    const portfolios = await prisma.paperPortfolio.findMany({
      where: { userId: session!.user.id, archived: false },
      select: {
        id: true,
        title: true,
        sourceStudyId: true,
        sourceRebalanceDate: true,
        benchmark: true,
        initialValue: true,
        quarterlyReview: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const items = portfolios.map((p) => {
      const review = p.quarterlyReview as CachedReviewShape | null;
      return {
        id: p.id,
        title: p.title,
        sourceStudyId: p.sourceStudyId,
        sourceRebalanceDate: p.sourceRebalanceDate,
        benchmark: p.benchmark,
        createdAt: p.createdAt,
        review: review
          ? {
              monthsObserved: review.monthsObserved ?? 0,
              hitRate: review.hitRate ?? null,
              trackingError: review.trackingError ?? null,
              actualCagr: review.actualCagr ?? null,
              expectedCagr: review.expectedCagr ?? null,
              executionRate: review.executionRate ?? null,
              computedAt: review.computedAt ?? null,
            }
          : null,
      };
    });

    // ---- Aggregate stats ----
    const withReview = items
      .filter((i) => i.review && i.review.monthsObserved > 0)
      .map((i) => i.review!);
    const median = (xs: number[]): number | null => {
      if (xs.length === 0) return null;
      const sorted = [...xs].sort((a, b) => a - b);
      const m = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[m - 1] + sorted[m]) / 2
        : sorted[m];
    };
    const hitRates = withReview
      .map((r) => r.hitRate)
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    const tes = withReview
      .map((r) => r.trackingError)
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    const cagrGaps = withReview
      .map((r) =>
        r.actualCagr != null && r.expectedCagr != null
          ? r.actualCagr - r.expectedCagr
          : null,
      )
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));

    const aggregate = {
      totalPortfolios: items.length,
      portfoliosWithReview: withReview.length,
      portfoliosTracking: withReview.length,
      medianHitRate: median(hitRates),
      medianTrackingError: median(tes),
      medianCagrGap: median(cagrGaps),
    };

    return Response.json({ items, aggregate });
  } catch (err) {
    console.error("GET /api/profile/calibration failed", err);
    return serverError();
  }
}
