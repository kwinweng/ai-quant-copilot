"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  RefreshCw,
} from "lucide-react";

interface ApiStudyPlan {
  dataRequirements: string;
  factorDefs: string;
  backtestRules: string;
  riskChecks: string;
  limitations: string;
}

interface PlanSseEvent {
  type: "delta" | "done" | "error";
  text?: string;
  plan?: ApiStudyPlan;
  message?: string;
}

// Parse the SSE stream from POST /api/studies/[id]/plan/generate. EventSource
// can't be used because it only supports GET — we hand-roll frame parsing on a
// fetch ReadableStream. Frames are `data: <json>\n\n`.
async function streamPlanGeneration(
  studyId: string,
  signal: AbortSignal,
  handlers: {
    onDelta: (text: string) => void;
    onDone: (plan: ApiStudyPlan) => void;
    onError: (message: string) => void;
  },
): Promise<void> {
  const res = await fetch(`/api/studies/${studyId}/plan/generate`, {
    method: "POST",
    signal,
  });
  if (!res.ok) {
    let msg = `生成失败 (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      // non-JSON body — keep the HTTP status fallback.
    }
    handlers.onError(msg);
    return;
  }
  const reader = res.body?.getReader();
  if (!reader) {
    handlers.onError("浏览器不支持流式读取");
    return;
  }
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep = buf.indexOf("\n\n");
    while (sep !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const dataStr = frame
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice(6))
        .join("\n");
      if (dataStr) {
        try {
          const ev = JSON.parse(dataStr) as PlanSseEvent;
          if (ev.type === "delta" && typeof ev.text === "string") {
            handlers.onDelta(ev.text);
          } else if (ev.type === "done" && ev.plan) {
            handlers.onDone(ev.plan);
          } else if (ev.type === "error") {
            handlers.onError(ev.message ?? "AI 生成失败");
          }
        } catch {
          // malformed frame — skip and keep parsing the rest.
        }
      }
      sep = buf.indexOf("\n\n");
    }
  }
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
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
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

interface StreamState {
  active: boolean;
  text: string;
  error: string | null;
}

const INITIAL_STREAM: StreamState = { active: false, text: "", error: null };

export default function PlanPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const studyId = params.id;
  const [starting, setStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<StreamState>(INITIAL_STREAM);
  const [useFallback, setUseFallback] = useState(false);
  const streamStartedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{ study: ApiStudy }>(
    studyId ? `/api/studies/${studyId}` : null,
    fetcher,
  );

  const study = data?.study;

  // Effective plan: DB plan > local fallback (only after explicit fallback opt-in).
  // While streaming we still want to show the live partial text rather than a
  // synthetic default — that's handled in render below, not here.
  const plan = useMemo<ApiStudyPlan | null>(() => {
    if (!study) return null;
    if (study.plan) return study.plan;
    if (useFallback) return buildDefaultPlan(study);
    return null;
  }, [study, useFallback]);

  const startStream = useCallback(() => {
    if (!studyId) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStreamState({ active: true, text: "", error: null });
    setUseFallback(false);
    void streamPlanGeneration(studyId, ctrl.signal, {
      onDelta: (chunk) =>
        setStreamState((s) =>
          s.active ? { ...s, text: s.text + chunk } : s,
        ),
      onDone: () => {
        setStreamState({ active: false, text: "", error: null });
        // Refresh SWR so study.plan picks up the freshly persisted plan.
        void mutate();
      },
      onError: (message) =>
        setStreamState({ active: false, text: "", error: message }),
    }).catch((err: unknown) => {
      if ((err as DOMException | undefined)?.name === "AbortError") return;
      setStreamState({
        active: false,
        text: "",
        error: err instanceof Error ? err.message : "AI 生成失败",
      });
    });
  }, [studyId, mutate]);

  // Auto-start the stream once after the study loads if there's no plan yet.
  useEffect(() => {
    if (!study) return;
    if (study.plan) return;
    if (useFallback) return;
    if (streamState.active || streamState.error) return;
    if (streamStartedRef.current) return;
    streamStartedRef.current = true;
    startStream();
  }, [study, useFallback, streamState.active, streamState.error, startStream]);

  // Abort in-flight stream on unmount so we don't keep the fetch alive.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

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

  if (error || !study) {
    return (
      <div className="p-6 max-w-3xl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          加载失败：{(error as Error | undefined)?.message ?? "研究不存在"}
        </div>
      </div>
    );
  }

  const headerSubtitle = streamState.active
    ? "AI 正在生成研究计划，请稍候…"
    : streamState.error && !plan
    ? "AI 生成失败"
    : useFallback && !study.plan
    ? "已使用默认计划模板，可重新生成或直接开始"
    : "AI 已生成研究计划，确认后开始运行";

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{study.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{headerSubtitle}</p>
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
          {plan && (
            <Button
              variant="outline"
              size="sm"
              className="border-gray-200 text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
              onClick={startStream}
              disabled={streamState.active}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${streamState.active ? "animate-spin" : ""}`}
              />
              重新生成
            </Button>
          )}
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleStart}
            disabled={starting || !plan || streamState.active}
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

      {streamState.active && !plan && (
        <div className="bg-white border border-blue-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-blue-100 flex items-center gap-2 bg-blue-50">
            <Sparkles className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">
              AI 正在生成研究计划
            </h3>
            <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin ml-auto" />
          </div>
          <div className="px-4 py-3">
            {streamState.text ? (
              <pre className="text-sm text-gray-700 whitespace-pre-wrap break-words font-sans leading-relaxed">
                {streamState.text}
                <span className="inline-block w-1.5 h-4 bg-blue-500 ml-0.5 animate-pulse align-middle" />
              </pre>
            ) : (
              <p className="text-sm text-gray-500">建立连接中…</p>
            )}
          </div>
        </div>
      )}

      {streamState.error && !plan && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                AI 生成失败
              </p>
              <p className="text-sm text-red-700 mt-1">{streamState.error}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-red-200 text-red-700 hover:bg-red-100 inline-flex items-center gap-1.5"
              onClick={startStream}
              disabled={streamState.active}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重新生成
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-gray-200 text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setUseFallback(true);
                setStreamState(INITIAL_STREAM);
              }}
            >
              使用默认计划
            </Button>
          </div>
        </div>
      )}

      {plan && (
        <>
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
              disabled={starting || streamState.active}
            >
              {starting ? "启动中..." : "开始研究 →"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
