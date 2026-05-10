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

    // Phase 4 follow-up C2: atomic claim — only one concurrent /start can flip
    // status from {DRAFT,PLANNED,FAILED,CANCELLED,COMPLETED} → RUNNING. The
    // previous read-then-write pattern allowed two parallel requests to both
    // pass the "not RUNNING" check and each spawn a runner, racing to write
    // the same study's progress.
    const claim = await prisma.study.updateMany({
      where: { id, userId: session!.user.id, status: { not: "RUNNING" } },
      data: { status: "RUNNING" },
    });
    if (claim.count === 0) {
      // Another request already claimed it (or the study vanished). Return
      // the existing progress so the caller's running page can resume.
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

    // Fire-and-forget. The runner catches all errors and writes FAILED + logs
    // to the DB, so we don't need to await or surface anything here.
    void runBacktest(id);

    return NextResponse.json({ progress });
  } catch (err) {
    console.error("POST /api/studies/[id]/start failed", err);
    return serverError();
  }
}
