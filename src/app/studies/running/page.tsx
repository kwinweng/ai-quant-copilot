"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Loader2, StopCircle } from "lucide-react";

const STEPS_ZH = [
  { id: 1, name: "校验参数", description: "检查股票池、日期范围和因子定义" },
  { id: 2, name: "获取价格数据", description: "下载 Russell 1000 成分股 OHLCV (2014–2024)" },
  { id: 3, name: "获取基本面数据", description: "加载 ROIC、ROE、毛利率、PE、PB、PS" },
  { id: 4, name: "计算因子得分", description: "按季度计算质量 + 价值复合 z-score" },
  { id: 5, name: "构建投资组合", description: "选择前 20%，应用集中度限制" },
  { id: 6, name: "运行回测引擎", description: "模拟每日盈亏，含交易成本与再平衡" },
  { id: 7, name: "计算风险指标", description: "CAGR、Sharpe、Max Drawdown、Calmar、IR" },
  { id: 8, name: "生成 AI 报告", description: "AI 综合结果、因子归因、改进建议" },
];

const SIM_SPEED = 4;
const STEP_SIM_DURATIONS = [2, 6, 8, 8, 6, 10, 6, 6];
const STEP_DISPLAY_DURATIONS = [2, 38, 54, 47, 32, 65, 28, 31];
const SIM_TOTAL = STEP_SIM_DURATIONS.reduce((a, b) => a + b, 0);

const STEP_FILE_INFO: { files: string; size: string }[] = [
  { files: "1 / 1 文件", size: "8 KB" },
  { files: "约 1023 个标的", size: "2.3 MB" },
  { files: "6 / 6 数据源", size: "14.7 MB" },
  { files: "40 / 40 季度", size: "1.2 MB" },
  { files: "40 / 40 组合", size: "320 KB" },
  { files: "2515 个交易日", size: "—" },
  { files: "12 / 12 指标", size: "—" },
  { files: "1 / 1 报告", size: "—" },
];

const LOG_TEMPLATES: string[][] = [
  ["参数校验通过", "因子定义合法"],
  [
    "开始下载 Russell 1000 成分股",
    "已加载 250 / 1023 标的",
    "已加载 600 / 1023 标的",
    "已加载 1023 / 1023 标的",
  ],
  [
    "开始加载基本面数据",
    "已加载 ROIC 数据",
    "已加载 ROE 与毛利率",
    "已加载 PE / PB / PS",
  ],
  [
    "计算 2014 Q1 z-score",
    "计算 2018 Q1 z-score",
    "计算 2022 Q1 z-score",
    "复合因子得分完成",
  ],
  ["筛选 top 20% 标的", "应用单票仓位上限 3%", "组合构建完成"],
  [
    "回测 2014 年完成",
    "回测 2018 年完成",
    "回测 2022 年完成",
    "回测 2024 年完成",
  ],
  ["计算 CAGR / Sharpe", "计算 Max Drawdown", "计算 IR / Calmar"],
  ["AI 分析归因", "生成结论摘要", "报告生成完成"],
];

function cumEnds(durations: number[]): number[] {
  return durations.reduce<number[]>((acc, d, i) => {
    acc.push((acc[i - 1] ?? 0) + d);
    return acc;
  }, []);
}

const CUM_ENDS = cumEnds(STEP_SIM_DURATIONS);

type StepStatus = "complete" | "running" | "pending";

function getStatuses(simTime: number): StepStatus[] {
  return STEP_SIM_DURATIONS.map((d, i) => {
    const end = CUM_ENDS[i];
    const start = end - d;
    if (simTime >= end) return "complete";
    if (simTime >= start) return "running";
    return "pending";
  });
}

const RUN_START = new Date();
RUN_START.setHours(14, 23, 5, 0);

function formatClock(simSeconds: number): string {
  const t = new Date(RUN_START.getTime() + simSeconds * 1000);
  return `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}:${t.getSeconds().toString().padStart(2, "0")}`;
}

type LogEntry = { ts: string; msg: string; type: "info" | "success" | "start" };

