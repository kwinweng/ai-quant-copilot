import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, badRequest, notFound, serverError } from "@/lib/api";
import { equalWeight } from "@/lib/paper/valuation";

// =====================================================================
// GET /api/paper — list user's paper portfolios (cheap, no price re-fetch).
// Caller hits /api/paper/[id]/value separately to get a fresh valuation.
// =====================================================================
export async function GET() {
  const { session, response } = await requireUser();
  if (response) return response;
  try {
    const portfolios = await prisma.paperPortfolio.findMany({
      where: { userId: session!.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        sourceStudyId: true,
        sourceRebalanceDate: true,
        holdings: true,
        initialValue: true,
        benchmark: true,
        startedAt: true,
        archived: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ portfolios });
  } catch (err) {
    console.error("GET /api/paper failed", err);
    return serverError();
  }
}

// =====================================================================
// POST /api/paper — create a paper portfolio from a study's last rebalance.
// Body: { studyId, title? }
// =====================================================================
interface CreatePaperBody {
  studyId?: string;
  title?: string;
  initialValue?: number;
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireUser();
  if (response) return response;
  let body: CreatePaperBody;
  try {
    body = (await req.json()) as CreatePaperBody;
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.studyId?.trim()) {
    return badRequest("studyId is required");
  }
  if (
    body.initialValue !== undefined &&
    (typeof body.initialValue !== "number" ||
      !Number.isFinite(body.initialValue) ||
      body.initialValue <= 0)
  ) {
    return badRequest("initialValue must be a positive number");
  }

  try {
    const study = await prisma.study.findFirst({
      where: { id: body.studyId, userId: session!.user.id },
      select: {
        id: true,
        title: true,
        benchmark: true,
        status: true,
        result: { select: { rebalanceHistory: true } },
      },
    });
    if (!study) return notFound("Study not found");
    if (study.status !== "COMPLETED") {
      return badRequest("Only completed studies can become paper portfolios");
    }
    const rebalances = (study.result?.rebalanceHistory ?? []) as Array<{
      date: string;
      holdings: string[];
      turnover?: number;
      txCostApplied?: number;
    }>;
    if (rebalances.length === 0) {
      return badRequest(
        "Study has no rebalance history — paper portfolio needs at least one",
      );
    }
    const last = rebalances[rebalances.length - 1];
    const tickers = last.holdings ?? [];
    if (tickers.length === 0) {
      return badRequest("Last rebalance has no holdings");
    }
    const holdings = equalWeight(tickers);
    const titleResolved =
      body.title?.trim() || `Paper · ${study.title}`.slice(0, 200);

    const created = await prisma.paperPortfolio.create({
      data: {
        userId: session!.user.id,
        sourceStudyId: study.id,
        sourceRebalanceDate: last.date,
        title: titleResolved,
        holdings: holdings as unknown as object,
        initialValue: body.initialValue ?? 100000,
        benchmark: study.benchmark || "SPY",
      },
    });
    return NextResponse.json({ portfolio: created }, { status: 201 });
  } catch (err) {
    console.error("POST /api/paper failed", err);
    return serverError();
  }
}
