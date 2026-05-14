// Phase 13 — investment debate UI.
//
// Renders the Regan / Jayzee / Quinn debate as a vertical timeline. Streams
// SSE deltas from POST /api/studies/[id]/debate. Falls back to cached debate
// on subsequent visits.

"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Sparkles,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  ShieldAlert,
  Scale,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type AgentRole = "regan" | "jayzee" | "quinn";

interface TranscriptEntry {
  turn: number;
  role: AgentRole;
  content: string;
}

interface Verdict {
  bullProbability: number;
  verdict: "建议保留" | "建议改进" | "建议放弃";
  summary: string;
  nextSteps: string[];
}

interface CachedDebate {
  transcript: TranscriptEntry[];
  verdict: Verdict | null;
  generatedAt: string;
  model: string;
  citationValidRatio?: number;
}

interface DebatePanelProps {
  studyId: string;
  hasCompletedResult: boolean;
}

const AGENT_STYLES: Record<
  AgentRole,
  { name: string; title: string; color: string; bg: string; border: string; icon: typeof TrendingUp }
> = {
  regan: {
    name: "Regan",
    title: "多头分析师",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: TrendingUp,
  },
  jayzee: {
    name: "Jayzee",
    title: "风险官",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: ShieldAlert,
  },
  quinn: {
    name: "Quinn",
    title: "量化主管",
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    icon: Scale,
  },
};

const TURN_LABELS: Record<number, string> = {
  1: "开场陈述",
  2: "风险反驳",
  3: "回应风险",
  4: "最终判断",
};

