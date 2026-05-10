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
        factorMix: true,
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

    // Sprint #6 M5: dashboard polls this list every 5s. The metrics JSON has
    // 10+ leaf fields × {strategy, spy} = ~700 bytes per row, but the
    // dashboard cards only compare CAGR / Sharpe / Max DD. Strip the rest
    // server-side so a 50-study workspace polls ~25 KB instead of ~50 KB.
    // Conclusion stays full-text since it's already line-clamped client-side
    // and renaming/truncating it on the server breaks compare/result pages
    // that share the same fetcher.
    type SlimMetrics = {
      strategy: { cagr: number; sharpe: number; maxDrawdown: number };
      spy: { cagr: number; sharpe: number; maxDrawdown: number };
    } | null;
    const slimMetrics = (raw: unknown): SlimMetrics => {
      if (!raw || typeof raw !== "object") return null;
      const m = raw as Record<string, unknown>;
      const pick = (side: unknown) => {
        if (!side || typeof side !== "object") return null;
        const s = side as Record<string, unknown>;
        const num = (v: unknown): number =>
          typeof v === "number" && Number.isFinite(v) ? v : 0;
        return {
          cagr: num(s.cagr),
          sharpe: num(s.sharpe),
          maxDrawdown: num(s.maxDrawdown),
        };
      };
      const strategy = pick(m.strategy);
      const spy = pick(m.spy);
      if (!strategy || !spy) return null;
      return { strategy, spy };
    };
    const slimStudies = studies.map((s) => ({
      ...s,
      result: s.result
        ? { ...s.result, metrics: slimMetrics(s.result.metrics) }
        : null,
    }));
    return NextResponse.json({ studies: slimStudies });
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
  factorMix?: string;
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
    factorMix = "momentum",
  } = body;

  if (factorMix !== "momentum" && factorMix !== "multifactor") {
    return badRequest("factorMix must be 'momentum' or 'multifactor'");
  }

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
        factorMix,
      },
    });
    return NextResponse.json({ study }, { status: 201 });
  } catch (err) {
    console.error("POST /api/studies failed", err);
    return serverError();
  }
}
