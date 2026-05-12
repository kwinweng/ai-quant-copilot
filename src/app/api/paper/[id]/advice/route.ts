// Phase 12: list advice rows for a specific PaperPortfolio.
// Pending-first ordering so the UI can pop the most-actionable row immediately.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, notFound, serverError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;
  const { id } = await ctx.params;
  try {
    const portfolio = await prisma.paperPortfolio.findFirst({
      where: { id, userId: session!.user.id },
      select: { id: true },
    });
    if (!portfolio) return notFound("Paper portfolio not found");
    // Pending-first ordering: `actedAt` is null for pending rows and set for
    // confirmed/skipped, so `actedAt asc nulls first` naturally floats pending
    // to the top. Within a status, newest month wins. Don't sort by `status`
    // directly — that's the PG enum and alphabetical order would put
    // `confirmed` before `pending`, which is the opposite of what we want.
    const advices = await prisma.paperRebalanceAdvice.findMany({
      where: { paperPortfolioId: id, userId: session!.user.id },
      orderBy: [{ actedAt: { sort: "asc", nulls: "first" } }, { suggestedMonth: "desc" }],
    });
    return NextResponse.json({ advices });
  } catch (err) {
    console.error("GET /api/paper/[id]/advice failed", err);
    return serverError();
  }
}
