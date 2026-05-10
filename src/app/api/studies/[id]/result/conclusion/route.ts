import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireUser,
  notFound,
  serverError,
  tooManyRequests,
  badRequest,
} from "@/lib/api";
import {
  generateStudyConclusion,
  assertUsageQuota,
  incrementUsage,
  describeAiError,
  isBillableError,
} from "@/lib/ai";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  const study = await prisma.study.findFirst({
    where: { id, userId: session!.user.id },
    select: {
      id: true,
      hypothesis: true,
      universe: true,
      benchmark: true,
      rebalance: true,
      startDate: true,
      endDate: true,
      result: {
        select: {
          metrics: true,
          factorDiagnostics: true,
          annualReturns: true,
        },
      },
    },
  });
  if (!study) return notFound("Study not found");
  if (!study.result) {
    return badRequest("研究尚无结果，无法生成结论");
  }

  const quota = await assertUsageQuota(session!.user.id, "conclusion");
  if (quota) {
    return tooManyRequests(
      `今日 AI 结论生成已达上限（${quota.used}/${quota.limit}）`,
      quota,
    );
  }

  try {
    const parsed = await generateStudyConclusion(
      {
        hypothesis: study.hypothesis,
        universe: study.universe,
        benchmark: study.benchmark,
        rebalance: study.rebalance,
        startDate: study.startDate,
        endDate: study.endDate,
      },
      {
        metrics: study.result.metrics,
        factorDiagnostics: study.result.factorDiagnostics,
        annualReturns: study.result.annualReturns,
      },
    );

    const updated = await prisma.studyResult.update({
      where: { studyId: id },
      data: {
        conclusion: parsed.conclusion || "AI 未返回结论。",
        aiExplanation: parsed.aiExplanation,
      },
      select: {
        conclusion: true,
        aiExplanation: true,
      },
    });
    await incrementUsage(session!.user.id, "conclusion");

    return NextResponse.json({ result: updated });
  } catch (err) {
    console.error("POST /api/studies/[id]/result/conclusion failed", err);
    // Sprint #5 H6: charge for transient failures so reluctance to retry
    // serves as a budget guardrail — config errors stay free.
    if (isBillableError(err)) {
      try {
        await incrementUsage(session!.user.id, "conclusion");
      } catch (billErr) {
        console.warn("[conclusion] retry-billing increment failed:", billErr);
      }
    }
    return serverError(describeAiError(err));
  }
}
