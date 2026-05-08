import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, notFound, serverError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  try {
    const study = await prisma.study.findFirst({
      where: { id, userId: session!.user.id },
      include: {
        plan: true,
        progress: true,
        result: true,
      },
    });
    if (!study) return notFound("Study not found");
    return NextResponse.json({ study });
  } catch (err) {
    console.error("GET /api/studies/[id] failed", err);
    return serverError();
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  try {
    const result = await prisma.study.deleteMany({
      where: { id, userId: session!.user.id },
    });
    if (result.count === 0) return notFound("Study not found");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/studies/[id] failed", err);
    return serverError();
  }
}
