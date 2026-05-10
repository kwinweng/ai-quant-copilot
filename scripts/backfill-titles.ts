/**
 * Backfill concise titles for studies whose current title is just a slice
 * of the hypothesis (the old behavior of POST /api/studies).
 *
 * Run on the server:
 *   cd ~/ai-quant-copilot
 *   npx tsx scripts/backfill-titles.ts            # dry-run
 *   npx tsx scripts/backfill-titles.ts --apply    # actually write
 *
 * Idempotent: studies whose title already differs from the hypothesis
 * prefix are left alone, so running this multiple times is safe.
 */

import { prisma } from "@/lib/prisma";
import { generateStudyTitle } from "@/lib/ai";

const APPLY = process.argv.includes("--apply");

function looksLikeHypothesisSlice(title: string, hypothesis: string): boolean {
  // Heuristic: title is a literal prefix of hypothesis (the old behavior),
  // or title length suggests it was sliced (>40 chars). We deliberately
  // treat anything ≤ 24 chars NOT-prefix-of-hypothesis as a real title.
  const titleTrim = title.trim();
  const hypoTrim = hypothesis.trim();
  if (titleTrim.length >= 40) return true;
  if (hypoTrim.startsWith(titleTrim) && titleTrim.length >= 30) return true;
  return false;
}

async function main() {
  const studies = await prisma.study.findMany({
    select: { id: true, title: true, hypothesis: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Inspecting ${studies.length} studies…`);

  let processed = 0;
  let skipped = 0;
  let updated = 0;
  for (const s of studies) {
    processed++;
    if (!looksLikeHypothesisSlice(s.title, s.hypothesis)) {
      skipped++;
      console.log(
        `  [skip] ${s.id} — current title looks intentional: "${s.title.slice(0, 40)}…"`,
      );
      continue;
    }
    let newTitle: string;
    try {
      newTitle = await generateStudyTitle(s.hypothesis);
    } catch (err) {
      console.warn(
        `  [error] ${s.id} — generateStudyTitle threw:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }
    if (newTitle === s.title.trim()) {
      skipped++;
      continue;
    }
    console.log(
      `  [${APPLY ? "apply" : "dry "}] ${s.id}\n      old: ${s.title.slice(0, 60)}…\n      new: ${newTitle}`,
    );
    if (APPLY) {
      await prisma.study.update({
        where: { id: s.id },
        data: { title: newTitle },
      });
      updated++;
    }
    // Be polite to DeepSeek — small spacing between calls.
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(
    `\nDone. processed=${processed} skipped=${skipped} ${
      APPLY ? `updated=${updated}` : "(dry-run, pass --apply to write)"
    }`,
  );
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
