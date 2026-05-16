// Phase 6.5 — Hydrate UniverseSnapshot from the canonical seed JSON.
//
// Run on prod after applying the 20260516_phase_6_5_universe_snapshot
// migration:
//
//   npx tsx scripts/seed-sp500-history.ts
//
// Idempotent — upserts by composite PK (monthKey, indexName), so re-running
// after a refresh just overwrites changed months. Safe to run from cron.

import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const SEED_PATH = path.join(
  process.cwd(),
  "prisma",
  "seed-data",
  "sp500-history.json",
);

interface Snapshot {
  monthKey: string;
  indexName: string;
  tickers: string[];
}

const prisma = new PrismaClient();

async function main() {
  const raw = readFileSync(SEED_PATH, "utf8");
  const snapshots = JSON.parse(raw) as Snapshot[];

  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    throw new Error(`[seed-sp500] no snapshots loaded from ${SEED_PATH}`);
  }

  const startedAt = Date.now();
  let written = 0;
  let unchanged = 0;

  // Sequential — we're writing one row per month, batched would save a few
  // hundred ms but obscure failures. Run takes <10s end to end.
  for (const s of snapshots) {
    const existing = await prisma.universeSnapshot.findUnique({
      where: {
        monthKey_indexName: {
          monthKey: s.monthKey,
          indexName: s.indexName,
        },
      },
      select: { tickers: true },
    });

    const sameTickers =
      existing &&
      existing.tickers.length === s.tickers.length &&
      existing.tickers.every((t, i) => t === s.tickers[i]);

    if (sameTickers) {
      unchanged++;
      continue;
    }

    await prisma.universeSnapshot.upsert({
      where: {
        monthKey_indexName: {
          monthKey: s.monthKey,
          indexName: s.indexName,
        },
      },
      create: {
        monthKey: s.monthKey,
        indexName: s.indexName,
        tickers: s.tickers,
      },
      update: { tickers: s.tickers },
    });
    written++;
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[seed-sp500] ${snapshots.length} snapshots processed in ${elapsed}s ` +
      `(${written} written, ${unchanged} unchanged)`,
  );
}

main()
  .catch((e) => {
    console.error("[seed-sp500] failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
