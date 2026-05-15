// Phase 16 — Public, read-only view of a shared study.
//
// Token-gated (the token IS the credential — no session). Render is SSR
// so OG cards / search engine bots see real metadata. We bump viewCount
// on every render (await is cheap; ~10ms on local Postgres) so the
// share modal can show "this link has been opened N times".

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles, AlertTriangle, ExternalLink, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  PublicEquityChart,
  PublicDrawdownChart,
} from "@/components/share/PublicCharts";

type Ctx = { params: Promise<{ token: string }> };

interface ResultShape {
  metrics?: {
    strategy?: Record<string, number | null>;
    spy?: Record<string, number | null>;
  };
  equityCurve?: Array<{ date: string; strategy: number; spy: number }>;
  drawdown?: Array<{ date: string; strategy: number; spy: number }>;
  annualReturns?: Array<{ year: string; strategy: number; spy: number }>;
  conclusion?: string;
  aiExplanation?: string[];
  aiDebate?: {
    transcript?: Array<{ turn: number; role: string; content: string }>;
    verdict?: {
      bullProbability?: number;
      verdict?: string;
      summary?: string;
      nextSteps?: string[];
    };
  };
  rebalanceHistory?: Array<{
    date: string;
    holdings: string[];
    turnover?: number;
  }>;
  dataQuality?: Record<string, unknown>;
}

async function fetchSharedStudy(token: string) {
  const share = await prisma.studyShareToken.findUnique({
    where: { token },
    include: {
      study: {
        include: { result: true },
      },
    },
  });
  return share;
}

