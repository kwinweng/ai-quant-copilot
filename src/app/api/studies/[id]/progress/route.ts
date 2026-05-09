import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, badRequest, notFound, serverError } from "@/lib/api";

// DEPRECATED since Phase 3. Pre-Phase-3 the running page PATCHed progress as
// it animated locally; the server-side backtest runner now owns all progress
// writes (src/lib/backtest/runner.ts → setStep). Kept for back-compat with
// any external clients; not used by current UI.

type Ctx = { params: Promise<{ id: string }> };

interface ProgressBody {
  currentStep?: number;
  steps?: unknown;
  logs?: unknown;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  let body: ProgressBody;
  try {
    body = (await req.json()) as ProgressBody;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { currentStep, steps, logs } = body;
  if (
    currentStep === undefined &&
    steps === undefined &&
    logs === undefined
  ) {
    return badRequest("At least one of currentStep / steps / logs is required");
  }

  try {
    const study = await prisma.study.findFirst({
      where: { id, userId: session!.user.id },
      select: { id: true },
    });
    if (!study) return notFound("Study not found");

    const data: Prisma.StudyProgressUpdateInput = {};
    if (typeof currentStep === "number") data.currentStep = currentStep;
    if (steps !== undefined) data.steps = steps as Prisma.InputJsonValue;
    if (logs !== undefined) data.logs = logs as Prisma.InputJsonValue;

    const progress = await prisma.studyProgress.update({
      where: { studyId: id },
      data,
    });
    return NextResponse.json({ progress });
  } catch (err) {
    console.error("PATCH /api/studies/[id]/progress failed", err);
    return serverError();
  }
}
