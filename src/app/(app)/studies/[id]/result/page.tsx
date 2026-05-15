"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Download,
  Sparkles,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Copy,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  generateResultMarkdown,
  downloadMarkdown,
} from "@/lib/exportMarkdown";
import { DebatePanel } from "@/components/DebatePanel";
import { ShareStudyButton } from "@/components/share/ShareStudyButton";
import { LightweightLine } from "@/components/charts/LightweightLine";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface MetricsBlock {
  cagr: number;
  sharpe: number;
  maxDrawdown: number;
  calmar: number;
  annualVol: number;
  beta: number;
  alpha: number;
  informationRatio: number | null;
  turnover: number | null;
  winRate: number | null;
}

interface MonthlyReturn {
  date: string;
  strategy: number;
  benchmark: number;
  active: number;
}

interface RebalanceEntry {
  date: string;
  holdings: string[];
  turnover: number;
  txCostApplied: number;
}

interface DataQuality {
  universeSize?: number;
  universeNote?: string;
  survivorshipBias?: boolean;
  survivorshipNote?: string;
  factorType?: string;
  factorTypeNote?: string;
  advisoryDisclaimer?: string;
  benchmarkTicker?: string;
  backtestMonths?: number;
  rebalanceCount?: number;
  priceCoverage?: {
    totalDataPoints?: number;
    missingTickers?: string[];
    coveragePct?: number;
  };
}

interface ApiResult {
  conclusion: string;
  metrics: { strategy: MetricsBlock & { winRate: number; turnover: number }; spy: MetricsBlock };
  equityCurve: { date: string; strategy: number; spy: number }[];
  drawdown: { date: string; strategy: number; spy: number }[];
  annualReturns: { year: string; strategy: number; spy: number }[];
  factorDiagnostics: {
    factor: string;
    ic: number;
    icir: number;
    topQuintileReturn: number;
    bottomQuintileReturn: number;
    spread: number;
  }[];
  aiExplanation: string[];
  // Phase 3.1 — optional in TypeScript so legacy seed/mock results without
  // these fields render gracefully.
  monthlyReturns?: MonthlyReturn[];
  rebalanceHistory?: RebalanceEntry[];
  dataQuality?: DataQuality;
  parameterSensitivity?: ParameterSensitivity | null;
  // Phase 4 — multi-factor diagnostics, populated only for factorMix=multifactor.
  factorCoverage?: FactorCoverage | null;
  factorBreakdown?: FactorBreakdown | null;
  // Phase 8 — robustness report (in/out-of-sample split + bootstrap CI +
  // halve-period metrics). null on legacy studies.
  robustness?: Robustness | null;
  // Phase 9 — multi-benchmark OLS attribution. null on legacy studies.
  benchmarkAttribution?: BenchmarkAttribution | null;
  // Phase 14 — per-rebalance sector allocation series. null on legacy studies
  // and on new studies that didn't enable constraints.
  sectorAllocation?: SectorAllocationEntry[] | null;
}

interface SectorAllocationEntry {
  date: string;
  sectors: Record<string, number>;
}

interface BenchmarkAttribution {
  benchmarks: Array<{
    ticker: string;
    label: string;
    description: string;
    monthsObserved: number;
    alphaAnnualPct: number;
    beta: number;
    rSquared: number;
    correlation: number;
  }>;
  generatedAt: string;
}

interface Robustness {
  whole: { cagr: number; sharpe: number; maxDrawdown: number; monthsCount: number };
  inSample: SubperiodMetrics;
  outOfSample: SubperiodMetrics;
  subperiods: SubperiodMetrics[];
  bootstrap: {
    sharpe: MetricCI;
    cagr: MetricCI;
    maxDrawdown: MetricCI;
  };
  generatedAt: string;
}

interface SubperiodMetrics {
  label: string;
  startMonth: string;
  endMonth: string;
  monthsCount: number;
  cagr: number;
  sharpe: number;
  maxDrawdown: number;
}

interface MetricCI {
  mean: number;
  median: number;
  ci95Lower: number;
  ci95Upper: number;
  iterations: number;
}

interface FactorCoverage {
  byField: Record<string, number>;
  valueCoverage: number;
  qualityCoverage: number;
  missingTickers: string[];
  generatedAt: string;
}

interface FactorBreakdown {
  generatedAt: string;
  asOfRebalance: string;
  holdings: {
    ticker: string;
    value?: number;
    quality?: number;
    momentum?: number;
    composite?: number;
  }[];
}

interface SensitivityVariant {
  label: string;
  cagr: number;
  sharpe: number;
  maxDrawdown: number;
  alpha: number;
  informationRatio: number | null;
  isBaseline: boolean;
}

interface ParameterSensitivity {
  baseline: {
    lookbackMonths: number;
    skipMonths: number;
    rebalanceMonths: number;
    topQuintilePct: number;
  };
  byLookback: SensitivityVariant[];
  byRebalance: SensitivityVariant[];
  byQuintile: SensitivityVariant[];
  generatedAt: string;
}

interface ApiStudy {
  id: string;
  title: string;
  hypothesis: string;
  status: string;
  universe: string;
  startDate: string;
  endDate: string;
  rebalance: string;
  benchmark: string;
  txCostBps: number;
  factorMix?: string;
  result: ApiResult | null;
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });

