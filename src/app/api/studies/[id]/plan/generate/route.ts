import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireUser,
  notFound,
  serverError,
  tooManyRequests,
} from "@/lib/api";
import {
  streamStudyPlan,
  parseStudyPlan,
  assertUsageQuota,
  incrementUsage,
} from "@/lib/ai";

type Ctx = { params: Promise<{ id: string }> };

// SSE frame helper. Each event is `data: <json>\n\n`. We use a single named
// channel and put { type, ... } inside the JSON payload so the client only
// needs one onmessage handler.
function sseFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  const study = await prisma.study.findFirst({
    where: { id, userId: session!.user.id },
    select: {
      id: true,
      hypothesis: true,
      market: true,
      universe: true,
      startDate: true,
      endDate: true,
      rebalance: true,
      benchmark: true,
      txCostBps: true,
    },
  });
  if (!study) return notFound("Study not found");

  const quota = await assertUsageQuota(session!.user.id, "plan");
  if (quota) {
    return tooManyRequests(
      `今日 AI 计划生成已达上限（${quota.used}/${quota.limit}）`,
      quota,
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let full = "";
      try {
        for await (const chunk of streamStudyPlan(study)) {
          full += chunk;
          controller.enqueue(
            encoder.encode(sseFrame({ type: "delta", text: chunk })),
          );
        }

        const parsed = parseStudyPlan(full);
        const plan = await prisma.studyPlan.upsert({
          where: { studyId: id },
          create: { studyId: id, ...parsed },
          update: parsed,
        });
        await prisma.study.update({
          where: { id },
          data: { status: "PLANNED" },
        });
        // Only count successful generations against the quota — keeps the user
        // from being penalized for transient API failures.
        await incrementUsage(session!.user.id, "plan");

        controller.enqueue(
          encoder.encode(sseFrame({ type: "done", plan })),
        );
      } catch (err) {
        console.error("POST /api/studies/[id]/plan/generate failed", err);
        const message =
          err instanceof Error ? err.message : "AI 计划生成失败";
        controller.enqueue(
          encoder.encode(sseFrame({ type: "error", message })),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// Wrap the original handler so unexpected init errors (e.g., missing
// ANTHROPIC_API_KEY thrown by the SDK before the stream opens) still return a
// JSON 500 instead of a hung connection.
export async function GET() {
  return serverError("Use POST");
}
