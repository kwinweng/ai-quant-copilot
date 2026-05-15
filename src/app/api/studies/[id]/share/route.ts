// Phase 16 — Public share token management.
//
//   GET    — return current share token state (token + viewCount + lastAccessedAt)
//            or 404 if none exists. Used by the share modal.
//   POST   — mint a new token, OR rotate an existing one (resets viewCount).
//            Caller can pass body { rotate: true } to force a new token even
//            if one exists; default behavior is "create if missing, return
//            existing if present" to be idempotent on first click.
//   DELETE — revoke. Old links return 404 immediately.

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, badRequest, notFound, serverError } from "@/lib/api";
import { randomBytes } from "node:crypto";

type Ctx = { params: Promise<{ id: string }> };

interface ShareResponse {
  token: string;
  url: string;
  viewCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// 32 random bytes → base64url (~43 chars, unguessable). Larger than UUID v4
// because UUIDs include version + variant bits that are constant; we want
// every bit to contribute entropy.
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function shareUrlFor(token: string): string {
  // APP_URL is set in prod; fall back to a relative URL in dev so the
  // returned object is still useful in local development without env config.
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  return `${base}/share/${token}`;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;
  const { id } = await ctx.params;

  try {
    const study = await prisma.study.findFirst({
      where: { id, userId: session!.user.id },
      include: { shareToken: true },
    });
    if (!study) return notFound("Study not found");
    if (!study.shareToken) return notFound("No active share token");
    const out: ShareResponse = {
      token: study.shareToken.token,
      url: shareUrlFor(study.shareToken.token),
      viewCount: study.shareToken.viewCount,
      lastAccessedAt: study.shareToken.lastAccessedAt?.toISOString() ?? null,
      createdAt: study.shareToken.createdAt.toISOString(),
      updatedAt: study.shareToken.updatedAt.toISOString(),
    };
    return Response.json(out);
  } catch (err) {
    console.error("GET /api/studies/[id]/share failed", err);
    return serverError();
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;
  const { id } = await ctx.params;

  let rotate = false;
  try {
    const body = (await req.json().catch(() => ({}))) as { rotate?: boolean };
    rotate = body?.rotate === true;
  } catch {
    // Empty body is fine — default is "create if missing, return existing".
  }

  try {
    const study = await prisma.study.findFirst({
      where: { id, userId: session!.user.id },
      include: { shareToken: true, result: { select: { studyId: true } } },
    });
    if (!study) return notFound("Study not found");
    if (study.status !== "COMPLETED" || !study.result) {
      return badRequest("Only COMPLETED studies with a result can be shared");
    }

    // Idempotent: return existing token unless rotation was explicitly asked.
    if (study.shareToken && !rotate) {
      const out: ShareResponse = {
        token: study.shareToken.token,
        url: shareUrlFor(study.shareToken.token),
        viewCount: study.shareToken.viewCount,
        lastAccessedAt: study.shareToken.lastAccessedAt?.toISOString() ?? null,
        createdAt: study.shareToken.createdAt.toISOString(),
        updatedAt: study.shareToken.updatedAt.toISOString(),
      };
      return Response.json(out);
    }

    const token = newToken();
    const upserted = await prisma.studyShareToken.upsert({
      where: { studyId: study.id },
      create: {
        studyId: study.id,
        userId: session!.user.id,
        token,
      },
      update: {
        // Rotation: reset everything except createdAt.
        token,
        viewCount: 0,
        lastAccessedAt: null,
      },
    });
    const out: ShareResponse = {
      token: upserted.token,
      url: shareUrlFor(upserted.token),
      viewCount: upserted.viewCount,
      lastAccessedAt: upserted.lastAccessedAt?.toISOString() ?? null,
      createdAt: upserted.createdAt.toISOString(),
      updatedAt: upserted.updatedAt.toISOString(),
    };
    return Response.json(out, { status: 201 });
  } catch (err) {
    console.error("POST /api/studies/[id]/share failed", err);
    return serverError();
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;
  const { id } = await ctx.params;

  try {
    const study = await prisma.study.findFirst({
      where: { id, userId: session!.user.id },
      include: { shareToken: { select: { id: true } } },
    });
    if (!study) return notFound("Study not found");
    if (!study.shareToken) {
      // Idempotent — already gone.
      return Response.json({ ok: true, alreadyRevoked: true });
    }
    await prisma.studyShareToken.delete({
      where: { studyId: study.id },
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/studies/[id]/share failed", err);
    return serverError();
  }
}
