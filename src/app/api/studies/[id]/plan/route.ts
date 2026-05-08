import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, badRequest, notFound, serverError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

interface PlanBody {
  dataRequirements?: string;
  factorDefs?: string;
  backtestRules?: string;
  riskChecks?: string;
  limitations?: string;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  let body: PlanBody;
  try {
    body = (await req.json()) as PlanBody;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const {
    dataRequirements = "",
    factorDefs = "",
    backtestRules = "",
    riskChecks = "",
    limitations = "",
  } = body;

  try {
    const study = await prisma.study.findFirst({
      where: { id, userId: session!.user.id },
      select: { id: true },
    });
    if (!study) return notFound("Study not found");

    const plan = await prisma.studyPlan.upsert({
      where: { studyId: id },
      create: {
        studyId: id,
        dataRequirements,
        factorDefs,
        backtestRules,
        riskChecks,
        limitations,
      },
      update: {
        dataRequirements,
        factorDefs,
        backtestRules,
        riskChecks,
        limitations,
      },
    });

    await prisma.study.update({
      where: { id },
      data: { status: "PLANNED" },
    });

    return NextResponse.json({ plan });
  } catch (err) {
    console.error("POST /api/studies/[id]/plan failed", err);
    return serverError();
  }
}
