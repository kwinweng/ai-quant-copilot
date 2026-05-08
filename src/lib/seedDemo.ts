// Runtime helper: seed demo studies for a freshly created user.
// Wired into NextAuth `events.createUser` so the user lands on a populated
// dashboard immediately after their first GitHub login.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEMO_STUDIES, type DemoStudyDefinition } from "../../prisma/seed-data";

export async function seedDemoStudiesForUser(userId: string) {
  const existing = await prisma.study.count({ where: { userId } });
  if (existing > 0) return { skipped: true, created: 0 };

  for (const def of DEMO_STUDIES) {
    await insertDemo(userId, def);
  }
  return { skipped: false, created: DEMO_STUDIES.length };
}

async function insertDemo(userId: string, def: DemoStudyDefinition) {
  const study = await prisma.study.create({
    data: {
      userId,
      title: def.title,
      hypothesis: def.hypothesis,
      market: def.market,
      universe: def.universe,
      startDate: new Date(def.startDate),
      endDate: new Date(def.endDate),
      rebalance: def.rebalance,
      benchmark: def.benchmark,
      txCostBps: def.txCostBps,
      status: "COMPLETED",
    },
  });

  await prisma.studyPlan.create({
    data: {
      studyId: study.id,
      dataRequirements: def.plan.dataRequirements,
      factorDefs: def.plan.factorDefs,
      backtestRules: def.plan.backtestRules,
      riskChecks: def.plan.riskChecks,
      limitations: def.plan.limitations,
    },
  });

  await prisma.studyResult.create({
    data: {
      studyId: study.id,
      conclusion: def.conclusion,
      metrics: def.metrics as unknown as Prisma.InputJsonValue,
      equityCurve: def.equityCurve as unknown as Prisma.InputJsonValue,
      drawdown: def.drawdown as unknown as Prisma.InputJsonValue,
      annualReturns: def.annualReturns as unknown as Prisma.InputJsonValue,
      factorDiagnostics: def.factorDiagnostics as unknown as Prisma.InputJsonValue,
      aiExplanation: def.aiExplanation as unknown as Prisma.InputJsonValue,
    },
  });
}
