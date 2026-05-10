import type { NextRequest } from "next/server";
import {
  requireUser,
  badRequest,
  serverError,
  tooManyRequests,
} from "@/lib/api";
import {
  streamCoachTurn,
  assertUsageQuota,
  incrementUsage,
  describeAiError,
  isBillableError,
} from "@/lib/ai";

// One coach turn = one SSE round trip. The client owns the conversation
// history and posts the entire array up front each call. We don't persist
// dialogue to the DB — sessions are ephemeral and kept in client memory.

interface CoachTurnBody {
  history?: { role: "user" | "assistant"; content: string }[];
}

function sseFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireUser();
  if (response) return response;

  let body: CoachTurnBody;
  try {
    body = (await req.json()) as CoachTurnBody;
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!Array.isArray(body.history) || body.history.length === 0) {
    return badRequest("history must be a non-empty array");
  }
  // Sanity-check shape and cap turn count to keep prompt size bounded.
  if (body.history.length > 30) {
    return badRequest("history is too long (max 30 turns)");
  }
  for (const m of body.history) {
    if (
      !m ||
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string"
    ) {
      return badRequest("history entries must be { role, content: string }");
    }
    if (m.content.length > 4000) {
      return badRequest("history entry content too long (max 4000 chars)");
    }
  }
  // Last message must be from the user — that's what we're responding to.
  const last = body.history[body.history.length - 1];
  if (last.role !== "user") {
    return badRequest("last history entry must be from the user");
  }

  const quota = await assertUsageQuota(session!.user.id, "coach");
  if (quota) {
    return tooManyRequests("AI 教练今日调用已用尽，请明天再试", quota);
  }

  const encoder = new TextEncoder();
  let succeeded = false;
  let failureBillable = false;
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of streamCoachTurn(body.history!)) {
          controller.enqueue(
            encoder.encode(sseFrame({ type: "delta", delta })),
          );
        }
        controller.enqueue(encoder.encode(sseFrame({ type: "done" })));
        succeeded = true;
      } catch (err) {
        console.error("[coach] streamCoachTurn failed:", err);
        failureBillable = isBillableError(err);
        controller.enqueue(
          encoder.encode(
            sseFrame({ type: "error", message: describeAiError(err) }),
          ),
        );
        // Sprint #2 H5 — also send done so EventSource client can close.
        controller.enqueue(encoder.encode(sseFrame({ type: "done", failed: true })));
      } finally {
        controller.close();
        // Sprint #5 H6: charge on success OR on transient (billable) failure.
        if (succeeded || failureBillable) {
          try {
            await incrementUsage(session!.user.id, "coach");
          } catch (err) {
            console.warn("[coach] increment usage failed:", err);
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

export async function GET() {
  // The browser's EventSource is GET-only; our client uses fetch+ReadableStream
  // with POST, so we don't need a GET handler. Reject explicitly.
  return new Response("Method not allowed", { status: 405 });
}

export const runtime = "nodejs";
