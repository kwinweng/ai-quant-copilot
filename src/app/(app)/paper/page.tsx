"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Loader2,
  TrendingUp,
  TrendingDown,
  Archive,
  Sparkles,
} from "lucide-react";

interface PaperPortfolio {
  id: string;
  title: string;
  sourceStudyId: string;
  sourceRebalanceDate: string;
  holdings: Array<{ ticker: string; weight: number }>;
  initialValue: number;
  benchmark: string;
  startedAt: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export default function PaperPage() {
  const { data, error, isLoading, mutate } = useSWR<{
    portfolios: PaperPortfolio[];
  }>("/api/paper", fetcher);
  const portfolios = data?.portfolios ?? [];
  const active = portfolios.filter((p) => !p.archived);
  const archived = portfolios.filter((p) => p.archived);

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 inline-flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            Paper 组合
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            从已完成研究的最末次再平衡转出来的「纸面持仓」，按 Yahoo 最新月度价持续追踪表现
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 flex items-center justify-center text-gray-500 text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中…
        </div>
      )}
      {error && !isLoading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          加载失败：{(error as Error).message}
        </div>
      )}
      {!isLoading && portfolios.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-base font-medium text-gray-900 mb-1">
            还没有 Paper 组合
          </p>
          <p className="text-sm text-gray-500 mb-4">
            到任何已完成的研究详情页 → 点「转 Paper 组合」即可创建。
          </p>
          <Link href="/">
            <Button variant="outline" size="sm">
              返回仪表盘
            </Button>
          </Link>
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">活跃组合</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {active.map((p) => (
              <PaperCard key={p.id} portfolio={p} onChange={() => mutate()} />
            ))}
          </div>
        </div>
      )}
      {archived.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">
            已归档（{archived.length}）
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60">
            {archived.map((p) => (
              <PaperCard key={p.id} portfolio={p} onChange={() => mutate()} />
            ))}
          </div>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
        <strong>免责：</strong>
        Paper 组合是纯模拟跟踪，不涉及真实交易。买入价格按创建时的月末价计算（不考虑当日盘中价、流动性、税务、股息等）。当前实现：开仓后不调仓 (buy-and-hold)，未来阶段会加入定期再平衡 + 通知。
      </div>
    </div>
  );
}

interface ValuationResp {
  portfolio: PaperPortfolio;
  valuation: {
    startValue: number;
    currentValue: number;
    totalReturnPct: number;
    positions: Array<{
      ticker: string;
      weight: number;
      startPrice?: number;
      currentPrice?: number;
      shares?: number;
      currentNotional?: number;
      unavailable: boolean;
    }>;
  };
  benchmark: {
    ticker: string;
    startValue: number;
    currentValue: number;
    totalReturnPct: number;
  } | null;
}

function PaperCard({
  portfolio,
  onChange,
}: {
  portfolio: PaperPortfolio;
  onChange: () => void;
}) {
  const { data, isLoading, error } = useSWR<ValuationResp>(
    `/api/paper/${portfolio.id}/value`,
    fetcher,
  );
  const [archiving, setArchiving] = useState(false);

  async function archive() {
    if (!window.confirm("确认归档此 Paper 组合？")) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/paper/${portfolio.id}/value`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "归档失败");
    } finally {
      setArchiving(false);
    }
  }

  const ret = data?.valuation.totalReturnPct ?? 0;
  const benchRet = data?.benchmark?.totalReturnPct ?? 0;
  const beating = data?.benchmark != null && ret > benchRet;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold text-gray-900 truncate">
              {portfolio.title}
            </CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              起点 {portfolio.sourceRebalanceDate} · {portfolio.holdings.length} 只持仓 · 基准 {portfolio.benchmark}
            </p>
          </div>
          {!portfolio.archived && (
            <button
              type="button"
              title="归档"
              onClick={archive}
              disabled={archiving}
              className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              {archiving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isLoading && (
          <div className="text-xs text-gray-400 inline-flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            正在拉取最新价格…
          </div>
        )}
        {error && !isLoading && (
          <div className="text-xs text-red-600">
            估值失败：{(error as Error).message}
          </div>
        )}
        {data && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Metric
                label="当前市值"
                value={`$${Math.round(data.valuation.currentValue).toLocaleString()}`}
              />
              <Metric
                label="累计收益"
                value={`${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%`}
                tone={ret >= 0 ? "good" : "bad"}
              />
              <Metric
                label={`vs ${data.benchmark?.ticker ?? portfolio.benchmark}`}
                value={
                  data.benchmark
                    ? `${ret - benchRet >= 0 ? "+" : ""}${(ret - benchRet).toFixed(2)}%`
                    : "—"
                }
                tone={beating ? "good" : "bad"}
              />
            </div>
            {beating && (
              <div className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                <TrendingUp className="h-3 w-3" />
                跑赢基准
              </div>
            )}
            {!beating && data.benchmark && (
              <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                <TrendingDown className="h-3 w-3" />
                落后基准
              </div>
            )}
            <div className="text-xs text-gray-500 mt-2">
              <span className="font-medium">持仓：</span>
              {portfolio.holdings.map((h) => h.ticker).join("、")}
            </div>
            <Link
              href={`/studies/${portfolio.sourceStudyId}/result`}
              className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 mt-2"
            >
              查看源研究
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500">{label}</span>
      <span
        className={`text-sm font-semibold ${
          tone === "good"
            ? "text-green-700"
            : tone === "bad"
              ? "text-red-600"
              : "text-gray-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
