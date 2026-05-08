import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, badRequest, notFound, serverError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

interface ResultBody {
  conclusion?: string;
  metrics?: unknown;
  equityCurve?: unknown;
  drawdown?: unknown;
  annualReturns?: unknown;
  factorDiagnostics?: unknown;
  aiExplanation?: unknown;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  let body: ResultBody;
  try {
    body = (await req.json()) as ResultBody;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const {
    conclusion = "",
    metrics,
    equityCurve,
    drawdown,
    annualReturns,
    factorDiagnostics,
    aiExplanation,
  } = body;

  if (!metrics || !equityCurve) {
    return badRequest("metrics and equityCurve are required");
  }

  try {
    const study = await prisma.study.findFirst({
      where: { id, userId: session!.user.id },
      select: { id: true },
    });
    if (!study) return notFound("Study not found");

    const payload = {
      conclusion,
      metrics: metrics as Prisma.InputJsonValue,
      equityCurve: equityCurve as Prisma.InputJsonValue,
      drawdown: (drawdown ?? []) as Prisma.InputJsonValue,
      annualReturns: (annualReturns ?? []) as Prisma.InputJsonValue,
      factorDiagnostics: (factorDiagnostics ?? []) as Prisma.InputJsonValue,
      aiExplanation: (aiExplanation ?? []) as Prisma.InputJsonValue,
    };

    const result = await prisma.studyResult.upsert({
      where: { studyId: id },
      create: { studyId: id, ...payload },
      update: payload,
    });

    await prisma.study.update({
      where: { id },
      data: { status: "COMPLETED" },
    });

    return NextResponse.json({ result });
  } catch (err) {
    console.error("POST /api/studies/[id]/result failed", err);
    return serverError();
  }
}
