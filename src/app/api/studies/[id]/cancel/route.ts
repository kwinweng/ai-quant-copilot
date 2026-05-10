import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, notFound, badRequest, serverError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

// Flip a RUNNING / PLANNED study to CANCELLED. Idempotent: a second call on
// an already-cancelled study returns ok without error. COMPLETED studies are
// rejected so we don't overwrite a finished result.
export async function POST(_req: Request, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  try {
    // Phase 4 follow-up H1: atomic conditional update — race-free flip from
    // {RUNNING, PLANNED, DRAFT} → CANCELLED. The previous read-then-write
    // pattern could overwrite a COMPLETED status if the runner finished
    // between the findFirst and the update.
    const claim = await prisma.study.updateMany({
      where: {
        id,
        userId: session!.user.id,
        status: { in: ["RUNNING", "PLANNED", "DRAFT"] },
      },
      data: { status: "CANCELLED" },
    });
    if (claim.count > 0) {
      return NextResponse.json({ ok: true, status: "CANCELLED" });
    }

    // Either the study doesn't exist, isn't ours, or is already in a terminal
    // state. Disambiguate with a quick read so the client gets a useful error.
    const study = await prisma.study.findFirst({
      where: { id, userId: session!.user.id },
      select: { status: true },
    });
    if (!study) return notFound("Study not found");
    if (study.status === "CANCELLED") {
      return NextResponse.json({ ok: true, status: "CANCELLED" });
    }
    if (study.status === "COMPLETED") {
      return badRequest("Cannot cancel a completed study");
    }
    if (study.status === "FAILED") {
      return badRequest("Cannot cancel a failed study");
    }
    return badRequest(`Cannot cancel from status ${study.status}`);
  } catch (err) {
    console.error("POST /api/studies/[id]/cancel failed", err);
    return serverError();
  }
}
