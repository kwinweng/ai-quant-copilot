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
    const study = await prisma.study.findFirst({
      where: { id, userId: session!.user.id },
      select: { id: true, status: true },
    });
    if (!study) return notFound("Study not found");

    if (study.status === "COMPLETED") {
      return badRequest("Cannot cancel a completed study");
    }
    if (study.status === "CANCELLED") {
      return NextResponse.json({ ok: true, status: "CANCELLED" });
    }

    const updated = await prisma.study.update({
      where: { id },
      data: { status: "CANCELLED" },
      select: { id: true, status: true },
    });
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (err) {
    console.error("POST /api/studies/[id]/cancel failed", err);
    return serverError();
  }
}
