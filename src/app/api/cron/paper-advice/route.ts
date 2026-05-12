// Phase 12: monthly scheduler endpoint.
//
// Called by an external cron (server crontab → curl) once a month around
// the 1st. Iterates all active PaperPortfolios, recomputes the source
// study's current advice, diffs against the held tickers, writes a
// PaperRebalanceAdvice row (idempotent per (portfolio, month)), and
// fires a single Telegram digest covering everything that changed.
//
// Auth: requires `X-Cron-Secret: <CRON_SECRET>` header. Without the env
// the endpoint refuses to run — a missing secret in prod is a config
// error, not an excuse to drop auth.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Study, PaperPortfolio } from "@prisma/client";
import { computeCurrentAdvice, isRebalanceMonth } from "@/lib/paper/scheduler";
import { diffTickerSets, tickerSetsEqual } from "@/lib/paper/adviceDiff";
import type { PortfolioHolding } from "@/lib/paper/valuation";
import {
  formatAdviceMessage,
  formatDigest,
  isTelegramEnabled,
  sendTelegram,
} from "@/lib/notify/telegram";

interface ProcessReport {
  portfolioId: string;
  portfolioTitle: string;
  status:
    | "wrote"
    | "duplicate"
    | "skipped-no-change"
    | "skipped-no-study"
    | "skipped-off-cadence"
    | "error";
  asOfMonth?: string;
  added?: string[];
  removed?: string[];
  unchangedCount?: number;
  message?: string;
}

interface RouteBody {
  // Optional: limit processing to a single portfolio (for manual re-runs).
  portfolioId?: string;
  // Optional override for the suggested-month label. Defaults to whatever
  // computeCurrentAdvice resolves (the latest fully-closed month). Useful
  // when testing — never set in prod.
  forceMonth?: string;
}

