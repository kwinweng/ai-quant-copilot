"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Pencil, Loader2 } from "lucide-react";

interface ApiStudyPlan {
  dataRequirements: string;
  factorDefs: string;
  backtestRules: string;
  riskChecks: string;
  limitations: string;
}

interface ApiStudy {
  id: string;
  title: string;
  hypothesis: string;
  market: string;
  universe: string;
  startDate: string;
  endDate: string;
  rebalance: string;
  benchmark: string;
  txCostBps: number;
  status: string;
  plan: ApiStudyPlan | null;
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });

function buildDefaultPlan(study: ApiStudy): ApiStudyPlan {
  return {
    dataRequirements: [
      `${study.universe} 历史 OHLCV 价格数据`,
      "基本面数据：ROIC / ROE / 毛利率",
      "估值因子：PE / PB / PS",
      `${study.benchmark} 基准收益序列`,
      `成分股历史构成（${study.startDate.slice(0, 10)} 至 ${study.endDate.slice(0, 10)}）`,
    ].join("\n"),
    factorDefs: [
      "Quality Score = Z(ROIC) + Z(ROE) + Z(毛利率)",
      "Value Score = Z(-PE) + Z(-PB) + Z(-PS)",
      "Combined = 0.5 × Quality + 0.5 × Value",
    ].join("\n"),
    backtestRules: [
      "每个再平衡日选取 Combined 得分前 20% 标的",
      "等权配置，单票最大仓位 3%",
      `按 ${study.rebalance} 频率再平衡`,
      `交易成本 ${study.txCostBps} bps（单边）`,
      "仅做多，无杠杆",
    ].join("\n"),
    riskChecks: [
      "GICS 单行业暴露不超过 35%",
      "组合至少持有 30 只标的",
      "年换手率超过 200% 时触发告警",
    ].join("\n"),
    limitations: [
      "存在幸存者偏差（使用当前 Russell 1000 成分作为代理）",
      "基本面数据为模拟生成，仅供示意",
      "未考虑做空与衍生品",
      "交易成本模型简化为固定 bps，未建模市场冲击",
    ].join("\n"),
  };
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-blue-600 border border-blue-200 cursor-pointer">
            <Pencil className="h-3 w-3" />
            编辑
          </span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100">{children}</div>
      )}
    </div>
  );
}

function Bulleted({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <ul className="space-y-1.5">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-2 text-sm text-gray-700">
          <span className="text-blue-500 shrink-0 mt-0.5">•</span>
          <span className="break-words">{line}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PlanPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const studyId = params.id;
  const [starting, setStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR<{ study: ApiStudy }>(
    studyId ? `/api/studies/${studyId}` : null,
    fetcher,
  );

  const study = data?.study;
  const plan = useMemo(
    () => (study ? (study.plan ?? buildDefaultPlan(study)) : null),
    [study],
  );

  async function handleStart() {
    if (!study || !plan) return;
    setStarting(true);
    setErrorMsg(null);
    try {
      const planRes = await fetch(`/api/studies/${study.id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });
      if (!planRes.ok) throw new Error(`保存计划失败 (HTTP ${planRes.status})`);

      const startRes = await fetch(`/api/studies/${study.id}/start`, {
        method: "POST",
      });
      if (!startRes.ok) throw new Error(`启动研究失败 (HTTP ${startRes.status})`);

      router.push(`/studies/${study.id}/running`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "启动失败");
      setStarting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl">
        <div className="bg-white border border-gray-200 rounded-lg p-12 flex items-center justify-center text-gray-500 text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载研究…
        </div>
      </div>
    );
  }

  if (error || !study || !plan) {
    return (
      <div className="p-6 max-w-3xl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          加载失败：{(error as Error | undefined)?.message ?? "研究不存在"}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{study.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            AI 已生成研究计划，确认后开始运行
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="border-gray-200 text-gray-700 hover:bg-gray-50"
            onClick={() => router.back()}
          >
            编辑参数
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleStart}
            disabled={starting}
          >
            {starting ? "启动中..." : "开始研究 →"}
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <Section title="假设">
        <p className="text-sm text-gray-700 mb-3 whitespace-pre-wrap">
          {study.hypothesis}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
          <div>
            <p className="text-xs text-gray-400">股票池</p>
            <p className="text-sm text-gray-800 font-medium">{study.universe}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">日期范围</p>
            <p className="text-sm text-gray-800 font-medium">
              {study.startDate.slice(0, 10)} → {study.endDate.slice(0, 10)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">再平衡</p>
            <p className="text-sm text-gray-800 font-medium">{study.rebalance}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">基准</p>
            <p className="text-sm text-gray-800 font-medium">{study.benchmark}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">交易成本</p>
            <p className="text-sm text-gray-800 font-medium">{study.txCostBps} bps</p>
          </div>
        </div>
      </Section>

      <Section title="数据需求">
        <Bulleted text={plan.dataRequirements} />
      </Section>

      <Section title="因子定义">
        <Bulleted text={plan.factorDefs} />
      </Section>

      <Section title="回测规则">
        <Bulleted text={plan.backtestRules} />
      </Section>

      <Section title="风险检查">
        <Bulleted text={plan.riskChecks} />
        {plan.limitations && (
          <>
            <p className="text-xs font-medium text-amber-600 mb-1.5 mt-3">
              已知局限性
            </p>
            <ul className="space-y-1">
              {plan.limitations
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
                .map((lim, i) => (
                  <li key={i} className="flex gap-2 text-xs text-amber-700">
                    <span className="shrink-0">⚠</span>
                    {lim}
                  </li>
                ))}
            </ul>
          </>
        )}
      </Section>

      {/* Bottom Actions */}
      <div className="flex justify-end gap-3 pb-8">
        <Button
          variant="outline"
          className="border-gray-200 text-gray-700 hover:bg-gray-50"
          onClick={() => router.back()}
        >
          编辑参数
        </Button>
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={handleStart}
          disabled={starting}
        >
          {starting ? "启动中..." : "开始研究 →"}
        </Button>
      </div>
    </div>
  );
}
