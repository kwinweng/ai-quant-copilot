// Prisma CLI seed entry. Run with `npx prisma db seed`.
//
// Iterates every existing User and creates the demo study set for any user
// that has zero studies. Safe to re-run.
//
// New users are seeded automatically via NextAuth `events.createUser` →
// `src/lib/seedDemo.ts`. This script exists for backfilling existing users
// or seeding manually.

import { PrismaClient, type Prisma } from "@prisma/client";
import { DEMO_STUDIES, type DemoStudyDefinition } from "./seed-data";

const prisma = new PrismaClient();

async function seedFor(userId: string) {
  const existing = await prisma.study.count({ where: { userId } });
  if (existing > 0) return 0;

  for (const def of DEMO_STUDIES) {
    await createDemoStudy(userId, def);
  }
  return DEMO_STUDIES.length;
}

async function createDemoStudy(userId: string, def: DemoStudyDefinition) {
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

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  if (users.length === 0) {
    console.log("[seed] no users in DB — nothing to seed.");
    return;
  }
  for (const user of users) {
    const created = await seedFor(user.id);
    if (created === 0) {
      console.log(`[seed] ${user.email ?? user.id} already has studies, skipped.`);
    } else {
      console.log(`[seed] created ${created} demo studies for ${user.email ?? user.id}.`);
    }
  }
}

main()
  .catch((e) => {
    console.error("[seed] failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
