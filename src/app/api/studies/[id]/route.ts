import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, badRequest, notFound, serverError } from "@/lib/api";

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

// Phase 3.2: PATCH for tags / favorite / archive / rename. Strict allow-list —
// no other Study fields can be updated through this endpoint, so users can't
// retroactively edit hypothesis/parameters of a completed run.
interface PatchBody {
  title?: string;
  tags?: string[];
  favorited?: boolean;
  archived?: boolean;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const data: PatchBody = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return badRequest("title must be a non-empty string");
    }
    data.title = body.title.trim().slice(0, 200);
  }
  if (body.tags !== undefined) {
    if (
      !Array.isArray(body.tags) ||
      body.tags.some((t) => typeof t !== "string")
    ) {
      return badRequest("tags must be an array of strings");
    }
    // Normalize: trim, drop empties, dedupe, cap individual length and total count.
    const normalized = Array.from(
      new Set(
        body.tags
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
          .map((t) => t.slice(0, 32)),
      ),
    ).slice(0, 12);
    data.tags = normalized;
  }
  if (body.favorited !== undefined) {
    if (typeof body.favorited !== "boolean") {
      return badRequest("favorited must be a boolean");
    }
    data.favorited = body.favorited;
  }
  if (body.archived !== undefined) {
    if (typeof body.archived !== "boolean") {
      return badRequest("archived must be a boolean");
    }
    data.archived = body.archived;
  }

  if (Object.keys(data).length === 0) {
    return badRequest("Nothing to update");
  }

  try {
    const result = await prisma.study.updateMany({
      where: { id, userId: session!.user.id },
      data,
    });
    if (result.count === 0) return notFound("Study not found");
    const study = await prisma.study.findUnique({ where: { id } });
    return NextResponse.json({ study });
  } catch (err) {
    console.error("PATCH /api/studies/[id] failed", err);
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
