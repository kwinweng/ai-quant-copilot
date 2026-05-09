"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Download,
  Share2,
  Sparkles,
  ArrowLeft,
  Loader2,
  RefreshCw,
} from "lucide-react";
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
}

interface ApiStudy {
  id: string;
  title: string;
  status: string;
  universe: string;
  startDate: string;
  endDate: string;
  rebalance: string;
  benchmark: string;
  txCostBps: number;
  result: ApiResult | null;
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });

const TABS = [
  { key: "overview", label: "概览" },
  { key: "performance", label: "表现" },
  { key: "risk", label: "风险" },
  { key: "analysis", label: "分析" },
  { key: "logs", label: "日志" },
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
              <th className="py-2 text-xs text-gray-400 text-left font-medium">
                指标
              </th>
              <th className="py-2 text-xs text-gray-700 text-right font-medium">
                策略
              </th>
              <th className="py-2 text-xs text-gray-400 text-right font-medium">
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
              strategy={`+${m.strategy.alpha}%`}
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

function EquityChart({
  data,
  height = 240,
}: {
  data: ApiResult["equityCurve"];
  height?: number;
}) {
  const sample = data.filter((_, i) => i % 2 === 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={sample} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
        <XAxis
          dataKey="date"
          tick={chartTickStyle}
          tickLine={false}
          interval={3}
          axisLine={{ stroke: chartGrid }}
        />
        <YAxis tick={chartTickStyle} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey="strategy"
          stroke={STRATEGY_COLOR}
          strokeWidth={2}
          dot={false}
          name="策略"
        />
        <Line
          type="monotone"
          dataKey="spy"
          stroke={SPY_COLOR}
          strokeWidth={1.5}
          dot={false}
          name="基准"
          strokeDasharray="4 2"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function DrawdownChart({
  data,
  height = 200,
}: {
  data: ApiResult["drawdown"];
  height?: number;
}) {
  const sample = data.filter((_, i) => i % 2 === 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={sample} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
        <XAxis
          dataKey="date"
          tick={chartTickStyle}
          tickLine={false}
          interval={3}
          axisLine={{ stroke: chartGrid }}
        />
        <YAxis tick={chartTickStyle} tickLine={false} axisLine={false} />
        <ReferenceLine y={0} stroke="#d1d5db" />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey="strategy"
          stroke={STRATEGY_COLOR}
          strokeWidth={2}
          dot={false}
          name="策略"
        />
        <Line
          type="monotone"
          dataKey="spy"
          stroke={SPY_COLOR}
          strokeWidth={1.5}
          dot={false}
          name="基准"
          strokeDasharray="4 2"
        />
      </LineChart>
    </ResponsiveContainer>
  );
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
              <th className="py-2 text-xs text-gray-400 text-left font-medium">
                因子
              </th>
              <th className="py-2 text-xs text-gray-400 text-right font-medium">
                IC
              </th>
              <th className="py-2 text-xs text-gray-400 text-right font-medium">
                IC IR
              </th>
              <th className="py-2 text-xs text-gray-400 text-right font-medium hidden sm:table-cell">
                Q1 收益
              </th>
              <th className="py-2 text-xs text-gray-400 text-right font-medium hidden sm:table-cell">
                Q5 收益
              </th>
              <th className="py-2 text-xs text-gray-400 text-right font-medium">
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
            "Claude Sonnet 4.6"
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

export default function ResultPage() {
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
          >
            <Download className="h-3.5 w-3.5" />
            导出 PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-gray-200 text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
          >
            <Share2 className="h-3.5 w-3.5" />
            分享
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
              <ChartCard title="年度收益（%）">
                <AnnualReturnsChart data={result.annualReturns} height={200} />
              </ChartCard>
            </div>
          </div>
          <AIKeyPoints
            points={result.aiExplanation ?? []}
            generating={generatingConclusion}
          />

          {/* Next experiments */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">下一步实验</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                基于 AI 分析，推荐以下后续研究方向
              </p>
            </div>
            <div className="px-4 py-3 flex flex-wrap gap-2">
              <Link href="/studies/new">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-200 text-blue-600 hover:bg-blue-50"
                >
                  + 新研究变体
                </Button>
              </Link>
            </div>
          </div>
        </>
      )}

      {activeTab === "performance" && (
        <div className="space-y-5">
          <ChartCard title="累计收益（基准化为 100）">
            <EquityChart data={result.equityCurve} height={300} />
          </ChartCard>
          <ChartCard title="年度收益（%）">
            <AnnualReturnsChart data={result.annualReturns} height={260} />
          </ChartCard>
          <MetricsTable result={result} />
        </div>
      )}

      {activeTab === "risk" && (
        <div className="space-y-5">
          <ChartCard title="回撤曲线（%）">
            <DrawdownChart data={result.drawdown} height={300} />
          </ChartCard>
          <MetricsTable result={result} />
        </div>
      )}

      {activeTab === "analysis" && (
        <div className="space-y-5">
          <FactorDiagnostics data={result.factorDiagnostics} />
        </div>
      )}

      {activeTab === "logs" && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">执行日志</h3>
          </div>
          <div className="px-4 py-3 text-sm text-gray-500">
            日志数据在 Stage 2 中将持久化到 StudyProgress.logs；本视图为占位。
          </div>
        </div>
      )}

      <div className="pb-4" />
    </div>
  );
}
