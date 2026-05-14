// Phase 15 — user-level calibration dashboard.
//
// Aggregate "are my research predictions actually playing out?" across all
// the user's paper portfolios. Renders:
//   * Headline median metrics (hitRate, trackingError, CAGR gap)
//   * Per-portfolio table with quick links to the review page
//   * A scatter plot of expected vs actual CAGR — diagonal = perfect prediction

"use client";

import useSWR from "swr";
import Link from "next/link";
import {
  ArrowRight,
  Target,
  Loader2,
  Activity,
  ArrowLeft,
} from "lucide-react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
  Label,
} from "recharts";

interface CalibrationItem {
  id: string;
  title: string;
  sourceStudyId: string;
  sourceRebalanceDate: string;
  benchmark: string;
  createdAt: string;
  review: {
    monthsObserved: number;
    hitRate: number | null;
    trackingError: number | null;
    actualCagr: number | null;
    expectedCagr: number | null;
    executionRate: number | null;
    computedAt: string | null;
  } | null;
}

interface CalibrationResponse {
  items: CalibrationItem[];
  aggregate: {
    totalPortfolios: number;
    portfoliosWithReview: number;
    portfoliosTracking: number;
    medianHitRate: number | null;
    medianTrackingError: number | null;
    medianCagrGap: number | null;
  };
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

function fmtPct(v: number | null, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export default function CalibrationDashboard() {
  const { data, error, isLoading } = useSWR<CalibrationResponse>(
    "/api/profile/calibration",
    fetcher,
  );

  const items = data?.items ?? [];
  const scatterPoints = items
    .filter(
      (i) =>
        i.review &&
        i.review.monthsObserved >= 1 &&
        i.review.actualCagr != null &&
        i.review.expectedCagr != null,
    )
    .map((i) => ({
      x: (i.review!.expectedCagr ?? 0) * 100,
      y: (i.review!.actualCagr ?? 0) * 100,
      title: i.title,
      months: i.review!.monthsObserved,
    }));

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-3 w-3" />
        返回仪表盘
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-gray-900 inline-flex items-center gap-2">
          <Target className="h-5 w-5 text-blue-600" />
          我的研究校准
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          所有活跃 Paper 组合的「实际表现 vs 回测预期」一览。
          帮你回答：我的研究到底准不准？
        </p>
      </div>

      {isLoading && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中…
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          加载失败：{(error as Error).message}
        </div>
      )}

      {data && data.aggregate.totalPortfolios === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <Target className="h-6 w-6 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-900 mb-1">
            还没有活跃 Paper 组合
          </p>
          <p className="text-xs text-gray-500 mb-4">
            先把研究转成 Paper 组合，校准数据会自动汇总到这里
          </p>
          <Link
            href="/paper"
            className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
          >
            前往 Paper 组合
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {data && data.aggregate.totalPortfolios > 0 && (
        <>
          {/* Headline aggregates */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <AggregateCard
              label="活跃组合"
              value={`${data.aggregate.totalPortfolios}`}
              hint={`其中 ${data.aggregate.portfoliosWithReview} 已有复盘`}
            />
            <AggregateCard
              label="中位 Hit Rate"
              value={fmtPct(data.aggregate.medianHitRate, 0)}
              tone={
                data.aggregate.medianHitRate != null &&
                data.aggregate.medianHitRate >= 0.55
                  ? "good"
                  : "neutral"
              }
              hint="50% = 随机"
            />
            <AggregateCard
              label="中位跟踪误差"
              value={fmtPct(data.aggregate.medianTrackingError, 1)}
              hint="年化，低 = 接近预期"
            />
            <AggregateCard
              label="中位 CAGR 偏差"
              value={
                data.aggregate.medianCagrGap == null
                  ? "—"
                  : `${data.aggregate.medianCagrGap >= 0 ? "+" : ""}${(data.aggregate.medianCagrGap * 100).toFixed(1)}pp`
              }
              tone={
                data.aggregate.medianCagrGap != null
                  ? data.aggregate.medianCagrGap >= 0
                    ? "good"
                    : "bad"
                  : "neutral"
              }
              hint="实际 - 回测"
            />
          </div>

          {/* Scatter plot */}
          {scatterPoints.length >= 1 ? (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-600" />
                  预测 vs 实际散点
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  对角线 = 完美预测；点在对角线上方 = 实际优于预期
                </p>
              </div>
              <div className="px-4 py-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 30 }}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      tick={{ fill: "#9ca3af", fontSize: 10 }}
                      label={{
                        value: "回测预期 CAGR (%)",
                        position: "insideBottom",
                        offset: -15,
                        style: { fontSize: 11, fill: "#6b7280" },
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      tick={{ fill: "#9ca3af", fontSize: 10 }}
                      label={{
                        value: "实际 CAGR (%)",
                        angle: -90,
                        position: "insideLeft",
                        offset: 10,
                        style: { fontSize: 11, fill: "#6b7280" },
                      }}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const p = payload[0].payload as (typeof scatterPoints)[number];
                        return (
                          <div className="bg-white border border-gray-200 rounded shadow-sm px-2.5 py-1.5 text-xs">
                            <p className="font-medium text-gray-900 mb-0.5">
                              {p.title}
                            </p>
                            <p className="text-gray-600">
                              预期 {p.x.toFixed(1)}% / 实际 {p.y.toFixed(1)}% (
                              {p.months}m)
                            </p>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine
                      segment={[
                        { x: -50, y: -50 },
                        { x: 100, y: 100 },
                      ]}
                      stroke="#9ca3af"
                      strokeDasharray="4 4"
                    />
                    <Scatter data={scatterPoints} fill="#2563eb" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
              组合尚未积累足够月度数据点画散点图。等下次月度调仓 cron 跑过后再回来查看。
            </div>
          )}

          {/* Per-portfolio table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
                逐组合校准
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50">
                    <th className="py-2 px-4 text-xs text-gray-500 text-left font-medium">
                      组合
                    </th>
                    <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">
                      已观察
                    </th>
                    <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">
                      Hit Rate
                    </th>
                    <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">
                      实际 / 预期
                    </th>
                    <th className="py-2 px-3 text-xs text-gray-500 text-right font-medium">
                      跟踪误差
                    </th>
                    <th className="py-2 px-3 text-xs text-gray-500 text-center font-medium">
                      详情
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 px-4 text-sm text-gray-900 max-w-[220px] truncate">
                        {i.title}
                      </td>
                      <td className="py-2 px-3 text-sm text-gray-600 text-right">
                        {i.review ? `${i.review.monthsObserved}m` : "—"}
                      </td>
                      <td className="py-2 px-3 text-sm text-gray-700 text-right">
                        {fmtPct(i.review?.hitRate ?? null, 0)}
                      </td>
                      <td className="py-2 px-3 text-sm text-gray-700 text-right">
                        {i.review
                          ? `${fmtPct(i.review.actualCagr, 1)} / ${fmtPct(i.review.expectedCagr, 1)}`
                          : "—"}
                      </td>
                      <td className="py-2 px-3 text-sm text-gray-600 text-right">
                        {fmtPct(i.review?.trackingError ?? null, 1)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Link
                          href={`/paper/${i.id}/review`}
                          className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          查看
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AggregateCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const valueClass =
    tone === "good"
      ? "text-green-700"
      : tone === "bad"
        ? "text-red-700"
        : "text-gray-900";
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${valueClass}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}