// Sprint #4 U8: tab restructure.
// Was 5 tabs (overview/performance/risk/analysis/logs) with MetricsTable
// rendered three times across overview/performance/risk. Now 4 tabs:
//   • 概览 — AI conclusion + DataQuality + the *only* MetricsTable + Best/Worst Months
//   • 表现 — return charts (equity / drawdown / annual) + annual table
//   • 持仓 — RebalanceHistoryCard + FactorBreakdownCard (was buried in analysis)
//   • 分析 — FactorDiagnostics + FactorCoverageCard + ParameterSensitivityCard
const TABS = [
  { key: "overview", label: "概览" },
  { key: "performance", label: "表现" },
  { key: "holdings", label: "持仓" },
  { key: "analysis", label: "分析" },
  // Phase 13: multi-agent investment debate.
  { key: "debate", label: "投研讨论" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const chartGrid = "#e5e7eb";
const chartTickStyle = { fill: "#9ca3af", fontSize: 10 };
const tooltipStyle = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
  fontSize: 12,
};
const tooltipLabelStyle = { color: "#374151", fontWeight: 500 };
const STRATEGY_COLOR = "#2563eb";
const SPY_COLOR = "#94a3b8";

function MetricRow({
  label,
  strategy,
  spy,
  isPositiveGood = true,
  strategyNum,
  spyNum,
}: {
  label: string;
  strategy: string | number | null;
  spy: string | number | null;
  isPositiveGood?: boolean;
  strategyNum?: number | null;
  spyNum?: number | null;
}) {
  const sVal = strategyNum ?? (typeof strategy === "number" ? strategy : null);
  const bVal = spyNum ?? (typeof spy === "number" ? spy : null);
  const isBetter =
    sVal !== null && bVal !== null
      ? isPositiveGood
        ? sVal > bVal
        : sVal < bVal
      : false;

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-2 text-sm text-gray-500">{label}</td>
      <td
        className={`py-2 text-sm font-semibold text-right ${
          isBetter ? "text-green-600" : "text-gray-900"
        }`}
      >
        {strategy ?? "—"}
      </td>
      <td className="py-2 text-sm text-gray-500 text-right">{spy ?? "—"}</td>
    </tr>
  );
}

function MetricsTable({ result }: { result: ApiResult }) {
  const m = result.metrics;
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">关键指标</h3>
      </div>
      <div className="px-4 py-2">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 text-xs text-gray-500 text-left font-medium">
                指标
              </th>
              <th className="py-2 text-xs text-gray-700 text-right font-medium">
                策略
              </th>
              <th className="py-2 text-xs text-gray-500 text-right font-medium">
                {/* benchmark label */}
                基准
              </th>
            </tr>
          </thead>
          <tbody>
            <MetricRow
              label="CAGR"
              strategy={`${m.strategy.cagr}%`}
              spy={`${m.spy.cagr}%`}
              strategyNum={m.strategy.cagr}
              spyNum={m.spy.cagr}
            />
            <MetricRow
              label="Sharpe"
              strategy={m.strategy.sharpe}
              spy={m.spy.sharpe}
            />
            <MetricRow
              label="Max Drawdown"
              strategy={`${m.strategy.maxDrawdown}%`}
              spy={`${m.spy.maxDrawdown}%`}
              strategyNum={m.strategy.maxDrawdown}
              spyNum={m.spy.maxDrawdown}
              isPositiveGood={true}
            />
            <MetricRow
              label="年化波动率"
              strategy={`${m.strategy.annualVol}%`}
              spy={`${m.spy.annualVol}%`}
              strategyNum={m.strategy.annualVol}
              spyNum={m.spy.annualVol}
              isPositiveGood={false}
            />
            <MetricRow label="Calmar" strategy={m.strategy.calmar} spy={m.spy.calmar} />
            <MetricRow
              label="月度胜率"
              strategy={m.strategy.winRate ? `${m.strategy.winRate}%` : "—"}
              spy="—"
            />
            <MetricRow
              label="换手率"
              strategy={m.strategy.turnover ? `${m.strategy.turnover}%` : "—"}
              spy="—"
            />
            <MetricRow label="Beta" strategy={m.strategy.beta} spy={m.spy.beta} />
            <MetricRow
              label="Alpha (年化)"
              strategy={`${m.strategy.alpha >= 0 ? "+" : ""}${m.strategy.alpha}%`}
              spy="0%"
              strategyNum={m.strategy.alpha}
              spyNum={0}
            />
            <MetricRow
              label="IR"
              strategy={m.strategy.informationRatio ?? "—"}
              spy="—"
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-3 py-3">{children}</div>
    </div>
  );
}

// Sprint #4 U5: window-width hook used by chart components to bump line
// strokes and reduce X-axis tick density on narrow screens, where the
// previous 1.5px dashed SPY line was unreadable against the 2px solid
// strategy line at 320-360px widths.
function useIsNarrow(breakpointPx = 640): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setNarrow(window.innerWidth < breakpointPx);
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, [breakpointPx]);
  return narrow;
}

// Phase 16: equity + drawdown migrated to Lightweight Charts via the shared
// LightweightLine wrapper. AnnualReturnsChart (bar) below stays Recharts
// because bars are not Lightweight Charts' strong suit.
function EquityChart({
  data,
  height = 240,
}: {
  data: ApiResult["equityCurve"];
  height?: number;
}) {
  return <LightweightLine data={data} height={height} valueFormat="raw" />;
}

function DrawdownChart({
  data,
  height = 200,
}: {
  data: ApiResult["drawdown"];
  height?: number;
}) {
  return <LightweightLine data={data} height={height} valueFormat="pct" zeroLine />;
}