function VerdictBadge({ verdict, prob }: { verdict: Verdict["verdict"]; prob: number }) {
  const color =
    verdict === "建议保留"
      ? "bg-green-100 text-green-800 border-green-200"
      : verdict === "建议改进"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-rose-100 text-rose-800 border-rose-200";
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${color}`}>
      <CheckCircle2 className="h-4 w-4" />
      {verdict} · 多头胜率 {prob}%
    </div>
  );
}

function renderContent(content: string): React.ReactNode {
  // Render `[ref: token]` citations as subtle pill tags so users can see what
  // data the agent is citing. Keep the rest as preserved-newline text.
  const parts = content.split(/(\[ref:\s*[^\]]+\])/g);
  return parts.map((part, i) => {
    const m = /^\[ref:\s*([^\]]+)\]$/.exec(part);
    if (m) {
      return (
        <span
          key={i}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 ml-0.5 mr-0.5 text-[10px] font-mono rounded bg-gray-100 text-gray-600 border border-gray-200 align-baseline"
          title={`数据引用: ${m[1].trim()}`}
        >
          {m[1].trim()}
        </span>
      );
    }
    return <span key={i} className="whitespace-pre-wrap">{part}</span>;
  });
}

function TurnCard({
  entry,
  streaming = false,
}: {
  entry: TranscriptEntry;
  streaming?: boolean;
}) {
  const style = AGENT_STYLES[entry.role];
  const Icon = style.icon;
  return (
    <div className={`border ${style.border} rounded-lg overflow-hidden bg-white`}>
      <div className={`px-4 py-2 ${style.bg} flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${style.color}`} />
          <span className={`text-sm font-semibold ${style.color}`}>{style.name}</span>
          <span className="text-xs text-gray-500">{style.title}</span>
        </div>
        <div className="text-[11px] text-gray-500">
          {TURN_LABELS[entry.turn] ?? `第 ${entry.turn} 轮`}
          {streaming && (
            <Loader2 className="inline-block h-3 w-3 ml-1 animate-spin" />
          )}
        </div>
      </div>
      <div className="px-4 py-3 text-sm text-gray-800 leading-relaxed">
        {entry.content.trim().length === 0 && streaming ? (
          <span className="text-gray-400">正在思考…</span>
        ) : (
          renderContent(entry.content)
        )}
      </div>
    </div>
  );
}

function VerdictCard({ verdict, model }: { verdict: Verdict; model?: string }) {
  return (
    <div className="border border-purple-300 rounded-lg overflow-hidden bg-gradient-to-br from-purple-50 to-white">
      <div className="px-4 py-2 bg-purple-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-purple-700" />
          <span className="text-sm font-semibold text-purple-700">Quinn 的最终判断</span>
        </div>
        {model && <span className="text-[10px] text-gray-500 font-mono">{model}</span>}
      </div>
      <div className="px-4 py-4 space-y-3">
        <VerdictBadge verdict={verdict.verdict} prob={verdict.bullProbability} />
        <p className="text-sm text-gray-800 leading-relaxed">
          {renderContent(verdict.summary)}
        </p>
        {verdict.nextSteps.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">下一步建议</p>
            <ul className="space-y-1">
              {verdict.nextSteps.map((s, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-purple-400 font-mono text-xs mt-0.5">{i + 1}.</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function DebatePanel({ studyId, hasCompletedResult }: DebatePanelProps) {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [streamingRole, setStreamingRole] = useState<AgentRole | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCached, setHasCached] = useState<boolean | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // On mount: probe GET /debate for cached transcript.
  useEffect(() => {
    if (!studyId || !hasCompletedResult) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/studies/${studyId}/debate`);
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { debate: CachedDebate };
          if (data.debate && Array.isArray(data.debate.transcript)) {
            setTranscript(data.debate.transcript);
            setVerdict(data.debate.verdict ?? null);
            setGeneratedAt(data.debate.generatedAt ?? null);
            setModel(data.debate.model ?? null);
            setHasCached(true);
            return;
          }
        }
        setHasCached(false);
      } catch {
        setHasCached(false);
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [studyId, hasCompletedResult]);

  async function startDebate(force = false) {
    if (!studyId || loading) return;
    setLoading(true);
    setError(null);
    setTranscript([]);
    setVerdict(null);
    setStreamingRole(null);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(
        `/api/studies/${studyId}/debate${force ? "?force=1" : ""}`,
        { method: "POST", signal: ctrl.signal },
      );
      if (!res.ok || !res.body) {
        let msg = `生成失败 (HTTP ${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) msg = body.error;
        } catch {
          /* non-JSON — keep default */
        }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const accByTurn: Record<number, string> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          if (!frame.startsWith("data:")) continue;
          const json = frame.slice(5).trim();
          if (!json) continue;
          let evt: {
            type: string;
            turn?: number;
            role?: AgentRole;
            delta?: string;
            content?: string;
            message?: string;
            cached?: boolean;
            bullProbability?: number;
            verdict?: Verdict["verdict"];
            summary?: string;
            nextSteps?: string[];
          };
          try {
            evt = JSON.parse(json);
          } catch {
            continue;
          }
          if (evt.type === "turn-start" && evt.turn != null && evt.role) {
            setStreamingRole(evt.role);
            accByTurn[evt.turn] = "";
            setTranscript((prev) => {
              const next = prev.filter((t) => t.turn !== evt.turn);
              next.push({ turn: evt.turn!, role: evt.role!, content: "" });
              next.sort((a, b) => a.turn - b.turn);
              return next;
            });
          } else if (evt.type === "delta" && evt.turn != null && evt.role) {
            accByTurn[evt.turn] = (accByTurn[evt.turn] ?? "") + (evt.delta ?? "");
            const content = accByTurn[evt.turn];
            setTranscript((prev) => {
              const next = prev.map((t) =>
                t.turn === evt.turn ? { ...t, content } : t,
              );
              return next;
            });
          } else if (evt.type === "turn-end" && evt.turn != null && evt.role) {
            const final = evt.content ?? accByTurn[evt.turn] ?? "";
            accByTurn[evt.turn] = final;
            setTranscript((prev) => {
              const exists = prev.find((t) => t.turn === evt.turn);
              if (exists) {
                return prev.map((t) =>
                  t.turn === evt.turn ? { ...t, content: final } : t,
                );
              }
              const next = [...prev, { turn: evt.turn!, role: evt.role!, content: final }];
              next.sort((a, b) => a.turn - b.turn);
              return next;
            });
          } else if (evt.type === "verdict") {
            setVerdict({
              bullProbability: evt.bullProbability ?? 0,
              verdict: evt.verdict ?? "建议改进",
              summary: evt.summary ?? "",
              nextSteps: evt.nextSteps ?? [],
            });
          } else if (evt.type === "error") {
            setError(evt.message ?? "生成失败");
          } else if (evt.type === "done") {
            setStreamingRole(null);
            setHasCached(true);
            setGeneratedAt(new Date().toISOString());
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "生成失败");
      }
    } finally {
      setLoading(false);
      setStreamingRole(null);
    }
  }

  if (!hasCompletedResult) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <Sparkles className="h-6 w-6 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">
          研究尚未完成回测，先运行研究才能展开投研讨论。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <h2 className="text-base font-semibold text-gray-900">投研讨论</h2>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Regan（多头）、Jayzee（风险官）、Quinn（量化主管）三位智能体围绕本次研究的回测结果展开 4 轮辩论，
              输出概率加权的最终投资建议。每轮 ≤ 250 字，总时长约 30 秒。
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {hasCached && transcript.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => void startDebate(true)}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                重新生成
              </Button>
            )}
            {!hasCached && hasCached !== null && (
              <Button
                size="sm"
                disabled={loading}
                onClick={() => void startDebate(false)}
                className="gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                生成辩论
              </Button>
            )}
          </div>
        </div>
        {generatedAt && (
          <p className="mt-3 text-[11px] text-gray-400">
            生成时间：{new Date(generatedAt).toLocaleString("zh-CN")}
            {model && <span className="ml-2 font-mono">{model}</span>}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {transcript.length === 0 && !loading && hasCached === false && !error && (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-10 text-center">
          <Sparkles className="h-6 w-6 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 mb-1">尚未生成投研讨论</p>
          <p className="text-xs text-gray-400">
            点击「生成辩论」让三位智能体评估这份研究的优劣与风险
          </p>
        </div>
      )}

      {transcript.length > 0 && (
        <div className="space-y-3">
          {transcript.map((entry) => (
            <TurnCard
              key={entry.turn}
              entry={entry}
              streaming={streamingRole === entry.role && entry.turn === Math.max(...transcript.map((t) => t.turn))}
            />
          ))}
        </div>
      )}

      {verdict && <VerdictCard verdict={verdict} model={model ?? undefined} />}
    </div>
  );
}
