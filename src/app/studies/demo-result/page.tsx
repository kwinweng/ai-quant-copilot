"use client";
import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EQUITY_CURVE,
  DRAWDOWN_CURVE,
  ANNUAL_RETURNS,
  FACTOR_DIAGNOSTICS,
  DATA_COVERAGE,
  RESULT_METRICS,
} from "@/data/results";
import { Download, Share2, Sparkles, ArrowLeft } from "lucide-react";
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

const TABS = [
  { key: "overview", label: "概览" },
  { key: "performance", label: "表现" },
  { key: "risk", label: "风险" },
  { key: "analysis", label: "分析" },
  { key: "holdings", label: "持仓" },
  { key: "trades", label: "交易" },
  { key: "logs", label: "日志" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const AI_CONCLUSION =
  "质量 + 价值组合策略相对 SPY 展现出统计意义上稳健的超额收益（CAGR +2.3%），且风险调整后回报更优（Sharpe 0.91 vs 0.78）。质量因子有效过滤价值陷阱，2022 年回撤期超越 SPY 340 个基点。68% 的换手率在 5 bps 交易成本假设下尚可控。建议下一步加入动量叠加，以减少趋势反转期的来回震荡。";

const AI_KEY_POINTS = [
  "稳健超额收益：CAGR 12.4% vs SPY 10.1%，年化 Alpha +2.3%",
  "风险调整后回报更优：Sharpe 0.91 / Sortino 1.32，均显著优于 SPY",
  "下行控制更好：Max Drawdown −21.3% vs SPY −24.7%，2022 年抗跌 340 bps",
  "因子诊断合理：质量 IC 0.042 / 价值 IC 0.031 / 复合因子 IC 0.051（IC IR 0.84）",
  "实施成本可控：68% 年换手率 × 5 bps 交易成本 ≈ 34 bps 年化损耗",
];

const SORTINO_STRATEGY = 1.32;
const SORTINO_SPY = 1.05;

const MOCK_HOLDINGS = [
  { ticker: "NVDA", sector: "信息技术", weight: 3.0, holdDays: 252 },
  { ticker: "MSFT", sector: "信息技术", weight: 2.95, holdDays: 365 },
  { ticker: "AAPL", sector: "信息技术", weight: 2.88, holdDays: 280 },
  { ticker: "META", sector: "通信服务", weight: 2.72, holdDays: 180 },
  { ticker: "GOOGL", sector: "通信服务", weight: 2.65, holdDays: 365 },
  { ticker: "BRK.B", sector: "金融", weight: 2.51, holdDays: 365 },
  { ticker: "JPM", sector: "金融", weight: 2.42, holdDays: 200 },
  { ticker: "V", sector: "金融", weight: 2.38, holdDays: 365 },
  { ticker: "UNH", sector: "医疗保健", weight: 2.27, holdDays: 365 },
  { ticker: "LLY", sector: "医疗保健", weight: 2.18, holdDays: 90 },
];

const MOCK_TRADES = [
  { date: "2024-01-02", side: "买入", ticker: "NVDA", shares: 240, value: "$89,640" },
  { date: "2024-01-02", side: "卖出", ticker: "INTC", shares: 1500, value: "$52,800" },
  { date: "2024-01-02", side: "买入", ticker: "LLY", shares: 80, value: "$46,720" },
  { date: "2024-01-02", side: "卖出", ticker: "PFE", shares: 1800, value: "$51,840" },
  { date: "2023-10-02", side: "买入", ticker: "META", shares: 180, value: "$54,180" },
  { date: "2023-10-02", side: "卖出", ticker: "DIS", shares: 600, value: "$48,900" },
  { date: "2023-07-03", side: "买入", ticker: "AVGO", shares: 60, value: "$52,140" },
  { date: "2023-07-03", side: "卖出", ticker: "GE", shares: 480, value: "$52,704" },
];

const MOCK_LOGS = [
  { ts: "14:25:48", msg: "✓ 研究执行完成，总耗时 4 分 17 秒", type: "success" as const },
  { ts: "14:25:47", msg: "  报告生成完成 (1 / 1 报告)", type: "info" as const },
  { ts: "14:25:42", msg: "  AI 综合分析归因", type: "info" as const },
  { ts: "14:25:38", msg: "▶ 步骤 8/8: 生成 AI 报告", type: "start" as const },
  { ts: "14:25:32", msg: "  IR / Calmar 计算完成", type: "info" as const },
  { ts: "14:25:25", msg: "  Max Drawdown 计算完成", type: "info" as const },
  { ts: "14:25:10", msg: "▶ 步骤 7/8: 计算风险指标", type: "start" as const },
  { ts: "14:24:43", msg: "  回测 2024 年完成", type: "info" as const },
  { ts: "14:23:38", msg: "  回测 2018 年完成", type: "info" as const },
];

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
  strategyNum?: number;
  spyNum?: number;
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

function MetricsTable() {
  const m = RESULT_METRICS;
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
                SPY
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
              label="Sortino"
              strategy={SORTINO_STRATEGY}
              spy={SORTINO_SPY}
              strategyNum={SORTINO_STRATEGY}
              spyNum={SORTINO_SPY}
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
            <MetricRow
              label="Calmar"
              strategy={m.strategy.calmar}
              spy={m.spy.calmar}
            />
            <MetricRow
              label="月度胜率"
              strategy={`${m.strategy.winRate}%`}
              spy="—"
            />
            <MetricRow
              label="换手率"
              strategy={`${m.strategy.turnover}%`}
              spy="—"
            />
            <MetricRow
              label="Beta"
              strategy={m.strategy.beta}
              spy={m.spy.beta}
            />
            <MetricRow
              label="Alpha (年化)"
              strategy={`+${m.strategy.alpha}%`}
              spy="0%"
              strategyNum={m.strategy.alpha}
              spyNum={0}
            />
            <MetricRow
              label="IR"
              strategy={m.strategy.informationRatio}
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

function EquityChart({ height = 240 }: { height?: number }) {
  const sample = EQUITY_CURVE.filter((_, i) => i % 2 === 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={sample}
        margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
        <XAxis
          dataKey="date"
          tick={chartTickStyle}
          tickLine={false}
          interval={3}
          axisLine={{ stroke: chartGrid }}
        />
        <YAxis
          tick={chartTickStyle}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
        />
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
          name="SPY"
          strokeDasharray="4 2"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function DrawdownChart({ height = 200 }: { height?: number }) {
  const sample = DRAWDOWN_CURVE.filter((_, i) => i % 2 === 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={sample}
        margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
        <XAxis
          dataKey="date"
          tick={chartTickStyle}
          tickLine={false}
          interval={3}
          axisLine={{ stroke: chartGrid }}
        />
        <YAxis
          tick={chartTickStyle}
          tickLine={false}
          axisLine={false}
        />
        <ReferenceLine y={0} stroke="#d1d5db" />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
        />
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
          name="SPY"
          strokeDasharray="4 2"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function AnnualReturnsChart({ height = 220 }: { height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={ANNUAL_RETURNS}
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
        <Bar
          dataKey="strategy"
          fill={STRATEGY_COLOR}
          name="策略"
          radius={[2, 2, 0, 0]}
        />
        <Bar
          dataKey="spy"
          fill="#cbd5e1"
          name="SPY"
          radius={[2, 2, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function FactorDiagnostics() {
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
            {FACTOR_DIAGNOSTICS.map((f) => (
              <tr
                key={f.factor}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="py-2 text-sm text-gray-900 font-medium">
                  {f.factor}
                </td>
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

function DataCoverageBlock() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">数据覆盖率</h3>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        {DATA_COVERAGE.map((d) => (
          <div key={d.metric}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-700">{d.metric}</span>
              <span className="text-gray-500">{d.coverage}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${d.coverage}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{d.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HoldingsTable() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          当前持仓（Top 10）
        </h3>
        <span className="text-xs text-gray-400">截至 2024-01-01</span>
      </div>
      <div className="px-4 py-2">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 text-xs text-gray-400 text-left font-medium">
                标的
              </th>
              <th className="py-2 text-xs text-gray-400 text-left font-medium">
                行业
              </th>
              <th className="py-2 text-xs text-gray-400 text-right font-medium">
                权重
              </th>
              <th className="py-2 text-xs text-gray-400 text-right font-medium">
                持有天数
              </th>
            </tr>
          </thead>
          <tbody>
            {MOCK_HOLDINGS.map((h) => (
              <tr
                key={h.ticker}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="py-2 text-sm text-gray-900 font-mono font-medium">
                  {h.ticker}
                </td>
                <td className="py-2 text-sm text-gray-600">{h.sector}</td>
                <td className="py-2 text-sm text-gray-900 text-right font-semibold">
                  {h.weight}%
                </td>
                <td className="py-2 text-sm text-gray-500 text-right">
                  {h.holdDays}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TradesTable() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">近期交易</h3>
        <span className="text-xs text-gray-400">最新再平衡日</span>
      </div>
      <div className="px-4 py-2">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 text-xs text-gray-400 text-left font-medium">
                日期
              </th>
              <th className="py-2 text-xs text-gray-400 text-left font-medium">
                方向
              </th>
              <th className="py-2 text-xs text-gray-400 text-left font-medium">
                标的
              </th>
              <th className="py-2 text-xs text-gray-400 text-right font-medium">
                股数
              </th>
              <th className="py-2 text-xs text-gray-400 text-right font-medium">
                金额
              </th>
            </tr>
          </thead>
          <tbody>
            {MOCK_TRADES.map((t, i) => (
              <tr
                key={i}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="py-2 text-sm text-gray-700 font-mono">
                  {t.date}
                </td>
                <td className="py-2 text-sm">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                      t.side === "买入"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {t.side}
                  </span>
                </td>
                <td className="py-2 text-sm text-gray-900 font-mono font-medium">
                  {t.ticker}
                </td>
                <td className="py-2 text-sm text-gray-700 text-right">
                  {t.shares}
                </td>
                <td className="py-2 text-sm text-gray-900 text-right font-mono">
                  {t.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogsBlock() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">执行日志</h3>
      </div>
      <div className="px-3 py-3 bg-gray-900 font-mono text-xs leading-relaxed max-h-[400px] overflow-y-auto">
        {MOCK_LOGS.map((log, i) => (
          <div key={i} className="flex gap-2 px-1 py-0.5">
            <span className="text-gray-500 shrink-0">[{log.ts}]</span>
            <span
              className={
                log.type === "success"
                  ? "text-green-400"
                  : log.type === "start"
                  ? "text-blue-300"
                  : "text-gray-300"
              }
            >
              {log.msg}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AIConclusionCard() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-blue-100 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-900">AI 结论</h3>
        <span className="text-xs text-gray-500 ml-auto">GPT-4o (mock)</span>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm text-gray-700 leading-relaxed">{AI_CONCLUSION}</p>
      </div>
    </div>
  );
}

export default function DemoResult() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

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
            <h1 className="text-xl font-semibold text-gray-900">
              Quality + Value 组合因子
            </h1>
            <Badge variant="success">已完成</Badge>
            <span className="text-xs text-gray-400 font-mono">
              STU-2024-1205-001
            </span>
          </div>
          <p className="text-sm text-gray-500">
            Russell 1000 · 2014–2024 · 季度再平衡 · 5 bps 交易成本
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

      {/* Tab content */}
      {activeTab === "overview" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left column */}
            <div className="space-y-5">
              <AIConclusionCard />
              <MetricsTable />
            </div>
            {/* Right column */}
            <div className="space-y-5">
              <ChartCard title="累计收益（基准化为 100）">
                <EquityChart />
              </ChartCard>
              <ChartCard title="回撤（%）">
                <DrawdownChart height={180} />
              </ChartCard>
              <ChartCard title="年度收益（%）">
                <AnnualReturnsChart height={200} />
              </ChartCard>
            </div>
          </div>

          {/* AI key points */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">
                AI 解释要点
              </h3>
            </div>
            <ul className="px-4 py-3 space-y-2">
              {AI_KEY_POINTS.map((point, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-sm text-gray-700"
                >
                  <span className="text-blue-500 shrink-0 mt-0.5">•</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Next experiments */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
                下一步实验
              </h3>
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
                  + 加入动量叠加
                </Button>
              </Link>
              <Link href="/studies/new">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-200 text-blue-600 hover:bg-blue-50"
                >
                  + 测试月度再平衡
                </Button>
              </Link>
              <Link href="/studies/new">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-200 text-blue-600 hover:bg-blue-50"
                >
                  + 扩展到中盘股
                </Button>
              </Link>
            </div>
          </div>
        </>
      )}

      {activeTab === "performance" && (
        <div className="space-y-5">
          <ChartCard title="累计收益（基准化为 100）">
            <EquityChart height={300} />
          </ChartCard>
          <ChartCard title="年度收益（%）">
            <AnnualReturnsChart height={260} />
          </ChartCard>
          <MetricsTable />
        </div>
      )}

      {activeTab === "risk" && (
        <div className="space-y-5">
          <ChartCard title="回撤曲线（%）">
            <DrawdownChart height={300} />
          </ChartCard>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <MetricsTable />
            <DataCoverageBlock />
          </div>
        </div>
      )}

      {activeTab === "analysis" && (
        <div className="space-y-5">
          <FactorDiagnostics />
          <DataCoverageBlock />
        </div>
      )}

      {activeTab === "holdings" && (
        <div className="space-y-5">
          <HoldingsTable />
        </div>
      )}

      {activeTab === "trades" && (
        <div className="space-y-5">
          <TradesTable />
        </div>
      )}

      {activeTab === "logs" && (
        <div className="space-y-5">
          <LogsBlock />
        </div>
      )}

      <div className="pb-4" />
    </div>
  );
}