function AnnualReturnsChart({
  data,
  height = 220,
}: {
  data: ApiResult["annualReturns"];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
        barCategoryGap="30%"
      >
        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
        <XAxis
          dataKey="year"
          tick={chartTickStyle}
          tickLine={false}
          axisLine={{ stroke: chartGrid }}
        />
        <YAxis tick={chartTickStyle} tickLine={false} axisLine={false} />
        <ReferenceLine y={0} stroke="#d1d5db" />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          formatter={(v) => [`${v}%`]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="strategy" fill={STRATEGY_COLOR} name="策略" radius={[2, 2, 0, 0]} />
        <Bar dataKey="spy" fill="#cbd5e1" name="基准" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function FactorDiagnostics({
  data,
}: {
  data: ApiResult["factorDiagnostics"];
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">因子诊断</h3>
      </div>
      <div className="px-4 py-2">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 text-xs text-gray-500 text-left font-medium">
                因子
              </th>
              <th className="py-2 text-xs text-gray-500 text-right font-medium">
                IC
              </th>
              <th className="py-2 text-xs text-gray-500 text-right font-medium">
                IC IR
              </th>
              <th className="py-2 text-xs text-gray-500 text-right font-medium hidden sm:table-cell">
                Q1 收益
              </th>
              <th className="py-2 text-xs text-gray-500 text-right font-medium hidden sm:table-cell">
                Q5 收益
              </th>
              <th className="py-2 text-xs text-gray-500 text-right font-medium">
                价差
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((f) => (
              <tr key={f.factor} className="border-b border-gray-100 last:border-0">
                <td className="py-2 text-sm text-gray-900 font-medium">{f.factor}</td>
                <td className="py-2 text-sm text-gray-700 text-right">
                  {f.ic.toFixed(3)}
                </td>
                <td className="py-2 text-sm text-gray-700 text-right">
                  {f.icir.toFixed(2)}
                </td>
                <td className="py-2 text-sm text-green-600 text-right hidden sm:table-cell">
                  {f.topQuintileReturn}%
                </td>
                <td className="py-2 text-sm text-red-600 text-right hidden sm:table-cell">
                  {f.bottomQuintileReturn}%
                </td>
                <td className="py-2 text-sm text-blue-600 text-right font-semibold">
                  {f.spread}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AIConclusionCard({
  result,
  generating,
  generationError,
  onRetry,
}: {
  result: ApiResult;
  generating: boolean;
  generationError: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-blue-100 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-900">AI 结论</h3>
        <span className="text-xs text-gray-500 ml-auto inline-flex items-center gap-1.5">
          {generating ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              生成中…
            </>
          ) : (
            "AI 自动生成"
          )}
        </span>
      </div>
      <div className="px-4 py-3 space-y-2">
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
          {result.conclusion}
        </p>
        {generationError && (
          <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            <span className="flex-1">{generationError}</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-red-700 hover:text-red-900"
              onClick={onRetry}
            >
              <RefreshCw className="h-3 w-3" />
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AIKeyPoints({
  points,
  generating,
}: {
  points: string[];
  generating: boolean;
}) {
  const hasPoints = points && points.length > 0;
  if (!hasPoints && !generating) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-900">AI 解释要点</h3>
        {generating && (
          <span className="text-xs text-gray-500 ml-auto inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            生成中…
          </span>
        )}
      </div>
      {hasPoints ? (
        <ul className="px-4 py-3 space-y-2">
          {points.map((point, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="text-blue-500 shrink-0 mt-0.5">•</span>
              {point}
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 py-6 text-sm text-gray-500">
          AI 正在分析回测结果…
        </div>
      )}
    </div>
  );
}

// ====================================================================
// Phase 3.1 sections — Data Quality, Annual Performance, Best/Worst
// Months, Rebalance History.
// ====================================================================

function DataQualityCard({
  dq,
  factorMix,
}: {
  dq?: DataQuality;
  factorMix?: string;
}) {
  // Even if dq is empty (legacy result), render a hard-coded baseline so the
  // disclaimer is always present per Phase 3.1 requirement.
  const universeNote =
    dq?.universeNote ??
    "当前股票池为静态 30 只美股大市值列表（硬编码），不是历史完整 S&P 500 成分股";
  const survivorshipNote =
    dq?.survivorshipNote ??
    "因为股票池在整个回测窗口里固定，已退市/被剔除指数的标的不在样本里，回测结果存在幸存者偏差";
  // Sprint #4 U15: factorMix-aware fallback. The previous fallback only
  // mentioned momentum, which would mislead users running multifactor studies
  // if the runner failed to populate factorTypeNote.
  // Phase 5 update: Value factors are now PIT-correct via back-derived
  // historical MarketCap; only EV/EBITDA still falls back to Yahoo's static
  // snapshot. Use "全 PIT 多因子" wording.
  const factorTypeFallback =
    factorMix === "multifactor"
      ? "全 PIT 多因子（Value + Quality + 12-1 Momentum）：Value 与 Quality 均按 90 天 reporting lag 做 PIT 计算，EV/EBITDA 仍为 Yahoo 当前快照兜底。"
      : "当前因子仅使用价格信息（12-1 动量），不包含估值/质量/成长等基本面因子";
  const factorTypeNote = dq?.factorTypeNote ?? factorTypeFallback;
  const advisoryDisclaimer =
    dq?.advisoryDisclaimer ?? "本研究结果仅供研究和教育用途，不构成投资建议";
  const coverage = dq?.priceCoverage;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-200 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-900">数据质量与偏差</h3>
        <span className="text-xs text-amber-700 ml-auto">阅读前请知悉</span>
      </div>
      <div className="px-4 py-3 space-y-2 text-sm">
        <div className="flex gap-2">
          <span className="text-amber-700 shrink-0">•</span>
          <p className="text-gray-800">
            <span className="font-medium">股票池构成：</span>
            {universeNote}
          </p>
        </div>
        <div className="flex gap-2">
          <span className="text-amber-700 shrink-0">•</span>
          <p className="text-gray-800">
            <span className="font-medium">幸存者偏差：</span>
            {survivorshipNote}
          </p>
        </div>
        <div className="flex gap-2">
          <span className="text-amber-700 shrink-0">•</span>
          <p className="text-gray-800">
            <span className="font-medium">因子类型：</span>
            {factorTypeNote}
          </p>
        </div>
        <div className="flex gap-2">
          <span className="text-amber-700 shrink-0">•</span>
          <p className="text-gray-800">
            <span className="font-medium">免责声明：</span>
            {advisoryDisclaimer}
          </p>
        </div>
        {coverage && (
          <div className="mt-2 pt-2 border-t border-amber-200/60 text-xs text-amber-900/80 flex flex-wrap gap-x-4 gap-y-1">
            {coverage.totalDataPoints !== undefined && (
              <span>价格数据点：{coverage.totalDataPoints}</span>
            )}
            {coverage.coveragePct !== undefined && (
              <span>覆盖率：约 {coverage.coveragePct}%</span>
            )}
            {coverage.missingTickers && coverage.missingTickers.length > 0 && (
              <span>
                缺失标的：{coverage.missingTickers.length} 只（
                {coverage.missingTickers.slice(0, 5).join(", ")}
                {coverage.missingTickers.length > 5 ? "…" : ""}）
              </span>
            )}
            {dq?.benchmarkTicker && <span>基准：{dq.benchmarkTicker}</span>}
            {dq?.backtestMonths !== undefined && (
              <span>交易月数：{dq.backtestMonths}</span>
            )}
            {dq?.rebalanceCount !== undefined && (
              <span>再平衡次数：{dq.rebalanceCount}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AnnualReturnsTable({
  data,
}: {
  data: ApiResult["annualReturns"];
}) {
  if (!data || data.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">年度收益明细</h3>
      </div>
      <div className="px-4 py-2 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 text-xs text-gray-500 text-left font-medium">年份</th>
              <th className="py-2 text-xs text-gray-500 text-right font-medium">策略</th>
              <th className="py-2 text-xs text-gray-500 text-right font-medium">基准</th>
              <th className="py-2 text-xs text-gray-500 text-right font-medium">超额</th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => {
              const excess = Math.round((a.strategy - a.spy) * 100) / 100;
              return (
                <tr key={a.year} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 text-sm text-gray-900 font-medium">{a.year}</td>
                  <td
                    className={`py-2 text-sm text-right font-semibold ${a.strategy >= 0 ? "text-gray-900" : "text-red-600"}`}
                  >
                    {a.strategy >= 0 ? "+" : ""}
                    {a.strategy}%
                  </td>
                  <td className="py-2 text-sm text-gray-500 text-right">
                    {a.spy >= 0 ? "+" : ""}
                    {a.spy}%
                  </td>
                  <td
                    className={`py-2 text-sm text-right font-medium ${excess >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {excess >= 0 ? "+" : ""}
                    {excess}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BestWorstMonthsCard({
  monthly,
  n = 5,
}: {
  monthly?: MonthlyReturn[];
  n?: number;
}) {
  if (!monthly || monthly.length === 0) return null;
  const sorted = [...monthly].sort((a, b) => b.strategy - a.strategy);
  const best = sorted.slice(0, n);
  const worst = sorted.slice(-n).reverse();
  const renderRow = (m: MonthlyReturn) => (
    <tr key={m.date} className="border-b border-gray-100 last:border-0">
      <td className="py-1.5 text-sm text-gray-900 font-mono">{m.date}</td>
      <td
        className={`py-1.5 text-sm text-right font-semibold ${m.strategy >= 0 ? "text-green-600" : "text-red-600"}`}
      >
        {(m.strategy * 100).toFixed(2)}%
      </td>
      <td className="py-1.5 text-sm text-gray-500 text-right">
        {(m.benchmark * 100).toFixed(2)}%
      </td>
      <td
        className={`py-1.5 text-sm text-right ${m.active >= 0 ? "text-green-700" : "text-red-700"}`}
      >
        {(m.active * 100).toFixed(2)}%
      </td>
    </tr>
  );
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">最佳 / 最差月份</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          按策略月度收益排序的极值（共 {monthly.length} 个月）
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-gray-100">
        <div className="px-4 py-2">
          <div className="text-xs font-medium text-green-700 uppercase tracking-wide mb-1">
            ↑ 最佳 {best.length}
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="py-1 text-xs text-gray-500 text-left font-medium">月份</th>
                <th className="py-1 text-xs text-gray-500 text-right font-medium">策略</th>
                <th className="py-1 text-xs text-gray-500 text-right font-medium">基准</th>
                <th className="py-1 text-xs text-gray-500 text-right font-medium">超额</th>
              </tr>
            </thead>
            <tbody>{best.map(renderRow)}</tbody>
          </table>
        </div>
        <div className="px-4 py-2">
          <div className="text-xs font-medium text-red-700 uppercase tracking-wide mb-1">
            ↓ 最差 {worst.length}
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="py-1 text-xs text-gray-500 text-left font-medium">月份</th>
                <th className="py-1 text-xs text-gray-500 text-right font-medium">策略</th>
                <th className="py-1 text-xs text-gray-500 text-right font-medium">基准</th>
                <th className="py-1 text-xs text-gray-500 text-right font-medium">超额</th>
              </tr>
            </thead>
            <tbody>{worst.map(renderRow)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SectorAllocationCard({
  series,
}: {
  series?: SectorAllocationEntry[] | null;
}) {
  if (!series || series.length === 0) return null;
  const latest = series[series.length - 1];
  const sectors = Object.entries(latest.sectors).sort((a, b) => b[1] - a[1]);
  const total = sectors.reduce((s, [, w]) => s + w, 0) || 1;
  const palette: Record<string, string> = {
    Tech: "#3b82f6",
    Financials: "#10b981",
    Healthcare: "#f59e0b",
    "Consumer Discretionary": "#a855f7",
    "Consumer Staples": "#06b6d4",
    Energy: "#ef4444",
    Industrials: "#6366f1",
    Communications: "#ec4899",
    Unknown: "#9ca3af",
  };
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">行业分布（最新调仓）</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          作为 {latest.date} 调仓后的 sector 权重；Phase 14 风险约束生效时才出现
        </p>
      </div>
      <div className="px-4 py-4 space-y-3">
        {/* Horizontal stacked bar */}
        <div className="h-3 w-full rounded-full overflow-hidden flex bg-gray-100">
          {sectors.map(([s, w]) => (
            <div
              key={s}
              className="h-full"
              style={{
                width: `${(w / total) * 100}%`,
                backgroundColor: palette[s] ?? "#94a3b8",
              }}
              title={`${s}: ${(w * 100).toFixed(1)}%`}
            />
          ))}
        </div>
        {/* Legend */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5">
          {sectors.map(([s, w]) => (
            <div key={s} className="flex items-center gap-1.5 text-xs">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: palette[s] ?? "#94a3b8" }}
              />
              <span className="text-gray-700 flex-1 truncate">{s}</span>
              <span className="text-gray-500 font-mono tabular-nums">
                {(w * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
        {series.length > 1 && (
          <p className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
            历史共 {series.length} 次调仓，每次的板块分布写入结果数据
          </p>
        )}
      </div>
    </div>
  );
}

function RebalanceHistoryCard({
  history,
}: {
  history?: RebalanceEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (!history || history.length === 0) return null;
  const visible = expanded ? history : history.slice(-12).reverse();
  const showToggle = history.length > 12;
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">再平衡历史</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            共 {history.length} 次再平衡
            {showToggle && !expanded && `，仅显示最近 12 次`}
          </p>
        </div>
        {showToggle && (
          <button
            type="button"
            className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" /> 折叠
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> 展开全部
              </>
            )}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/50">
              <th className="py-2 px-4 text-xs text-gray-500 text-left font-medium">日期</th>
              <th className="py-2 px-4 text-xs text-gray-500 text-left font-medium">持仓（标的）</th>
              <th className="py-2 px-4 text-xs text-gray-500 text-right font-medium">单边换手</th>
              <th className="py-2 px-4 text-xs text-gray-500 text-right font-medium">交易成本</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.date} className="border-b border-gray-100 last:border-0">
                <td className="py-2 px-4 text-sm text-gray-900 font-mono whitespace-nowrap">
                  {r.date}
                </td>
                <td className="py-2 px-4 text-xs text-gray-700">
                  <span className="inline-flex flex-wrap gap-1">
                    {r.holdings.map((h) => (
                      <span
                        key={h}
                        className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-medium font-mono"
                      >
                        {h}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="py-2 px-4 text-sm text-gray-700 text-right">
                  {(r.turnover * 100).toFixed(1)}%
                </td>
                <td className="py-2 px-4 text-sm text-gray-500 text-right">
                  {(r.txCostApplied * 10000).toFixed(1)} bps
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SensitivityTable({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: SensitivityVariant[];
}) {
  return (
    <div>
      <div className="mb-1.5">
        <h4 className="text-sm font-medium text-gray-900">{title}</h4>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/60">
              <th className="py-2 px-3 text-xs text-gray-500 text-left font-medium">参数</th>
              <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">CAGR</th>
              <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">Sharpe</th>
              <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">Max DD</th>
              <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">Alpha</th>
              <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">IR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.label}
                className={`border-b border-gray-100 last:border-0 ${
                  r.isBaseline ? "bg-blue-50/40" : ""
                }`}
              >
                <td className="py-2 px-3 text-sm text-gray-900">
                  <span className="inline-flex items-center gap-2">
                    {r.label}
                    {r.isBaseline && (
                      <span className="text-[10px] uppercase tracking-wide bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">
                        基准
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-2 px-3 text-sm text-right text-gray-900 font-medium">
                  {r.cagr.toFixed(2)}%
                </td>
                <td className="py-2 px-3 text-sm text-right text-gray-900">
                  {r.sharpe.toFixed(2)}
                </td>
                <td className="py-2 px-3 text-sm text-right text-red-600">
                  {r.maxDrawdown.toFixed(2)}%
                </td>
                <td
                  className={`py-2 px-3 text-sm text-right ${r.alpha >= 0 ? "text-green-700" : "text-red-600"}`}
                >
                  {r.alpha >= 0 ? "+" : ""}
                  {r.alpha.toFixed(2)}%
                </td>
                <td className="py-2 px-3 text-sm text-right text-gray-700">
                  {r.informationRatio == null
                    ? "—"
                    : r.informationRatio.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BenchmarkAttributionCard({
  data,
}: {
  data?: BenchmarkAttribution | null;
}) {
  if (!data || data.benchmarks.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">多基准归因</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          策略对各因子 ETF 跑 OLS 回归，看 alpha 是不是只是某种因子敞口的伪装
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/60">
              <th className="py-2 px-3 text-xs text-gray-500 text-left font-medium">
                基准
              </th>
              <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">
                月数
              </th>
              <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">
                α (年化)
              </th>
              <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">
                β
              </th>
              <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">
                R²
              </th>
            </tr>
          </thead>
          <tbody>
            {data.benchmarks.map((b) => (
              <tr key={b.ticker} className="border-b border-gray-100 last:border-0">
                <td className="py-2 px-3 text-sm">
                  <div className="text-gray-900 font-medium">{b.label}</div>
                  <div className="text-xs text-gray-500 leading-tight">
                    {b.description}
                  </div>
                </td>
                <td className="py-2 px-3 text-sm text-right font-mono text-gray-500">
                  {b.monthsObserved}
                </td>
                <td
                  className={`py-2 px-3 text-sm text-right font-mono ${
                    b.alphaAnnualPct > 0
                      ? "text-green-700"
                      : b.alphaAnnualPct < 0
                        ? "text-red-600"
                        : "text-gray-700"
                  }`}
                >
                  {b.monthsObserved < 2
                    ? "—"
                    : `${b.alphaAnnualPct >= 0 ? "+" : ""}${b.alphaAnnualPct.toFixed(2)}%`}
                </td>
                <td className="py-2 px-3 text-sm text-right font-mono text-gray-700">
                  {b.monthsObserved < 2 ? "—" : b.beta.toFixed(2)}
                </td>
                <td className="py-2 px-3 text-sm text-right font-mono text-gray-700">
                  {b.monthsObserved < 2 ? "—" : b.rSquared.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-500 leading-relaxed">
        <strong>怎么读：</strong>
        β=1 → 完全是该 ETF 的代理；β=0 → 完全独立。
        R²=0.9 → 该 ETF 解释了策略 90% 的方差，所谓 alpha 多半是 noise；
        R²=0.3 → 策略大部分行为来自其他因素，alpha 更可信。
        如「相对 MTUM 的 R²=0.85 + α=0.5%」，意味你的策略基本就是动量代理 + 微小残差。
      </div>
    </div>
  );
}

function RobustnessCard({ data }: { data?: Robustness | null }) {
  if (!data) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">鲁棒性检验</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          看 alpha 是不是噪音、是不是只在某一段窗口里管用
        </p>
      </div>
      <div className="px-4 py-3 space-y-4">
        {/* In/out-of-sample split */}
        <div>
          <h4 className="text-xs font-semibold text-gray-700 mb-1.5">
            样本内 / 样本外（70/30 拆分）
          </h4>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60">
                <th className="py-1.5 px-2 text-xs text-gray-500 text-left font-medium">
                  区间
                </th>
                <th className="py-1.5 px-2 text-xs text-gray-500 text-left font-medium">
                  时间窗口
                </th>
                <th className="py-1.5 px-2 text-xs text-gray-500 text-right font-medium">
                  CAGR
                </th>
                <th className="py-1.5 px-2 text-xs text-gray-500 text-right font-medium">
                  Sharpe
                </th>
                <th className="py-1.5 px-2 text-xs text-gray-500 text-right font-medium">
                  Max DD
                </th>
              </tr>
            </thead>
            <tbody>
              {[data.inSample, data.outOfSample].map((p) => (
                <tr key={p.label} className="border-b border-gray-100 last:border-0">
                  <td className="py-1.5 px-2 text-sm text-gray-900">{p.label}</td>
                  <td className="py-1.5 px-2 text-xs text-gray-500 font-mono">
                    {p.startMonth} → {p.endMonth}
                  </td>
                  <td className="py-1.5 px-2 text-sm text-right font-mono">
                    {p.cagr.toFixed(2)}%
                  </td>
                  <td className="py-1.5 px-2 text-sm text-right font-mono">
                    {p.sharpe.toFixed(2)}
                  </td>
                  <td className="py-1.5 px-2 text-sm text-right font-mono text-red-600">
                    {p.maxDrawdown.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-1.5">
            如果样本外指标显著差于样本内，说明策略可能过拟合；样本外更接近你真实持有时的预期。
          </p>
        </div>

        <div className="border-t border-gray-100 -mx-4" />

        {/* Subperiod halves */}
        <div>
          <h4 className="text-xs font-semibold text-gray-700 mb-1.5">
            前后两段对比
          </h4>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60">
                <th className="py-1.5 px-2 text-xs text-gray-500 text-left font-medium">
                  段
                </th>
                <th className="py-1.5 px-2 text-xs text-gray-500 text-left font-medium">
                  时间
                </th>
                <th className="py-1.5 px-2 text-xs text-gray-500 text-right font-medium">
                  CAGR
                </th>
                <th className="py-1.5 px-2 text-xs text-gray-500 text-right font-medium">
                  Sharpe
                </th>
                <th className="py-1.5 px-2 text-xs text-gray-500 text-right font-medium">
                  Max DD
                </th>
              </tr>
            </thead>
            <tbody>
              {data.subperiods.map((p) => (
                <tr key={p.label} className="border-b border-gray-100 last:border-0">
                  <td className="py-1.5 px-2 text-sm text-gray-900">{p.label}</td>
                  <td className="py-1.5 px-2 text-xs text-gray-500 font-mono">
                    {p.startMonth} → {p.endMonth}
                  </td>
                  <td className="py-1.5 px-2 text-sm text-right font-mono">
                    {p.cagr.toFixed(2)}%
                  </td>
                  <td className="py-1.5 px-2 text-sm text-right font-mono">
                    {p.sharpe.toFixed(2)}
                  </td>
                  <td className="py-1.5 px-2 text-sm text-right font-mono text-red-600">
                    {p.maxDrawdown.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-1.5">
            两段之间差异越大 → 策略对市场制度越敏感（要警惕外推到不同环境）
          </p>
        </div>

        <div className="border-t border-gray-100 -mx-4" />

        {/* Bootstrap CI */}
        <div>
          <h4 className="text-xs font-semibold text-gray-700 mb-1.5">
            Bootstrap 置信区间（{data.bootstrap.sharpe.iterations} 次重抽样）
          </h4>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60">
                <th className="py-1.5 px-2 text-xs text-gray-500 text-left font-medium">
                  指标
                </th>
                <th className="py-1.5 px-2 text-xs text-gray-500 text-right font-medium">
                  全样本
                </th>
                <th className="py-1.5 px-2 text-xs text-gray-500 text-right font-medium">
                  Bootstrap 中位数
                </th>
                <th className="py-1.5 px-2 text-xs text-gray-500 text-right font-medium">
                  95% CI
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-1.5 px-2 text-sm text-gray-900">Sharpe</td>
                <td className="py-1.5 px-2 text-sm text-right font-mono">
                  {data.whole.sharpe.toFixed(2)}
                </td>
                <td className="py-1.5 px-2 text-sm text-right font-mono">
                  {data.bootstrap.sharpe.median.toFixed(2)}
                </td>
                <td className="py-1.5 px-2 text-sm text-right font-mono text-gray-600">
                  [{data.bootstrap.sharpe.ci95Lower.toFixed(2)}, {data.bootstrap.sharpe.ci95Upper.toFixed(2)}]
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-1.5 px-2 text-sm text-gray-900">CAGR (%)</td>
                <td className="py-1.5 px-2 text-sm text-right font-mono">
                  {data.whole.cagr.toFixed(2)}
                </td>
                <td className="py-1.5 px-2 text-sm text-right font-mono">
                  {data.bootstrap.cagr.median.toFixed(2)}
                </td>
                <td className="py-1.5 px-2 text-sm text-right font-mono text-gray-600">
                  [{data.bootstrap.cagr.ci95Lower.toFixed(2)}, {data.bootstrap.cagr.ci95Upper.toFixed(2)}]
                </td>
              </tr>
              <tr>
                <td className="py-1.5 px-2 text-sm text-gray-900">Max DD (%)</td>
                <td className="py-1.5 px-2 text-sm text-right font-mono text-red-600">
                  {data.whole.maxDrawdown.toFixed(2)}
                </td>
                <td className="py-1.5 px-2 text-sm text-right font-mono text-red-600">
                  {data.bootstrap.maxDrawdown.median.toFixed(2)}
                </td>
                <td className="py-1.5 px-2 text-sm text-right font-mono text-red-600">
                  [{data.bootstrap.maxDrawdown.ci95Lower.toFixed(2)}, {data.bootstrap.maxDrawdown.ci95Upper.toFixed(2)}]
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-1.5">
            CI 越窄 → 该指标越确定。如 Sharpe 全样本 0.85 但 95% CI [0.20, 1.50]，意味着「真实 Sharpe 可能从 0.20 到 1.50 都有可能」，alpha 不显著。
          </p>
        </div>
      </div>
    </div>
  );
}

function ParameterSensitivityCard({
  data,
}: {
  data?: ParameterSensitivity | null;
}) {
  if (!data) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">参数敏感性</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          单一变量扫描：每张表只改一个参数，其余固定为基准（
          {data.baseline.lookbackMonths}-{data.baseline.skipMonths} 动量·
          {data.baseline.rebalanceMonths === 1 ? "月" : `${data.baseline.rebalanceMonths} 月`}
          再平衡·Top {Math.round(data.baseline.topQuintilePct * 100)}%）
        </p>
      </div>
      <div className="px-4 py-3 space-y-4">
        <SensitivityTable
          title="动量回看期"
          description="跳过最近 1 个月以避开短期反转，比较 6/9/12 个月回看窗口"
          rows={data.byLookback}
        />
        <div className="border-t border-gray-100 -mx-4" />
        <SensitivityTable
          title="再平衡频率"
          description="月度 vs 季度再平衡（更高频率换手大、交易成本高）"
          rows={data.byRebalance}
        />
        <div className="border-t border-gray-100 -mx-4" />
        <SensitivityTable
          title="分位桶宽度"
          description="选 Top N% 因子最高股票等权（窄桶集中度高，宽桶更接近基准）"
          rows={data.byQuintile}
        />
      </div>
    </div>
  );
}

const FACTOR_FIELD_LABELS: Record<string, string> = {
  pe: "P/E",
  pb: "P/B",
  ps: "P/S",
  evEbitda: "EV/EBITDA",
  roe: "ROE",
  roic: "ROIC",
  grossMargin: "Gross Margin",
  debtToEquity: "Debt/Equity",
  revenueGrowth: "Revenue Growth",
  epsGrowth: "EPS Growth",
};

function FactorCoverageCard({ data }: { data?: FactorCoverage | null }) {
  if (!data) return null;
  const fields = Object.entries(data.byField);
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">基本面字段覆盖率</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Yahoo + SEC EDGAR 合并后，每个字段在股票池中的可用率（基于当前快照）
        </p>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-xs text-gray-500">价值因子覆盖：</div>
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${Math.round(data.valueCoverage * 100)}%` }}
            />
          </div>
          <div className="text-xs font-medium text-gray-700 w-10 text-right">
            {Math.round(data.valueCoverage * 100)}%
          </div>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className="text-xs text-gray-500">质量因子覆盖：</div>
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${Math.round(data.qualityCoverage * 100)}%` }}
            />
          </div>
          <div className="text-xs font-medium text-gray-700 w-10 text-right">
            {Math.round(data.qualityCoverage * 100)}%
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 mt-3 pt-3 border-t border-gray-100">
          {fields.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-xs">
              <span className="text-gray-600">
                {FACTOR_FIELD_LABELS[k] ?? k}
              </span>
              <span
                className={`font-mono ${
                  v >= 0.9
                    ? "text-green-700"
                    : v >= 0.5
                      ? "text-amber-700"
                      : "text-red-600"
                }`}
              >
                {Math.round(v * 100)}%
              </span>
            </div>
          ))}
        </div>
        {data.missingTickers.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
            完全无数据的标的：
            <span className="font-mono text-gray-700">
              {data.missingTickers.join(", ")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function FactorBreakdownCard({ data }: { data?: FactorBreakdown | null }) {
  if (!data || data.holdings.length === 0) return null;
  const fmtZ = (z?: number) =>
    z == null ? "—" : `${z >= 0 ? "+" : ""}${z.toFixed(2)}`;
  const colorOf = (z?: number) => {
    if (z == null) return "text-gray-400";
    if (z > 0.5) return "text-green-700";
    if (z < -0.5) return "text-red-600";
    return "text-gray-700";
  };
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">
          最末次再平衡 · 持仓多因子分解
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          于 {data.asOfRebalance} 选股时各持仓的 Value / Quality / Momentum z-score 与等权合成（横截面归一）
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/60">
              <th className="py-2 px-3 text-xs text-gray-500 text-left font-medium">
                标的
              </th>
              <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">
                Value z
              </th>
              <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">
                Quality z
              </th>
              <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">
                Momentum z
              </th>
              <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">
                合成
              </th>
            </tr>
          </thead>
          <tbody>
            {data.holdings.map((h) => (
              <tr
                key={h.ticker}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="py-2 px-3 text-sm text-gray-900 font-mono">
                  {h.ticker}
                </td>
                <td
                  className={`py-2 px-3 text-sm text-right font-mono ${colorOf(h.value)}`}
                >
                  {fmtZ(h.value)}
                </td>
                <td
                  className={`py-2 px-3 text-sm text-right font-mono ${colorOf(h.quality)}`}
                >
                  {fmtZ(h.quality)}
                </td>
                <td
                  className={`py-2 px-3 text-sm text-right font-mono ${colorOf(h.momentum)}`}
                >
                  {fmtZ(h.momentum)}
                </td>
                <td
                  className={`py-2 px-3 text-sm text-right font-semibold font-mono ${colorOf(h.composite)}`}
                >
                  {fmtZ(h.composite)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ResultPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const studyId = params.id;
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [generatingConclusion, setGeneratingConclusion] = useState(false);
  const [conclusionError, setConclusionError] = useState<string | null>(null);
  const conclusionTriedRef = useRef(false);

  const { data, error, isLoading, mutate } = useSWR<{ study: ApiStudy }>(
    studyId ? `/api/studies/${studyId}` : null,
    fetcher,
  );
  const study = data?.study;
  const result = study?.result ?? null;

  const generateConclusion = async () => {
    if (!studyId) return;
    setGeneratingConclusion(true);
    setConclusionError(null);
    try {
      const res = await fetch(`/api/studies/${studyId}/result/conclusion`, {
        method: "POST",
      });
      if (!res.ok) {
        let msg = `生成失败 (HTTP ${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) msg = body.error;
        } catch {
          // non-JSON — keep default.
        }
        throw new Error(msg);
      }
      await mutate();
    } catch (err) {
      setConclusionError(err instanceof Error ? err.message : "AI 结论生成失败");
    } finally {
      setGeneratingConclusion(false);
    }
  };

  // Auto-fire conclusion generation once for completed studies whose result
  // has empty aiExplanation (e.g. legacy mock seed). Guarded by a ref so SWR
  // re-renders or StrictMode double-invocation don't double-fire.
  useEffect(() => {
    if (!study || !result) return;
    if (study.status !== "COMPLETED") return;
    if (Array.isArray(result.aiExplanation) && result.aiExplanation.length > 0) {
      return;
    }
    if (conclusionTriedRef.current) return;
    if (generatingConclusion || conclusionError) return;
    conclusionTriedRef.current = true;
    void generateConclusion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [study, result]);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="bg-white border border-gray-200 rounded-lg p-12 flex items-center justify-center text-gray-500 text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载结果…
        </div>
      </div>
    );
  }

  if (error || !study) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          加载失败：{(error as Error | undefined)?.message ?? "研究不存在"}
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="p-6 max-w-2xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-3 w-3" />
          返回仪表盘
        </Link>
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-base font-medium text-gray-900 mb-1">
            研究尚无结果
          </p>
          <p className="text-sm text-gray-500 mb-4">
            该研究还未运行完成，结果数据未生成。
          </p>
          <div className="flex justify-center gap-2">
            <Link href={`/studies/${study.id}/plan`}>
              <Button
                size="sm"
                variant="outline"
                className="border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                查看计划
              </Button>
            </Link>
            <Link href={`/studies/${study.id}/running`}>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                运行研究 →
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeft className="h-3 w-3" />
            返回仪表盘
          </Link>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-xl font-semibold text-gray-900">{study.title}</h1>
            <Badge variant="success">已完成</Badge>
            <span className="text-xs text-gray-400 font-mono">{study.id}</span>
          </div>
          <p className="text-sm text-gray-500">
            {study.universe} · {study.startDate.slice(0, 10)} →{" "}
            {study.endDate.slice(0, 10)} · {study.rebalance} · {study.txCostBps} bps
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="border-gray-200 text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
            onClick={() => {
              if (!study || !result) return;
              const md = generateResultMarkdown(
                {
                  id: study.id,
                  title: study.title,
                  hypothesis: study.hypothesis ?? "",
                  universe: study.universe,
                  startDate: study.startDate,
                  endDate: study.endDate,
                  rebalance: study.rebalance,
                  benchmark: study.benchmark,
                  txCostBps: study.txCostBps,
                },
                result,
              );
              const safeTitle = (study.title || "study")
                .replace(/[^\p{L}\p{N}_-]+/gu, "_")
                .slice(0, 60);
              downloadMarkdown(`${safeTitle}-${study.id.slice(0, 8)}.md`, md);
            }}
          >
            <Download className="h-3.5 w-3.5" />
            导出 Markdown
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="inline-flex items-center gap-1.5"
            onClick={async () => {
              if (!study) return;
              try {
                const res = await fetch("/api/paper", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ studyId: study.id }),
                });
                if (!res.ok) {
                  const body = await res.json().catch(() => ({}));
                  alert(body?.error ?? `创建失败 (HTTP ${res.status})`);
                  return;
                }
                const { portfolio } = (await res.json()) as {
                  portfolio: { id: string };
                };
                router.push(`/paper?id=${portfolio.id}`);
              } catch (err) {
                alert(err instanceof Error ? err.message : "创建失败");
              }
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            转 Paper 组合
          </Button>
          {study && study.status === "COMPLETED" && result && (
            <ShareStudyButton studyId={study.id} />
          )}
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center gap-1.5"
            onClick={() => {
              if (!study) return;
              router.push(`/studies/new?cloneFrom=${study.id}`);
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            复制并修改
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "overview" && (
        <>
          {/* Phase 3.1: data-quality / bias panel always at the top of the
              overview so users can't miss the survivorship and factor-type
              caveats. */}
          <DataQualityCard dq={result.dataQuality} factorMix={study.factorMix} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-5">
              <AIConclusionCard
                result={result}
                generating={generatingConclusion}
                generationError={conclusionError}
                onRetry={() => {
                  conclusionTriedRef.current = true;
                  void generateConclusion();
                }}
              />
              <MetricsTable result={result} />
            </div>
            <div className="space-y-5">
              <ChartCard title="累计收益（基准化为 100）">
                <EquityChart data={result.equityCurve} />
              </ChartCard>
              <ChartCard title="回撤（%）">
                <DrawdownChart data={result.drawdown} height={180} />
              </ChartCard>
            </div>
          </div>
          <AIKeyPoints
            points={result.aiExplanation ?? []}
            generating={generatingConclusion}
          />

          <BestWorstMonthsCard monthly={result.monthlyReturns} />
        </>
      )}

      {activeTab === "performance" && (
        <div className="space-y-5">
          <ChartCard title="累计收益（基准化为 100）">
            <EquityChart data={result.equityCurve} height={300} />
          </ChartCard>
          <ChartCard title="回撤曲线（%）">
            <DrawdownChart data={result.drawdown} height={260} />
          </ChartCard>
          <ChartCard title="年度收益（%）">
            <AnnualReturnsChart data={result.annualReturns} height={260} />
          </ChartCard>
          <AnnualReturnsTable data={result.annualReturns} />
        </div>
      )}

      {activeTab === "holdings" && (
        <div className="space-y-5">
          <SectorAllocationCard series={result.sectorAllocation} />
          <FactorBreakdownCard data={result.factorBreakdown} />
          <RebalanceHistoryCard history={result.rebalanceHistory} />
        </div>
      )}

      {activeTab === "analysis" && (
        <div className="space-y-5">
          <FactorDiagnostics data={result.factorDiagnostics} />
          <FactorCoverageCard data={result.factorCoverage} />
          <BenchmarkAttributionCard data={result.benchmarkAttribution} />
          <RobustnessCard data={result.robustness} />
          <ParameterSensitivityCard data={result.parameterSensitivity} />
        </div>
      )}

      {activeTab === "debate" && (
        <DebatePanel
          studyId={studyId}
          hasCompletedResult={study.status === "COMPLETED" && !!result}
        />
      )}

      <div className="pb-4" />
    </div>
  );
}
