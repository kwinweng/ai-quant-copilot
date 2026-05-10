"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Check, Loader2, StopCircle } from "lucide-react";

interface StoredStep {
  name: string;
  description?: string;
  status: "pending" | "running" | "complete" | "error";
  durationSec?: number;
  note?: string;
}

interface StoredLog {
  ts: string;
  message: string;
  level: "info" | "warning" | "error";
}

interface ApiStudy {
  id: string;
  title: string;
  hypothesis: string;
  universe: string;
  startDate: string;
  endDate: string;
  rebalance: string;
  benchmark: string;
  txCostBps: number;
  status: string;
  progress: {
    currentStep: number;
    steps: StoredStep[] | null;
    logs: StoredLog[] | null;
    startedAt: string;
    updatedAt: string;
  } | null;
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });

function formatHHMMSS(ts: string): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Sprint #4 U11: context-aware retry button. The previous always-says-"重试"
// button POSTed /start regardless of where the failure happened. Now we
// route plan-step failures back to the plan page (where DeepSeek can be
// re-invoked) and route everything else to /start.
function RetryButton({
  study,
  erroredStepName,
  onError,
  onRetryStart,
  onMutate,
}: {
  study: { id: string };
  erroredStepName?: string;
  onError: (msg: string) => void;
  onRetryStart: () => void;
  onMutate: () => Promise<unknown>;
}) {
  const router = useRouter();
  const isPlanStep =
    erroredStepName?.includes("计划") || erroredStepName === "校验参数";

  if (isPlanStep) {
    return (
      <button
        type="button"
        className="text-xs text-red-700 hover:text-red-900 underline shrink-0"
        onClick={() => router.push(`/studies/${study.id}/plan`)}
      >
        返回研究计划
      </button>
    );
  }

  return (
    <button
      type="button"
      className="text-xs text-red-700 hover:text-red-900 underline shrink-0"
      onClick={async () => {
        onRetryStart();
        try {
          const res = await fetch(`/api/studies/${study.id}/start`, {
            method: "POST",
          });
          if (!res.ok) throw new Error(`重试失败 (HTTP ${res.status})`);
          await onMutate();
        } catch (err) {
          onError(err instanceof Error ? err.message : "重试失败");
        }
      }}
    >
      重新执行回测
    </button>
  );
}

