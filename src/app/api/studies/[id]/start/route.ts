import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, notFound, serverError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const INITIAL_STEPS = [
  { name: "Validate Parameters", status: "running" },
  { name: "Fetch Price Data", status: "pending" },
  { name: "Fetch Fundamental Data", status: "pending" },
  { name: "Compute Factor Scores", status: "pending" },
  { name: "Construct Portfolios", status: "pending" },
  { name: "Run Backtest Engine", status: "pending" },
  { name: "Compute Risk Metrics", status: "pending" },
  { name: "Generate AI Report", status: "pending" },
];

export async function POST(_req: Request, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  try {
    const study = await prisma.study.findFirst({
      where: { id, userId: session!.user.id },
      select: { id: true },
    });
    if (!study) return notFound("Study not found");

    const now = new Date().toISOString();
    const progress = await prisma.studyProgress.upsert({
      where: { studyId: id },
      create: {
        studyId: id,
        currentStep: 0,
        steps: INITIAL_STEPS,
        logs: [{ ts: now, message: "Pipeline started", level: "info" }],
      },
      update: {
        currentStep: 0,
        steps: INITIAL_STEPS,
        logs: [{ ts: now, message: "Pipeline restarted", level: "info" }],
      },
    });

    await prisma.study.update({
      where: { id },
      data: { status: "RUNNING" },
    });

    return NextResponse.json({ progress });
  } catch (err) {
    console.error("POST /api/studies/[id]/start failed", err);
    return serverError();
  }
}
