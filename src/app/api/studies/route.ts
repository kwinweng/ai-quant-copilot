import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, badRequest, serverError } from "@/lib/api";

export async function GET() {
  const { session, response } = await requireUser();
  if (response) return response;

  try {
    const studies = await prisma.study.findMany({
      where: { userId: session!.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        hypothesis: true,
        market: true,
        universe: true,
        startDate: true,
        endDate: true,
        rebalance: true,
        benchmark: true,
        txCostBps: true,
        status: true,
        tags: true,
        favorited: true,
        archived: true,
        createdAt: true,
        updatedAt: true,
        result: {
          select: {
            metrics: true,
            conclusion: true,
            createdAt: true,
          },
        },
        progress: {
          select: {
            currentStep: true,
            updatedAt: true,
          },
        },
      },
    });
    return NextResponse.json({ studies });
  } catch (err) {
    console.error("GET /api/studies failed", err);
    return serverError();
  }
}

interface CreateStudyBody {
  title?: string;
  hypothesis?: string;
  market?: string;
  universe?: string;
  startDate?: string;
  endDate?: string;
  rebalance?: string;
  benchmark?: string;
  txCostBps?: number;
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireUser();
  if (response) return response;

  let body: CreateStudyBody;
  try {
    body = (await req.json()) as CreateStudyBody;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const {
    title,
    hypothesis,
    market = "US",
    universe,
    startDate,
    endDate,
    rebalance,
    benchmark,
    txCostBps,
  } = body;

  if (!hypothesis?.trim()) return badRequest("hypothesis is required");
  if (!universe?.trim()) return badRequest("universe is required");
  if (!startDate || !endDate) return badRequest("startDate and endDate are required");
  if (!rebalance?.trim()) return badRequest("rebalance is required");
  if (!benchmark?.trim()) return badRequest("benchmark is required");
  if (typeof txCostBps !== "number" || Number.isNaN(txCostBps)) {
    return badRequest("txCostBps must be a number");
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return badRequest("startDate / endDate must be valid ISO dates");
  }
  if (start >= end) {
    return badRequest("startDate must be earlier than endDate");
  }

  const derivedTitle = title?.trim() || hypothesis.trim().slice(0, 60);

  try {
    const study = await prisma.study.create({
      data: {
        userId: session!.user.id,
        title: derivedTitle,
        hypothesis: hypothesis.trim(),
        market,
        universe,
        startDate: start,
        endDate: end,
        rebalance,
        benchmark,
        txCostBps,
      },
    });
    return NextResponse.json({ study }, { status: 201 });
  } catch (err) {
    console.error("POST /api/studies failed", err);
    return serverError();
  }
}