export default function RunningPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const studyId = params.id;

  const { data, error, isLoading, mutate } = useSWR<{ study: ApiStudy }>(
    studyId ? `/api/studies/${studyId}` : null,
    fetcher,
    {
      // Poll while the backtest is running. SWR auto-pauses when the tab is
      // backgrounded, but for this page we want updates as long as the user
      // is here.
      refreshInterval: 2000,
      revalidateOnFocus: true,
    },
  );
  const study = data?.study;
  const progress = study?.progress ?? null;
  const steps = progress?.steps ?? [];
  const logs = progress?.logs ?? [];

  const [stopped, setStopped] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startingRef = useRef(false);
  const logScrollRef = useRef<HTMLDivElement>(null);

  // Auto-start: if the study has never been kicked off, POST /start once.
  useEffect(() => {
    if (!study) return;
    if (study.status === "COMPLETED") {
      router.replace(`/studies/${study.id}/result`);
      return;
    }
    if (study.status === "CANCELLED" && !stopped) {
      setStopped(true);
      return;
    }
    if (study.status === "FAILED") return; // surfaced inline as error banner
    if (
      (study.status === "DRAFT" || study.status === "PLANNED") &&
      !startingRef.current
    ) {
      startingRef.current = true;
      void (async () => {
        try {
          const res = await fetch(`/api/studies/${study.id}/start`, {
            method: "POST",
          });
          if (!res.ok) throw new Error(`启动研究失败 (HTTP ${res.status})`);
          await mutate();
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : "启动研究失败");
          startingRef.current = false;
        }
      })();
    }
  }, [study, router, stopped, mutate]);

  // Scroll logs to bottom when they grow.
  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  // Real wall-clock since startedAt for display.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const startedAtMs = progress?.startedAt
    ? new Date(progress.startedAt).getTime()
    : null;
  const elapsedMs = startedAtMs ? now - startedAtMs : 0;

  const completeCount = steps.filter((s) => s.status === "complete").length;
  const total = steps.length || 8;
  const overallPct =
    total > 0 ? Math.min(100, Math.round((completeCount / total) * 100)) : 0;
  const runningStep = steps.find((s) => s.status === "running");
  const erroredStep = steps.find((s) => s.status === "error");
  const isRunning = study?.status === "RUNNING";
  const isComplete = study?.status === "COMPLETED";
  const isFailed = study?.status === "FAILED";

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="bg-white border border-gray-200 rounded-lg p-12 flex items-center justify-center text-gray-500 text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载研究…
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

  const headerBadge = isComplete ? (
    <Badge variant="success">已完成</Badge>
  ) : isFailed ? (
    <Badge variant="danger">失败</Badge>
  ) : stopped ? (
    <Badge variant="muted">已停止</Badge>
  ) : (
    <Badge variant="running">进行中</Badge>
  );

  const headerStatus = isComplete
    ? "全部步骤已完成"
    : isFailed
      ? `失败于「${erroredStep?.name ?? "未知步骤"}」`
      : stopped
        ? `已停止于步骤 ${(progress?.currentStep ?? 0) + 1}`
        : runningStep
          ? `Step ${(progress?.currentStep ?? 0) + 1} of ${total} · ${runningStep.name}`
          : isRunning
            ? "准备中…"
            : "等待启动";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-gray-900">{study.title}</h1>
          {headerBadge}
          <span className="text-xs text-gray-400 font-mono">{study.id}</span>
        </div>
        <span className="text-sm text-gray-500 shrink-0">
          {startedAtMs ? `已用时 ${formatElapsed(elapsedMs)}` : "—"}
        </span>
      </div>

      {(errorMsg || isFailed) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">
              {erroredStep
                ? `失败于「${erroredStep.name}」`
                : "回测失败"}
            </div>
            <div className="mt-0.5 text-red-600">
              {errorMsg ??
                logs.findLast?.((l) => l.level === "error")?.message ??
                "请查看日志了解详情"}
            </div>
          </div>
          <RetryButton
            study={study}
            erroredStepName={erroredStep?.name}
            onError={(m) => setErrorMsg(m)}
            onRetryStart={() => {
              setErrorMsg(null);
              startingRef.current = false;
            }}
            onMutate={() => mutate()}
          />
        </div>
      )}

      {/* Overall progress */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">{headerStatus}</span>
          <span className="text-xs text-gray-500">
            {isComplete
              ? "加载结果中…"
              : isFailed
                ? "已停止"
                : stopped
                  ? "已暂停"
                  : "实时更新"}
          </span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${overallPct}%`,
              backgroundColor: isComplete
                ? "#22c55e"
                : isFailed
                  ? "#ef4444"
                  : stopped
                    ? "#9ca3af"
                    : "#3b82f6",
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1.5">
          <span>{overallPct}%</span>
          <span>
            {completeCount} / {total} 步完成
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
            {(steps.length === 0
              ? Array.from({ length: 8 }, () => ({
                  name: "等待初始化…",
                  description: undefined,
                  status: "pending" as const,
                  durationSec: undefined,
                  note: undefined,
                }))
              : steps
            ).map((step, i) => {
              return (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    {step.status === "complete" && (
                      <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-green-600" />
                      </div>
                    )}
                    {step.status === "running" && (
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                        <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                      </div>
                    )}
                    {step.status === "pending" && (
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                      </div>
                    )}
                    {step.status === "error" && (
                      <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                        <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`text-sm font-medium ${
                          step.status === "pending"
                            ? "text-gray-400"
                            : step.status === "error"
                              ? "text-red-700"
                              : "text-gray-900"
                        }`}
                      >
                        {i + 1}. {step.name}
                      </p>
                      <span className="text-xs shrink-0">
                        {step.status === "complete" && step.durationSec != null && (
                          <span className="text-gray-500">{step.durationSec}s</span>
                        )}
                        {step.status === "running" && (
                          <span className="text-blue-600 font-medium">运行中</span>
                        )}
                        {step.status === "pending" && (
                          <span className="text-gray-300">待执行</span>
                        )}
                        {step.status === "error" && (
                          <span className="text-red-600 font-medium">失败</span>
                        )}
                      </span>
                    </div>
                    {step.description && (
                      <p
                        className={`text-xs mt-0.5 ${
                          step.status === "pending"
                            ? "text-gray-400"
                            : "text-gray-500"
                        }`}
                      >
                        {step.description}
                      </p>
                    )}
                    {step.note && step.status !== "pending" && (
                      <p className="text-xs text-gray-400 mt-1">{step.note}</p>
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
                <span className="text-gray-900 font-mono">{study.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">股票池</span>
                <span className="text-gray-900">{study.universe}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">回测区间</span>
                <span className="text-gray-900">
                  {study.startDate.slice(0, 10)} → {study.endDate.slice(0, 10)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">再平衡频率</span>
                <span className="text-gray-900">{study.rebalance}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">基准</span>
                <span className="text-gray-900">{study.benchmark}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">交易成本</span>
                <span className="text-gray-900">{study.txCostBps} bps / 笔</span>
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
                <p className="text-gray-500 px-1">等待开始…</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="flex gap-2 px-1 py-0.5">
                    <span className="text-gray-500 shrink-0">
                      [{formatHHMMSS(log.ts)}]
                    </span>
                    <span
                      className={
                        log.level === "error"
                          ? "text-red-400"
                          : log.level === "warning"
                            ? "text-yellow-300"
                            : "text-gray-300"
                      }
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              )}
              {isRunning && !stopped && !isFailed && (
                <div className="flex gap-2 px-1 py-0.5 animate-pulse">
                  <span className="text-gray-500 shrink-0">[…]</span>
                  <span className="text-gray-400">_</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="flex items-center justify-end pt-2 gap-2">
        {isComplete ? (
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => router.push(`/studies/${study.id}/result`)}
          >
            查看结果 →
          </Button>
        ) : isFailed || stopped ? (
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
            disabled={cancelling}
            className="border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5 disabled:opacity-50"
            onClick={async () => {
              setCancelling(true);
              setErrorMsg(null);
              try {
                const res = await fetch(`/api/studies/${study.id}/cancel`, {
                  method: "POST",
                });
                if (!res.ok) {
                  const body = await res.json().catch(() => ({}));
                  throw new Error(
                    body?.error ?? `停止失败 (HTTP ${res.status})`,
                  );
                }
                setStopped(true);
              } catch (err) {
                setErrorMsg(err instanceof Error ? err.message : "停止失败");
              } finally {
                setCancelling(false);
              }
            }}
          >
            <StopCircle className="w-4 h-4" />
            {cancelling ? "停止中…" : "停止研究"}
          </Button>
        )}
      </div>
    </div>
  );
}
