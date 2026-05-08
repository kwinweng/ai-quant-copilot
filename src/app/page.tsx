import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RECENT_STUDIES, ACTIVE_TASK } from "@/data/studies";
import { TrendingUp } from "lucide-react";

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

function StudyCard({ study }: { study: (typeof RECENT_STUDIES)[0] }) {
  const m = study.metrics;
  const beatsMarket = m && m.cagr > m.spyCagr;

  return (
    <Card className="bg-white border-gray-200 text-gray-900">
      <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold text-gray-900 truncate">
              {study.name}
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
            <Badge variant="success">已完成</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {m && (
          <div className="grid grid-cols-3 gap-3 mb-3">
            <MetricCell
              label="CAGR"
              value={`${m.cagr}%`}
              positive={m.cagr > m.spyCagr}
            />
            <MetricCell
              label="Sharpe"
              value={m.sharpe.toFixed(2)}
              positive={m.sharpe > m.spySharpe}
            />
            <MetricCell
              label="Max Drawdown"
              value={`${m.maxDrawdown}%`}
              positive={m.maxDrawdown > m.spyMaxDrawdown}
            />
          </div>
        )}
        {study.aiConclusion && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-3">
            {study.aiConclusion}
          </p>
        )}
        <div className="flex gap-2">
          <Link href="/studies/demo-result">
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

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">早上好，Jane</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            2024年12月5日 · {RECENT_STUDIES.length} 个已完成研究
          </p>
        </div>
        <Link href="/studies/new">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            + 新研究
          </Button>
        </Link>
      </div>

      {/* Active Study */}
      <Card className="border-blue-200 bg-blue-50 text-gray-900">
        <CardHeader className="pb-2 pt-4 px-4 border-blue-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold text-gray-900">
                当前研究
              </CardTitle>
              <Badge variant="running">进行中</Badge>
            </div>
            <Link href="/studies/running">
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
          <p className="text-sm font-medium text-gray-900">
            {ACTIVE_TASK.studyName}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Step 3 of 8 · {ACTIVE_TASK.currentStep}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-2 bg-blue-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${ACTIVE_TASK.progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 shrink-0">
              {ACTIVE_TASK.progress}% · 约 {ACTIVE_TASK.estimatedMinutesLeft}{" "}
              分钟
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Recent Studies */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">近期研究</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {RECENT_STUDIES.map((study) => (
            <StudyCard key={study.id} study={study} />
          ))}
        </div>
      </div>

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
