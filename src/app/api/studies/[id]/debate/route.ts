// Phase 13 — POST/GET/DELETE /api/studies/[id]/debate
//
// POST   : run a fresh multi-agent debate, stream SSE events. Idempotent for
//          re-runs (the caller can explicitly force=true to bypass cache).
// GET    : return the cached debate JSON if present, else 404.
// DELETE : clear cached debate so user can regenerate without billing.

import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireUser,
  badRequest,
  notFound,
  serverError,
  tooManyRequests,
} from "@/lib/api";
import {
  assertUsageQuota,
  incrementUsage,
  describeAiError,
  isBillableError,
} from "@/lib/ai";
import { runDebate, type DebateEvent, type DebateResult } from "@/lib/ai/debate";

type Ctx = { params: Promise<{ id: string }> };

function sseFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;
  const { id } = await ctx.params;

  try {
    const study = await prisma.study.findFirst({
      where: { id, userId: session!.user.id },
      include: { result: { select: { aiDebate: true } } },
    });
    if (!study) return notFound("Study not found");
    if (!study.result?.aiDebate) return notFound("No debate cached");
    return Response.json({ debate: study.result.aiDebate });
  } catch (err) {
    console.error("GET /api/studies/[id]/debate failed", err);
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
      select: { id: true, result: { select: { studyId: true } } },
    });
    if (!study) return notFound("Study not found");
    if (!study.result) return notFound("No result for study");
    await prisma.studyResult.update({
      where: { studyId: id },
      data: { aiDebate: Prisma.DbNull },
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/studies/[id]/debate failed", err);
    return serverError();
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;
  const { id } = await ctx.params;

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  let study;
  try {
    study = await prisma.study.findFirst({
      where: { id, userId: session!.user.id },
      include: { result: true },
    });
  } catch (err) {
    console.error("POST /api/studies/[id]/debate prefetch failed", err);
    return serverError();
  }
  if (!study) return notFound("Study not found");
  if (!study.result) {
    return badRequest("Study has no completed result; finish the backtest first");
  }
  if (study.status !== "COMPLETED") {
    return badRequest("Study must be COMPLETED to generate debate");
  }

  // Cache hit shortcut: stream the cached transcript as a synthetic SSE so the
  // client UI can stay on a single render path.
  if (!force && study.result.aiDebate) {
    return streamCachedDebate(study.result.aiDebate);
  }

  const quota = await assertUsageQuota(session!.user.id, "debate");
  if (quota) {
    return tooManyRequests("投研讨论今日次数已用尽，请明天再试", quota);
  }

  const encoder = new TextEncoder();
  let succeeded = false;
  let failureBillable = false;
  const userIdForBill = session!.user.id;
  const studyIdForCache = study.id;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const gen = runDebate({
          study: {
            title: study!.title,
            hypothesis: study!.hypothesis,
            universe: study!.universe,
            benchmark: study!.benchmark,
            rebalance: study!.rebalance,
            startDate: study!.startDate,
            endDate: study!.endDate,
            factorMix: study!.factorMix,
            costModel: study!.costModel,
          },
          result: {
            metrics: study!.result!.metrics,
            equityCurve: study!.result!.equityCurve,
            drawdown: study!.result!.drawdown,
            annualReturns: study!.result!.annualReturns,
            factorDiagnostics: study!.result!.factorDiagnostics,
            monthlyReturns: study!.result!.monthlyReturns,
            rebalanceHistory: study!.result!.rebalanceHistory,
            dataQuality: study!.result!.dataQuality,
            parameterSensitivity: study!.result!.parameterSensitivity,
            factorCoverage: study!.result!.factorCoverage,
            factorBreakdown: study!.result!.factorBreakdown,
            robustness: study!.result!.robustness,
            benchmarkAttribution: study!.result!.benchmarkAttribution,
          },
        });
        let finalResult: DebateResult | null = null;
        while (true) {
          const next = await gen.next();
          if (next.done) {
            finalResult = next.value;
            break;
          }
          const event: DebateEvent = next.value;
          controller.enqueue(encoder.encode(sseFrame(event)));
        }
        // Persist the full debate to DB so subsequent GETs return cached.
        if (finalResult) {
          try {
            await prisma.studyResult.update({
              where: { studyId: studyIdForCache },
              data: {
                aiDebate: finalResult as unknown as Prisma.InputJsonValue,
              },
            });
          } catch (err) {
            console.warn("[debate] cache persist failed:", err);
          }
        }
        succeeded = true;
      } catch (err) {
        console.error("[debate] orchestration failed:", err);
        failureBillable = isBillableError(err);
        controller.enqueue(
          encoder.encode(
            sseFrame({ type: "error", message: describeAiError(err) }),
          ),
        );
        controller.enqueue(
          encoder.encode(sseFrame({ type: "done", failed: true })),
        );
      } finally {
        controller.close();
        if (succeeded || failureBillable) {
          try {
            await incrementUsage(userIdForBill, "debate");
          } catch (err) {
            console.warn("[debate] increment usage failed:", err);
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function streamCachedDebate(cached: unknown): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      try {
        const data = cached as {
          transcript?: Array<{ turn: number; role: string; content: string }>;
          verdict?: unknown;
        };
        if (Array.isArray(data?.transcript)) {
          for (const entry of data.transcript) {
            controller.enqueue(
              encoder.encode(
                sseFrame({
                  type: "turn-end",
                  turn: entry.turn,
                  role: entry.role,
                  content: entry.content,
                  cached: true,
                }),
              ),
            );
          }
        }
        if (data?.verdict && typeof data.verdict === "object") {
          controller.enqueue(
            encoder.encode(
              sseFrame({ type: "verdict", cached: true, ...data.verdict }),
            ),
          );
        }
        controller.enqueue(encoder.encode(sseFrame({ type: "done", cached: true })));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export const runtime = "nodejs";
