"use client";

import Link from "next/link";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Loader2 } from "lucide-react";

type StudyStatus =
  | "DRAFT"
  | "PLANNED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

interface DashboardMetricsBlock {
  cagr: number;
  sharpe: number;
  maxDrawdown: number;
}

interface DashboardStudy {
  id: string;
  title: string;
  hypothesis: string;
  universe: string;
  rebalance: string;
  benchmark: string;
  startDate: string;
  endDate: string;
  status: StudyStatus;
  createdAt: string;
  updatedAt: string;
  result: {
    metrics: {
      strategy: DashboardMetricsBlock & Record<string, unknown>;
      spy: DashboardMetricsBlock & Record<string, unknown>;
    } | null;
    conclusion: string;
  } | null;
  progress: {
    currentStep: number;
    updatedAt: string;
  } | null;
}

const STATUS_LABEL: Record<StudyStatus, string> = {
  DRAFT: "草稿",
  PLANNED: "待启动",
  RUNNING: "进行中",
  COMPLETED: "已完成",
  FAILED: "失败",
  CANCELLED: "已取消",
};

const STATUS_BADGE: Record<StudyStatus, "success" | "running" | "muted" | "warning"> = {
  DRAFT: "muted",
  PLANNED: "muted",
  RUNNING: "running",
  COMPLETED: "success",
  FAILED: "warning",
  CANCELLED: "muted",
};

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });

function MetricCell({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500">{label}</span>
      <span
        className={`text-sm font-semibold ${
          positive === true
            ? "text-green-600"
            : positive === false
              ? "text-red-600"
              : "text-gray-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function CompletedStudyCard({ study }: { study: DashboardStudy }) {
  const m = study.result?.metrics;
  const strat = m?.strategy;
  const spy = m?.spy;
  const beatsMarket =
    typeof strat?.cagr === "number" &&
    typeof spy?.cagr === "number" &&
    strat.cagr > spy.cagr;

  return (
    <Card className="bg-white border-gray-200 text-gray-900">
      <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold text-gray-900 truncate">
              {study.title}
            </CardTitle>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
              {study.hypothesis}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {beatsMarket && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                <TrendingUp className="h-3 w-3" />
                跑赢大盘
              </span>
            )}
            <Badge variant={STATUS_BADGE[study.status]}>
              {STATUS_LABEL[study.status]}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {strat && spy && (
          <div className="grid grid-cols-3 gap-3 mb-3">
            <MetricCell
              label="CAGR"
              value={`${strat.cagr}%`}
              positive={strat.cagr > spy.cagr}
            />
            <MetricCell
              label="Sharpe"
              value={Number(strat.sharpe).toFixed(2)}
              positive={strat.sharpe > spy.sharpe}
            />
            <MetricCell
              label="Max Drawdown"
              value={`${strat.maxDrawdown}%`}
              positive={strat.maxDrawdown > spy.maxDrawdown}
            />
          </div>
        )}
        {study.result?.conclusion && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-3">
            {study.result.conclusion}
          </p>
        )}
        <div className="flex gap-2">
          <Link href={`/studies/${study.id}/result`}>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              查看报告
            </Button>
          </Link>
          <Link href="/studies/new">
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7 text-gray-500 hover:bg-gray-50"
            >
              新变体
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function PendingStudyCard({ study }: { study: DashboardStudy }) {
  const href =
    study.status === "RUNNING"
      ? `/studies/${study.id}/running`
      : `/studies/${study.id}/plan`;
  return (
    <Card className="bg-white border-gray-200 text-gray-900">
      <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold text-gray-900 truncate">
              {study.title}
            </CardTitle>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
              {study.hypothesis}
            </p>
          </div>
          <Badge variant={STATUS_BADGE[study.status]}>
            {STATUS_LABEL[study.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className="text-xs text-gray-500 mb-3">
          {study.universe} · {study.benchmark}
        </p>
        <Link href={href}>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            {study.status === "RUNNING" ? "查看进度" : "继续"}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function ActiveStudyBanner({ study }: { study: DashboardStudy }) {
  const totalSteps = 8;
  const currentStep = study.progress?.currentStep ?? 0;
  const progressPct = Math.min(
    100,
    Math.round(((currentStep + 1) / totalSteps) * 100)
  );
  return (
    <Card className="border-blue-200 bg-blue-50 text-gray-900">
      <CardHeader className="pb-2 pt-4 px-4 border-blue-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold text-gray-900">
              当前研究
            </CardTitle>
            <Badge variant="running">进行中</Badge>
          </div>
          <Link href={`/studies/${study.id}/running`}>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7 text-blue-600 hover:bg-blue-100"
            >
              查看进度 →
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className="text-sm font-medium text-gray-900">{study.title}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Step {currentStep + 1} of {totalSteps}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 shrink-0">{progressPct}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data, error, isLoading } = useSWR<{ studies: DashboardStudy[] }>(
    "/api/studies",
    fetcher,
  );

  const studies = data?.studies ?? [];
  const running = studies.find((s) => s.status === "RUNNING");
  const completed = studies.filter((s) => s.status === "COMPLETED");
  const pending = studies.filter(
    (s) => s.status === "DRAFT" || s.status === "PLANNED",
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            欢迎回来
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isLoading
              ? "加载中…"
              : `${completed.length} 个已完成 · ${pending.length} 个进行中或待启动`}
          </p>
        </div>
        <Link href="/studies/new">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            + 新研究
          </Button>
        </Link>
      </div>

      {/* Loading / error */}
      {isLoading && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 flex items-center justify-center text-gray-500 text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载研究…
        </div>
      )}
      {error && !isLoading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          加载失败：{(error as Error).message}
        </div>
      )}

      {/* Active running banner */}
      {running && <ActiveStudyBanner study={running} />}

      {/* Empty state */}
      {!isLoading && !error && studies.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-base font-medium text-gray-900 mb-1">
            还没有研究
          </p>
          <p className="text-sm text-gray-500 mb-4">
            从描述一个投资假设开始你的第一个量化研究。
          </p>
          <Link href="/studies/new">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              开始第一个研究 →
            </Button>
          </Link>
        </div>
      )}

      {/* Pending studies */}
      {pending.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">待启动 / 草稿</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pending.map((s) => (
              <PendingStudyCard key={s.id} study={s} />
            ))}
          </div>
        </div>
      )}

      {/* Completed studies */}
      {completed.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">近期研究</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {completed.map((s) => (
              <CompletedStudyCard key={s.id} study={s} />
            ))}
          </div>
        </div>
      )}

      {/* Data Source Status */}
      <Card className="bg-white border-gray-200 text-gray-900">
        <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-900">
            数据源状态
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-red-400" />
              <span className="text-gray-600">富途 OpenD</span>
              <span className="text-red-600 font-medium">未连接</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-gray-600">Mock 数据</span>
              <span className="text-green-600 font-medium">正常</span>
            </div>
            <Link
              href="/data-sources"
              className="text-blue-600 hover:underline ml-auto text-xs"
            >
              配置数据源 →
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
