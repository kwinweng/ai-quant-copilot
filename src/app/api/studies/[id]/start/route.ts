import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, notFound, serverError } from "@/lib/api";
import { runBacktest, stepsForFactorMix } from "@/lib/backtest/runner";

type Ctx = { params: Promise<{ id: string }> };

function pendingStepsFor(factorMix: string) {
  return stepsForFactorMix(factorMix).map((s) => ({
    name: s.name,
    description: s.description,
    status: "pending" as const,
  }));
}

export async function POST(_req: Request, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  try {
    const study = await prisma.study.findFirst({
      where: { id, userId: session!.user.id },
      select: { id: true, status: true, factorMix: true },
    });
    if (!study) return notFound("Study not found");

    // If a backtest is already in flight, don't double-launch it. Returning
    // the existing progress lets the running page resume.
    if (study.status === "RUNNING") {
      const progress = await prisma.studyProgress.findUnique({
        where: { studyId: id },
      });
      return NextResponse.json({ progress, alreadyRunning: true });
    }

    const pendingSteps = pendingStepsFor(study.factorMix);
    const now = new Date().toISOString();
    const progress = await prisma.studyProgress.upsert({
      where: { studyId: id },
      create: {
        studyId: id,
        currentStep: 0,
        steps: pendingSteps,
        logs: [{ ts: now, message: "回测排队中…", level: "info" }],
      },
      update: {
        currentStep: 0,
        steps: pendingSteps,
        logs: [{ ts: now, message: "回测重启中…", level: "info" }],
        startedAt: new Date(),
      },
    });

    await prisma.study.update({
      where: { id },
      data: { status: "RUNNING" },
    });

    // Fire-and-forget. The runner catches all errors and writes FAILED + logs
    // to the DB, so we don't need to await or surface anything here.
    void runBacktest(id);

    return NextResponse.json({ progress });
  } catch (err) {
    console.error("POST /api/studies/[id]/start failed", err);
    return serverError();
  }
}
