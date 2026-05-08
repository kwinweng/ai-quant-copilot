"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RESEARCH_PLAN } from "@/data/plan";
import { ChevronDown, ChevronUp, Pencil } from "lucide-react";

const PARAM_LABELS: Record<string, string> = {
  universe: "股票池",
  dateRange: "日期范围",
  rebalance: "再平衡频率",
  benchmark: "基准指数",
  transactionCost: "交易成本",
};

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
          <span
            role="button"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 cursor-pointer transition-colors"
          >
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

export default function PlanPage() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const plan = RESEARCH_PLAN;

  function handleStart() {
    setStarting(true);
    setTimeout(() => router.push("/studies/running"), 500);
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">研究计划</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            AI 已生成以下研究计划，确认后开始运行
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

      {/* 1. 假设 */}
      <Section title="假设">
        <p className="text-sm text-gray-700 mb-3">{plan.hypothesis}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
          {Object.entries(plan.parameters).map(([k, v]) => (
            <div key={k}>
              <p className="text-xs text-gray-400">
                {PARAM_LABELS[k] ?? k}
              </p>
              <p className="text-sm text-gray-800 font-medium">{v}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 2. 数据需求 */}
      <Section title="数据需求">
        <div className="space-y-2">
          {plan.dataRequirements.map((req, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-sm text-gray-800">{req.item}</span>
                <span className="text-xs text-gray-400 ml-2">
                  （{req.source}）
                </span>
              </div>
              <Badge
                variant={req.status === "available" ? "success" : "warning"}
                className="shrink-0 ml-2"
              >
                {req.status === "available" ? "可用" : req.status}
              </Badge>
            </div>
          ))}
        </div>
      </Section>

      {/* 3. 因子定义 */}
      <Section title="因子定义">
        <div className="space-y-3">
          {plan.factorDefinitions.map((f, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-900">{f.name}</p>
              <code className="block text-xs text-blue-600 mt-1 break-all font-mono">
                {f.formula}
              </code>
              <p className="text-xs text-gray-500 mt-1">{f.description}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 4. 回测规则 */}
      <Section title="回测规则">
        <ul className="space-y-1.5">
          {plan.backtestRules.map((rule, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="text-blue-500 shrink-0 mt-0.5">•</span>
              {rule}
            </li>
          ))}
        </ul>
      </Section>

      {/* 5. 风险检查 */}
      <Section title="风险检查">
        <ul className="space-y-1.5 mb-3">
          {plan.riskChecks.map((check, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="text-yellow-500 shrink-0 mt-0.5">⚑</span>
              {check}
            </li>
          ))}
        </ul>
        {plan.knownLimitations.length > 0 && (
          <>
            <p className="text-xs font-medium text-amber-600 mb-1.5 mt-3">
              已知局限性
            </p>
            <ul className="space-y-1">
              {plan.knownLimitations.map((lim, i) => (
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