function generateLogs(simTime: number): LogEntry[] {
  const logs: LogEntry[] = [];
  for (let i = 0; i < STEP_SIM_DURATIONS.length; i++) {
    const start = i === 0 ? 0 : CUM_ENDS[i - 1];
    const end = CUM_ENDS[i];
    if (simTime < start) break;

    logs.push({
      ts: formatClock(start),
      msg: `▶ 步骤 ${i + 1}/${STEPS_ZH.length}: ${STEPS_ZH[i].name}`,
      type: "start",
    });

    const progress = Math.min(1, (simTime - start) / (end - start));
    const templates = LOG_TEMPLATES[i];
    for (let j = 0; j < templates.length; j++) {
      const threshold = (j + 1) / (templates.length + 1);
      if (progress > threshold) {
        logs.push({
          ts: formatClock(start + (end - start) * threshold),
          msg: `  ${templates[j]}`,
          type: "info",
        });
      }
    }

    if (progress >= 1) {
      logs.push({
        ts: formatClock(end),
        msg: `  ✓ 步骤 ${i + 1} 完成 (${STEP_DISPLAY_DURATIONS[i]}s)`,
        type: "success",
      });
    }
  }
  return logs;
}

export default function RunningPage() {
  const router = useRouter();
  const [simTime, setSimTime] = useState(0);
  const [realElapsed, setRealElapsed] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [stopped, setStopped] = useState(false);
  const logScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stopped) return;
    const interval = setInterval(() => {
      setRealElapsed((s) => s + 1);
      setSimTime((s) => {
        const next = s + SIM_SPEED;
        return next >= SIM_TOTAL ? SIM_TOTAL : next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [stopped]);

  const statuses = getStatuses(simTime);
  const isComplete = simTime >= SIM_TOTAL;
  const runningIdx = statuses.findIndex((s) => s === "running");
  const progress = Math.round((simTime / SIM_TOTAL) * 100);
  const secsRemaining = Math.max(
    0,
    Math.ceil((SIM_TOTAL - simTime) / SIM_SPEED)
  );
  const logs = generateLogs(simTime);

  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  useEffect(() => {
    if (isComplete && !navigating) {
      setNavigating(true);
      const t = setTimeout(() => router.push("/studies/demo-result"), 1500);
      return () => clearTimeout(t);
    }
  }, [isComplete, navigating, router]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  function handleStop() {
    setStopped(true);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-gray-900">
            Quality + Value 组合因子
          </h1>
          {isComplete ? (
            <Badge variant="success">已完成</Badge>
          ) : stopped ? (
            <Badge variant="muted">已停止</Badge>
          ) : (
            <Badge variant="running">进行中</Badge>
          )}
          <span className="text-xs text-gray-400 font-mono">STU-2024-1205-001</span>
        </div>
        <span className="text-sm text-gray-500 shrink-0">
          已用时 {formatElapsed(realElapsed)}
        </span>
      </div>

      {/* Overall progress bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            {isComplete
              ? "全部步骤已完成"
              : stopped
              ? `已停止于步骤 ${runningIdx + 1}`
              : runningIdx >= 0
              ? `Step ${runningIdx + 1} of ${STEPS_ZH.length} · ${STEPS_ZH[runningIdx].name}`
              : "准备中..."}
          </span>
          <span className="text-xs text-gray-500">
            {isComplete
              ? "加载结果中..."
              : stopped
              ? "已暂停"
              : `约 ${secsRemaining} 秒剩余`}
          </span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${progress}%`,
              backgroundColor: isComplete
                ? "#22c55e"
                : stopped
                ? "#9ca3af"
                : "#3b82f6",
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1.5">
          <span>{progress}%</span>
          <span>
            {statuses.filter((s) => s === "complete").length} /{" "}
            {STEPS_ZH.length} 步完成
          </span>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
        {/* Left: Pipeline Steps */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">流水线步骤</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {STEPS_ZH.map((step, i) => {
              const status = statuses[i];
              const stepStart = i === 0 ? 0 : CUM_ENDS[i - 1];
              const stepProgress =
                status === "running"
                  ? Math.min(
                      100,
                      Math.round(
                        ((simTime - stepStart) / STEP_SIM_DURATIONS[i]) * 100
                      )
                    )
                  : 0;
              return (
                <div key={step.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    {status === "complete" && (
                      <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-green-600" />
                      </div>
                    )}
                    {status === "running" && (
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                        <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                      </div>
                    )}
                    {status === "pending" && (
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`text-sm font-medium ${
                          status === "pending"
                            ? "text-gray-400"
                            : "text-gray-900"
                        }`}
                      >
                        {step.id}. {step.name}
                      </p>
                      <span className="text-xs shrink-0">
                        {status === "complete" && (
                          <span className="text-gray-500">
                            {STEP_DISPLAY_DURATIONS[i]}s
                          </span>
                        )}
                        {status === "running" && (
                          <span className="text-blue-600 font-medium">
                            {stepProgress}%
                          </span>
                        )}
                        {status === "pending" && (
                          <span className="text-gray-300">待执行</span>
                        )}
                      </span>
                    </div>
                    <p
                      className={`text-xs mt-0.5 ${
                        status === "pending" ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      {step.description}
                    </p>
                    {status === "running" && (
                      <>
                        <div className="mt-2 h-1 bg-blue-50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all"
                            style={{ width: `${stepProgress}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {STEP_FILE_INFO[i].files}
                          {STEP_FILE_INFO[i].size !== "—" && (
                            <span> · {STEP_FILE_INFO[i].size}</span>
                          )}
                        </p>
                      </>
                    )}
                    {status === "complete" && (
                      <p className="text-xs text-gray-400 mt-1">
                        {STEP_FILE_INFO[i].files}
                        {STEP_FILE_INFO[i].size !== "—" && (
                          <span> · {STEP_FILE_INFO[i].size}</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Details + Logs */}
        <div className="space-y-4">
          {/* Study details */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">研究详情</h2>
            </div>
            <div className="px-4 py-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">研究编号</span>
                <span className="text-gray-900 font-mono">STU-2024-1205-001</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">股票池</span>
                <span className="text-gray-900">Russell 1000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">回测区间</span>
                <span className="text-gray-900">2014-01 至 2024-01</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">再平衡频率</span>
                <span className="text-gray-900">季度</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">基准</span>
                <span className="text-gray-900">SPY</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">交易成本</span>
                <span className="text-gray-900">5 bps / 笔</span>
              </div>
            </div>
          </div>

          {/* Live logs */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">实时日志</h2>
              <span className="text-xs text-gray-400">{logs.length} 条</span>
            </div>
            <div
              ref={logScrollRef}
              className="px-3 py-2 max-h-[360px] overflow-y-auto bg-gray-900 font-mono text-xs leading-relaxed"
            >
              {logs.length === 0 ? (
                <p className="text-gray-500 px-1">等待开始...</p>
              ) : (
                logs.map((log, i) => (
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
                ))
              )}
              {!isComplete && !stopped && (
                <div className="flex gap-2 px-1 py-0.5 animate-pulse">
                  <span className="text-gray-500 shrink-0">
                    [{formatClock(simTime)}]
                  </span>
                  <span className="text-gray-400">_</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          className="text-sm text-blue-600 hover:underline"
          onClick={() =>
            logScrollRef.current?.scrollTo({
              top: logScrollRef.current.scrollHeight,
            })
          }
        >
          查看完整日志 →
        </button>
        {isComplete ? (
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => router.push("/studies/demo-result")}
          >
            查看结果 →
          </Button>
        ) : stopped ? (
          <Button
            variant="outline"
            className="border-gray-200 text-gray-700 hover:bg-gray-50"
            onClick={() => router.push("/")}
          >
            返回仪表盘
          </Button>
        ) : (
          <Button
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5"
            onClick={handleStop}
          >
            <StopCircle className="w-4 h-4" />
            停止研究
          </Button>
        )}
      </div>
    </div>
  );
}
