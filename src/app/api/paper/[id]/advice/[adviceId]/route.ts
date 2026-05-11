// Phase 12: act on a single advice row — confirm (apply suggested holdings
// to the portfolio) or skip (record the decision without changing holdings).
//
// PATCH body: { action: "confirm" | "skip" }
//
// confirm: rewrite portfolio.holdings to equal-weighted suggestedTickers,
// bump sourceRebalanceDate to suggestedMonth, set status=confirmed,
// actedAt=now. The portfolio's startedAt anchor stays untouched so the
// historical buy-and-hold valuation is preserved; future phases can decide
// whether to re-anchor.
//
// skip: just status=skipped + actedAt=now.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, badRequest, notFound, serverError } from "@/lib/api";
import { equalWeight } from "@/lib/paper/valuation";

type Ctx = { params: Promise<{ id: string; adviceId: string }> };

interface PatchBody {
  action?: "confirm" | "skip";
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;
  const { id, adviceId } = await ctx.params;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (body.action !== "confirm" && body.action !== "skip") {
    return badRequest('action must be "confirm" or "skip"');
  }

  try {
    const advice = await prisma.paperRebalanceAdvice.findFirst({
      where: {
        id: adviceId,
        paperPortfolioId: id,
        userId: session!.user.id,
      },
    });
    if (!advice) return notFound("Advice not found");
    if (advice.status !== "pending") {
      return badRequest(`Advice already ${advice.status}`);
    }

    if (body.action === "skip") {
      const updated = await prisma.paperRebalanceAdvice.update({
        where: { id: adviceId },
        data: { status: "skipped", actedAt: new Date() },
      });
      return NextResponse.json({ advice: updated, portfolio: null });
    }

    // confirm: atomic update of advice + portfolio.
    const newHoldings = equalWeight(advice.suggestedTickers);
    const [updatedAdvice, updatedPortfolio] = await prisma.$transaction([
      prisma.paperRebalanceAdvice.update({
        where: { id: adviceId },
        data: { status: "confirmed", actedAt: new Date() },
      }),
      prisma.paperPortfolio.update({
        where: { id },
        data: {
          holdings: newHoldings as unknown as object,
          sourceRebalanceDate: advice.suggestedMonth,
        },
      }),
    ]);
    return NextResponse.json({
      advice: updatedAdvice,
      portfolio: updatedPortfolio,
    });
  } catch (err) {
    console.error("PATCH /api/paper/[id]/advice/[adviceId] failed", err);
    return serverError();
  }
}