async function processPortfolio(
  portfolio: PaperPortfolio,
  study: Study | null,
  forceMonth: string | undefined,
): Promise<ProcessReport> {
  const base = { portfolioId: portfolio.id, portfolioTitle: portfolio.title };
  if (!study) {
    return {
      ...base,
      status: "skipped-no-study",
      message: "Source study deleted or inaccessible",
    };
  }
  try {
    const advice = await computeCurrentAdvice({
      id: study.id,
      factorMix: study.factorMix,
      rebalance: study.rebalance,
    });
    if (!advice) {
      return {
        ...base,
        status: "error",
        message: "No factor data resolved at any month — check price feed",
      };
    }

    const suggestedMonth = forceMonth ?? advice.asOfMonth;

    // Honor the source study's rebalance cadence. A quarterly-rebalance study
    // should only generate advice every 3 months relative to the portfolio's
    // anchor (sourceRebalanceDate). Monthly studies pass the gate trivially
    // (cadence=1 → every month qualifies). forceMonth bypasses cadence — it's
    // a manual trigger, the caller knows what they're asking for.
    if (
      !forceMonth &&
      !isRebalanceMonth(
        study.rebalance,
        portfolio.sourceRebalanceDate,
        suggestedMonth,
      )
    ) {
      return {
        ...base,
        status: "skipped-off-cadence",
        asOfMonth: suggestedMonth,
        message: `Study cadence ${study.rebalance} — next rebalance is not this month`,
      };
    }

    const holdings = (portfolio.holdings as unknown as PortfolioHolding[]) ?? [];
    const currentTickers = holdings.map((h) => h.ticker);

    if (tickerSetsEqual(currentTickers, advice.tickers)) {
      // Don't write a row when there's no diff — the dashboard would just
      // get noise. We still emit a "no-change" report so the cron run log
      // captures that we evaluated this portfolio.
      return {
        ...base,
        status: "skipped-no-change",
        asOfMonth: suggestedMonth,
      };
    }
    const diff = diffTickerSets(currentTickers, advice.tickers);

    // Upsert: at most one advice per (portfolioId, suggestedMonth). When
    // the cron runs twice in a month, the second call leaves the row as
    // it was (we don't overwrite a status that may already be confirmed/skipped).
    const existing = await prisma.paperRebalanceAdvice.findUnique({
      where: {
        paperPortfolioId_suggestedMonth: {
          paperPortfolioId: portfolio.id,
          suggestedMonth,
        },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      return {
        ...base,
        status: "duplicate",
        asOfMonth: suggestedMonth,
        message: `Already have ${existing.status} advice for ${suggestedMonth}`,
      };
    }

    await prisma.paperRebalanceAdvice.create({
      data: {
        userId: portfolio.userId,
        paperPortfolioId: portfolio.id,
        suggestedMonth,
        suggestedTickers: advice.tickers,
        currentTickers: [...new Set(currentTickers)].sort(),
        addedTickers: diff.added,
        removedTickers: diff.removed,
        avgScore: advice.avgScore ?? null,
        reason: forceMonth ? "manual trigger" : "monthly cadence",
      },
    });

    return {
      ...base,
      status: "wrote",
      asOfMonth: suggestedMonth,
      added: diff.added,
      removed: diff.removed,
      unchangedCount: diff.unchanged.length,
    };
  } catch (err) {
    return {
      ...base,
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function POST(req: NextRequest) {
  // ----- Auth -----
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 503 },
    );
  }
  const supplied = req.headers.get("x-cron-secret")?.trim();
  if (supplied !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: RouteBody = {};
  try {
    body = (await req.json().catch(() => ({}))) as RouteBody;
  } catch {
    body = {};
  }

  // ----- Load portfolios + their source studies -----
  const portfolios = await prisma.paperPortfolio.findMany({
    where: {
      archived: false,
      ...(body.portfolioId ? { id: body.portfolioId } : {}),
    },
  });
  const studyIds = [...new Set(portfolios.map((p) => p.sourceStudyId))];
  const studies = studyIds.length
    ? await prisma.study.findMany({ where: { id: { in: studyIds } } })
    : [];
  const studyById = new Map(studies.map((s) => [s.id, s]));

  // ----- Process sequentially -----
  // Sequential keeps SEC + Yahoo fetch traffic mild; serial wall-clock for
  // 1-10 portfolios is well under the cron's monthly cadence.
  const reports: ProcessReport[] = [];
  for (const p of portfolios) {
    const study = studyById.get(p.sourceStudyId) ?? null;
    reports.push(await processPortfolio(p, study, body.forceMonth));
  }

  // ----- Telegram digest -----
  const writtenReports = reports.filter((r) => r.status === "wrote");
  let notification: { sent: boolean; reason?: string; error?: string } = {
    sent: false,
    reason: "no-changes",
  };
  if (writtenReports.length > 0 && isTelegramEnabled()) {
    const appUrlBase = (process.env.APP_URL ?? "https://aiquant.org").replace(
      /\/$/,
      "",
    );
    const messages = writtenReports.map((r) =>
      formatAdviceMessage({
        portfolioTitle: r.portfolioTitle,
        suggestedMonth: r.asOfMonth!,
        added: r.added ?? [],
        removed: r.removed ?? [],
        unchangedCount: r.unchangedCount ?? 0,
        appUrl: `${appUrlBase}/paper`,
      }),
    );
    const text = formatDigest(messages);
    const result = await sendTelegram(text);
    notification = result.sent
      ? { sent: true }
      : { sent: false, reason: result.reason, error: result.error };
    // Audit-trail: mark notifiedAt on the rows we just wrote IF the push
    // succeeded. (If Telegram returns 4xx, leave notifiedAt null so the
    // UI badge still shows pending.)
    //
    // Use per-row updates (not a single updateMany with two `in` clauses)
    // because the latter forms a cartesian product across portfolios × months
    // and could mark stale rows from prior runs whose (portfolio, month) just
    // happens to be in the cross-product set. The unique constraint
    // (paperPortfolioId, suggestedMonth) makes each update target exactly
    // one row.
    if (result.sent) {
      const now = new Date();
      await prisma.$transaction(
        writtenReports.map((r) =>
          prisma.paperRebalanceAdvice.update({
            where: {
              paperPortfolioId_suggestedMonth: {
                paperPortfolioId: r.portfolioId,
                suggestedMonth: r.asOfMonth!,
              },
            },
            data: { notifiedAt: now },
          }),
        ),
      );
    }
  }

  return NextResponse.json({
    portfolios: portfolios.length,
    reports,
    notification,
  });
}

// GET: cheap dry-run for debugging / monitoring. Returns the same auth
// check but doesn't mutate anything — just shows which portfolios *would*
// be processed and surface basic config status.
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  const supplied = req.headers.get("x-cron-secret")?.trim();
  if (supplied !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const count = await prisma.paperPortfolio.count({ where: { archived: false } });
  return NextResponse.json({
    activePortfolios: count,
    telegramEnabled: isTelegramEnabled(),
  });
}
