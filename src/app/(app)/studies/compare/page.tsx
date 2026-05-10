"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, GitCompare, Loader2 } from "lucide-react";

type StudyStatus =
  | "DRAFT"
  | "PLANNED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

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

interface ListStudy {
  id: string;
  title: string;
  hypothesis: string;
  universe: string;
  startDate: string;
  endDate: string;
  rebalance: string;
  benchmark: string;
  txCostBps: number;
  status: StudyStatus;
  archived: boolean;
  result: { conclusion: string; metrics: { strategy: MetricsBlock; spy: MetricsBlock } | null } | null;
}

interface FullResult {
  metrics: { strategy: MetricsBlock; spy: MetricsBlock };
  equityCurve: { date: string; strategy: number; spy: number }[];
  drawdown: { date: string; strategy: number; spy: number }[];
}

interface FullStudy extends ListStudy {
  result: (ListStudy["result"] & FullResult) | null;
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });

function fmtNum(n: number | null | undefined, suffix = "", digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

// Side-by-side metrics comparison row.
function MetricRow({
  label,
  a,
  b,
  suffix = "",
  digits = 2,
  // higherIsBetter=true → green when value is higher; for max drawdown
  // higherIsBetter=false (more negative is worse).
  higherIsBetter = true,
}: {
  label: string;
  a: number | null | undefined;
  b: number | null | undefined;
  suffix?: string;
  digits?: number;
  higherIsBetter?: boolean;
}) {
  const aWins =
    a != null && b != null
      ? higherIsBetter
        ? a > b
        : a > b // for maxDrawdown -10 > -20, so larger is better
      : false;
  const bWins =
    a != null && b != null
      ? higherIsBetter
        ? b > a
        : b > a
      : false;
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-2 px-3 text-sm text-gray-700 font-medium">{label}</td>
      <td
        className={`py-2 px-3 text-sm text-right font-semibold ${
          aWins ? "text-green-700" : "text-gray-900"
        }`}
      >
        {fmtNum(a, suffix, digits)}
      </td>
      <td
        className={`py-2 px-3 text-sm text-right font-semibold ${
          bWins ? "text-green-700" : "text-gray-900"
        }`}
      >
        {fmtNum(b, suffix, digits)}
      </td>
    </tr>
  );
}

function ParamRow({
  label,
  a,
  b,
}: {
  label: string;
  a: string | number;
  b: string | number;
}) {
  const same = String(a) === String(b);
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-2 px-3 text-sm text-gray-500 font-medium">{label}</td>
      <td
        className={`py-2 px-3 text-sm text-right ${same ? "text-gray-400" : "text-gray-900 font-medium"}`}
      >
        {a}
      </td>
      <td
        className={`py-2 px-3 text-sm text-right ${same ? "text-gray-400" : "text-gray-900 font-medium"}`}
      >
        {b}
      </td>
    </tr>
  );
}

function StudyPicker({
  label,
  studies,
  selectedId,
  excludeId,
  onChange,
}: {
  label: string;
  studies: ListStudy[];
  selectedId: string;
  excludeId: string;
  onChange: (id: string) => void;
}) {
  const eligible = studies.filter(
    (s) => s.status === "COMPLETED" && s.id !== excludeId,
  );
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">— 选择研究 —</option>
        {eligible.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
    </div>
  );
}

// Merge two equity curves on date so Recharts can draw both lines on one axis.
function mergeCurves(
  a: { date: string; strategy: number }[],
  b: { date: string; strategy: number }[],
) {
  const map = new Map<string, { date: string; a?: number; b?: number }>();
  for (const p of a) {
    map.set(p.date, { date: p.date, a: p.strategy });
  }
  for (const p of b) {
    const existing = map.get(p.date);
    if (existing) existing.b = p.strategy;
    else map.set(p.date, { date: p.date, b: p.strategy });
  }
  return Array.from(map.values()).sort((x, y) => x.date.localeCompare(y.date));
}

function CompareInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialA = searchParams.get("a") ?? "";
  const initialB = searchParams.get("b") ?? "";

  const [aId, setAId] = useState(initialA);
  const [bId, setBId] = useState(initialB);

  // Keep the URL in sync — handy for sharing direct compare links.
  useEffect(() => {
    const params = new URLSearchParams();
    if (aId) params.set("a", aId);
    if (bId) params.set("b", bId);
    const qs = params.toString();
    router.replace(qs ? `/studies/compare?${qs}` : "/studies/compare");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aId, bId]);

  const { data: listData, isLoading: listLoading, error: listErr } = useSWR<{
    studies: ListStudy[];
  }>("/api/studies", fetcher);
  const studies = listData?.studies ?? [];

  const { data: aData } = useSWR<{ study: FullStudy }>(
    aId ? `/api/studies/${aId}` : null,
    fetcher,
  );
  const { data: bData } = useSWR<{ study: FullStudy }>(
    bId ? `/api/studies/${bId}` : null,
    fetcher,
  );
  const a = aData?.study;
  const b = bData?.study;

  const equityMerged = useMemo(
    () =>
      a?.result?.equityCurve && b?.result?.equityCurve
        ? mergeCurves(a.result.equityCurve, b.result.equityCurve)
        : [],
    [a, b],
  );
  const drawdownMerged = useMemo(
    () =>
      a?.result?.drawdown && b?.result?.drawdown
        ? mergeCurves(a.result.drawdown, b.result.drawdown)
        : [],
    [a, b],
  );

  const aMetrics = a?.result?.metrics?.strategy;
  const bMetrics = b?.result?.metrics?.strategy;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-600 hover:bg-gray-100"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <GitCompare className="h-5 w-5 text-blue-600" />
              研究对比
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              选择两个已完成的研究，查看指标、权益曲线和回撤的差异
            </p>
          </div>
        </div>
      </div>

      {listLoading && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 flex items-center justify-center text-gray-500 text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载研究列表…
        </div>
      )}

      {listErr && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          加载失败：{(listErr as Error).message}
        </div>
      )}

      {!listLoading && !listErr && (
        <Card className="bg-white border-gray-200">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <StudyPicker
              label="研究 A"
              studies={studies}
              selectedId={aId}
              excludeId={bId}
              onChange={setAId}
            />
            <StudyPicker
              label="研究 B"
              studies={studies}
              selectedId={bId}
              excludeId={aId}
              onChange={setBId}
            />
          </CardContent>
        </Card>
      )}

      {!listLoading &&
        !listErr &&
        studies.filter((s) => s.status === "COMPLETED").length < 2 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            需要至少 2 个已完成的研究才能对比。
            <Link href="/studies/new" className="ml-2 text-blue-600 hover:underline">
              创建新研究 →
            </Link>
          </div>
        )}

      {(aId || bId) && (!a || !b) && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 flex items-center justify-center text-gray-500 text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载研究详情…
        </div>
      )}

      {a && b && a.result && b.result && (
        <>
          <Card className="bg-white border-gray-200">
            <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
              <CardTitle className="text-sm font-semibold text-gray-900">
                指标对比
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/60">
                    <th className="py-2 px-3 text-xs text-gray-400 text-left font-medium">
                      指标
                    </th>
                    <th className="py-2 px-3 text-xs text-gray-700 text-right font-medium">
                      A · {a.title}
                    </th>
                    <th className="py-2 px-3 text-xs text-gray-700 text-right font-medium">
                      B · {b.title}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <MetricRow label="CAGR" a={aMetrics?.cagr} b={bMetrics?.cagr} suffix="%" />
                  <MetricRow label="Sharpe" a={aMetrics?.sharpe} b={bMetrics?.sharpe} />
                  <MetricRow
                    label="Max Drawdown"
                    a={aMetrics?.maxDrawdown}
                    b={bMetrics?.maxDrawdown}
                    suffix="%"
                    higherIsBetter={false}
                  />
                  <MetricRow label="Calmar" a={aMetrics?.calmar} b={bMetrics?.calmar} />
                  <MetricRow label="年化波动率" a={aMetrics?.annualVol} b={bMetrics?.annualVol} suffix="%" higherIsBetter={false} />
                  <MetricRow label="Beta" a={aMetrics?.beta} b={bMetrics?.beta} />
                  <MetricRow label="Alpha (年化)" a={aMetrics?.alpha} b={bMetrics?.alpha} suffix="%" />
                  <MetricRow
                    label="IR"
                    a={aMetrics?.informationRatio}
                    b={bMetrics?.informationRatio}
                  />
                  <MetricRow
                    label="月度胜率"
                    a={aMetrics?.winRate}
                    b={bMetrics?.winRate}
                    suffix="%"
                  />
                  <MetricRow
                    label="年化换手率"
                    a={aMetrics?.turnover}
                    b={bMetrics?.turnover}
                    suffix="%"
                    higherIsBetter={false}
                  />
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-200">
            <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
              <CardTitle className="text-sm font-semibold text-gray-900">
                参数差异
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/60">
                    <th className="py-2 px-3 text-xs text-gray-400 text-left font-medium">
                      字段
                    </th>
                    <th className="py-2 px-3 text-xs text-gray-700 text-right font-medium">
                      A
                    </th>
                    <th className="py-2 px-3 text-xs text-gray-700 text-right font-medium">
                      B
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <ParamRow label="股票池" a={a.universe} b={b.universe} />
                  <ParamRow
                    label="开始日期"
                    a={a.startDate.slice(0, 10)}
                    b={b.startDate.slice(0, 10)}
                  />
                  <ParamRow
                    label="结束日期"
                    a={a.endDate.slice(0, 10)}
                    b={b.endDate.slice(0, 10)}
                  />
                  <ParamRow label="再平衡频率" a={a.rebalance} b={b.rebalance} />
                  <ParamRow label="基准" a={a.benchmark} b={b.benchmark} />
                  <ParamRow label="交易成本" a={`${a.txCostBps} bps`} b={`${b.txCostBps} bps`} />
                </tbody>
              </table>
            </CardContent>
          </Card>

          {equityMerged.length > 0 && (
            <Card className="bg-white border-gray-200">
              <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
                <CardTitle className="text-sm font-semibold text-gray-900">
                  权益曲线叠加
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-2">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={equityMerged}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Line
                      type="monotone"
                      dataKey="a"
                      name={`A · ${a.title}`}
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="b"
                      name={`B · ${b.title}`}
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {drawdownMerged.length > 0 && (
            <Card className="bg-white border-gray-200">
              <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
                <CardTitle className="text-sm font-semibold text-gray-900">
                  回撤对比
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-2">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={drawdownMerged}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Area
                      type="monotone"
                      dataKey="a"
                      name={`A · ${a.title}`}
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.15}
                    />
                    <Area
                      type="monotone"
                      dataKey="b"
                      name={`B · ${b.title}`}
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.15}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={<div className="p-6 text-sm text-gray-500">加载中…</div>}
    >
      <CompareInner />
    </Suspense>
  );
}