export async function generateMetadata({ params }: Ctx): Promise<Metadata> {
  const { token } = await params;
  const share = await fetchSharedStudy(token);
  if (!share) {
    return {
      title: "找不到此研究 · AI Quant Copilot",
      robots: { index: false, follow: false },
    };
  }
  const description = share.study.hypothesis.slice(0, 160);
  return {
    title: `${share.study.title} · AI Quant Copilot`,
    description,
    // Public share pages are not indexed — link sharing only.
    robots: { index: false, follow: false },
    openGraph: {
      title: share.study.title,
      description,
      type: "article",
      siteName: "AI Quant Copilot",
    },
    twitter: {
      card: "summary_large_image",
      title: share.study.title,
      description,
    },
  };
}

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export default async function SharedStudyPage({ params }: Ctx) {
  const { token } = await params;
  const share = await fetchSharedStudy(token);
  if (!share) notFound();
  if (share.study.status !== "COMPLETED" || !share.study.result) notFound();

  // Bump viewCount synchronously. ~10ms, predictable, no floating Promise.
  // Note: bots will inflate this count somewhat; that's fine for an MVP.
  await prisma.studyShareToken.update({
    where: { id: share.id },
    data: {
      viewCount: { increment: 1 },
      lastAccessedAt: new Date(),
    },
  });

  const study = share.study;
  const result = study.result as unknown as ResultShape;
  const metrics = result.metrics ?? {};
  const strategy = metrics.strategy ?? {};
  const bench = metrics.spy ?? {};
  const equityCurve = result.equityCurve ?? [];
  const drawdown = result.drawdown ?? [];
  const aiDebate = result.aiDebate;
  const verdict = aiDebate?.verdict;

  const startDate = new Date(study.startDate).toISOString().slice(0, 10);
  const endDate = new Date(study.endDate).toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:opacity-80"
          >
            <Sparkles className="h-4 w-4" />
            AI Quant Copilot
          </Link>
          <Link
            href="/studies/coach"
            className="text-xs sm:text-sm text-blue-600 hover:underline inline-flex items-center gap-1 font-medium"
          >
            <span className="hidden sm:inline">创建你自己的研究</span>
            <span className="sm:hidden">创建研究</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Title + hypothesis card */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-medium uppercase tracking-wider">
              <TrendingUp className="h-3 w-3" />
              量化研究报告
            </span>
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mt-2">
              {study.title}
            </h1>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border-l-2 border-blue-200 pl-3">
            {study.hypothesis}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
            <Meta label="股票池" value={study.universe} />
            <Meta label="回测窗口" value={`${startDate} → ${endDate}`} />
            <Meta label="再平衡" value={study.rebalance} />
            <Meta label="基准" value={study.benchmark} />
          </div>
        </div>

        {/* Key metrics */}
        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">关键指标</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  <th className="py-2 px-4 text-xs text-gray-500 text-left font-medium">指标</th>
                  <th className="py-2 px-4 text-xs text-gray-700 text-right font-medium">策略</th>
                  <th className="py-2 px-4 text-xs text-gray-500 text-right font-medium">基准</th>
                </tr>
              </thead>
              <tbody>
                <MetricRow label="CAGR" strategy={fmtPct(strategy.cagr)} bench={fmtPct(bench.cagr)} better={cmp(strategy.cagr, bench.cagr, "high")} />
                <MetricRow label="Sharpe" strategy={fmtNum(strategy.sharpe)} bench={fmtNum(bench.sharpe)} better={cmp(strategy.sharpe, bench.sharpe, "high")} />
                <MetricRow label="Max Drawdown" strategy={fmtPct(strategy.maxDrawdown)} bench={fmtPct(bench.maxDrawdown)} better={cmp(strategy.maxDrawdown, bench.maxDrawdown, "low")} />
                <MetricRow label="Calmar" strategy={fmtNum(strategy.calmar)} bench={fmtNum(bench.calmar)} better={cmp(strategy.calmar, bench.calmar, "high")} />
                <MetricRow label="年化波动率" strategy={fmtPct(strategy.annualVol)} bench={fmtPct(bench.annualVol)} better={false} />
                <MetricRow label="Alpha (年化)" strategy={fmtPct(strategy.alpha)} bench={fmtPct(bench.alpha)} better={cmp(strategy.alpha, bench.alpha, "high")} />
                <MetricRow label="Information Ratio" strategy={fmtNum(strategy.informationRatio)} bench={fmtNum(bench.informationRatio)} better={false} />
                <MetricRow label="月度胜率" strategy={fmtPct(strategy.winRate)} bench={fmtPct(bench.winRate)} better={cmp(strategy.winRate, bench.winRate, "high")} />
              </tbody>
            </table>
          </div>
        </section>

        {/* Charts */}
        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">累计收益（基准化为 100）</h2>
          </div>
          <div className="px-4 py-3">
            <PublicEquityChart data={equityCurve} height={300} />
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">回撤曲线（%）</h2>
          </div>
          <div className="px-4 py-3">
            <PublicDrawdownChart data={drawdown} height={220} />
          </div>
        </section>

        {/* AI conclusion */}
        {(result.conclusion || (result.aiExplanation?.length ?? 0) > 0) && (
          <section className="bg-white border border-purple-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-purple-50 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <h2 className="text-sm font-semibold text-purple-700">AI 结论</h2>
            </div>
            <div className="px-4 py-3 space-y-2">
              {result.conclusion && (
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {result.conclusion}
                </p>
              )}
              {(result.aiExplanation?.length ?? 0) > 0 && (
                <ul className="space-y-1.5 mt-2">
                  {result.aiExplanation!.map((p, i) => (
                    <li key={i} className="text-sm text-gray-700 flex gap-2 leading-relaxed">
                      <span className="text-purple-400 font-mono text-xs mt-0.5">{i + 1}.</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* AI debate (if generated) */}
        {aiDebate && Array.isArray(aiDebate.transcript) && aiDebate.transcript.length > 0 && (
          <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <h2 className="text-sm font-semibold text-gray-900">投研讨论</h2>
              <span className="text-xs text-gray-500">三 agent 多方辩论</span>
            </div>
            <div className="px-4 py-3 space-y-3">
              {aiDebate.transcript!.map((entry) => (
                <DebateRow key={entry.turn} role={entry.role} content={entry.content} />
              ))}
              {verdict && (
                <div className="border border-purple-300 rounded-lg overflow-hidden bg-gradient-to-br from-purple-50 to-white mt-3">
                  <div className="px-4 py-2 bg-purple-100">
                    <span className="text-sm font-semibold text-purple-700">
                      Quinn 的最终判断 · 多头胜率 {verdict.bullProbability}%
                    </span>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <p className="text-sm text-gray-800 leading-relaxed">{stripRefs(verdict.summary ?? "")}</p>
                    {(verdict.nextSteps?.length ?? 0) > 0 && (
                      <ul className="space-y-1">
                        {verdict.nextSteps!.map((s, i) => (
                          <li key={i} className="text-sm text-gray-700 flex gap-2">
                            <span className="text-purple-400 font-mono text-xs mt-0.5">{i + 1}.</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Holdings */}
        {(result.rebalanceHistory?.length ?? 0) > 0 && (
          <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">最新持仓</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {result.rebalanceHistory![result.rebalanceHistory!.length - 1].date} 调仓后的持仓
              </p>
            </div>
            <div className="px-4 py-3">
              <div className="flex flex-wrap gap-1.5">
                {result.rebalanceHistory![result.rebalanceHistory!.length - 1].holdings.map((h) => (
                  <span
                    key={h}
                    className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-mono rounded border border-blue-100"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Disclaimer + CTA */}
        <section className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-900 leading-relaxed">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p>
                <span className="font-semibold">免责声明：</span>
                本研究结果仅供研究和教育用途，不构成任何投资建议。回测结果不代表未来表现。
              </p>
              <p>
                数据源：Yahoo Finance（月度调整收盘价）+ SEC EDGAR（历史 10-K filings）。当前股票池为静态 60 只大市值美股，**存在幸存者偏差**——不重建历史指数成分股。
              </p>
            </div>
          </div>
        </section>

        <footer className="text-center py-6 space-y-2">
          <p className="text-sm text-gray-600">
            想自己也跑一份这样的研究？
          </p>
          <Link
            href="/studies/coach"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Sparkles className="h-4 w-4" />
            开始 AI 教练对话
          </Link>
          <p className="text-[11px] text-gray-400 pt-3">
            由{" "}
            <Link href="/" className="text-blue-600 hover:underline">
              AI Quant Copilot
            </Link>{" "}
            生成 · 个人量化研究副驾驶
          </p>
        </footer>
      </main>
    </div>
  );
}

// ---- Small helpers (inline as server-component-safe primitives) ----

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-gray-500">{label}</p>
      <p className="text-gray-900 font-medium truncate">{value}</p>
    </div>
  );
}

function MetricRow({
  label,
  strategy,
  bench,
  better,
}: {
  label: string;
  strategy: string;
  bench: string;
  better: boolean;
}) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-2 px-4 text-sm text-gray-500">{label}</td>
      <td className={`py-2 px-4 text-sm font-semibold text-right ${better ? "text-green-600" : "text-gray-900"}`}>
        {strategy}
      </td>
      <td className="py-2 px-4 text-sm text-gray-500 text-right">{bench}</td>
    </tr>
  );
}

function cmp(
  a: number | null | undefined,
  b: number | null | undefined,
  goal: "high" | "low",
): boolean {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  return goal === "high" ? a > b : a < b;
}

function DebateRow({ role, content }: { role: string; content: string }) {
  const style =
    role === "regan"
      ? { name: "Regan", title: "多头分析师", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" }
      : role === "jayzee"
        ? { name: "Jayzee", title: "风险官", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" }
        : { name: "Quinn", title: "量化主管", color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" };
  return (
    <div className={`border ${style.border} rounded-lg overflow-hidden bg-white`}>
      <div className={`px-3 py-1.5 ${style.bg} flex items-center gap-2`}>
        <span className={`text-xs font-semibold ${style.color}`}>{style.name}</span>
        <span className="text-[11px] text-gray-500">{style.title}</span>
      </div>
      <p className="px-3 py-2 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
        {stripRefs(content)}
      </p>
    </div>
  );
}

// Strip `[ref: token]` citation tags from agent text on the public page —
// internal users see them as visual references back to charts, but public
// readers without click targets just see noise.
function stripRefs(s: string): string {
  return s.replace(/\[ref:\s*[^\]]+\]/g, "").replace(/\s{2,}/g, " ").trim();
}

// Public pages must never serve a stale cached HTML — token revoke needs
// to take effect immediately.
export const dynamic = "force-dynamic";
