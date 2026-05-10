"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sparkles,
  Send,
  ArrowLeft,
  BookOpen,
  Loader2,
  RotateCcw,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import {
  EXAMPLE_HYPOTHESES,
  type ExampleHypothesis,
  type Difficulty,
} from "@/data/exampleHypotheses";

interface Message {
  role: "user" | "assistant";
  content: string;
  // Whether this is the special final message that contains the [FINAL] block.
  // When true, we strip the block before showing it and surface a "进入新研究"
  // CTA below.
  isFinal?: boolean;
}

interface FinalPayload {
  hypothesis: string;
  factorMix: "momentum" | "multifactor";
  rebalance: string;
  universe: string;
  startDate: string;
  endDate: string;
  benchmark: string;
  txCostBps: number;
}

const INTRO: Message = {
  role: "assistant",
  content:
    "你好！我是 AI 量化研究教练。我会通过 3-12 轮对话，帮你把模糊的投资想法整理成一个完整、可回测的研究假设。\n\n先告诉我：你最近**对哪类股票或市场现象有兴趣**？（比如「科技股最近涨得猛」「价值股是不是该回归了」「想看动量在熊市里还有没有用」之类）",
};

// Local mirror of the parsing logic in src/lib/ai.ts so the client can tell
// when the AI signaled "final answer" while the stream is still in flight.
function parseFinal(text: string): FinalPayload | null {
  const idx = text.indexOf("[FINAL]");
  if (idx === -1) return null;
  const after = text.slice(idx + "[FINAL]".length);
  const start = after.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < after.length; i++) {
    if (after[i] === "{") depth++;
    else if (after[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  try {
    const parsed = JSON.parse(after.slice(start, end + 1)) as Partial<FinalPayload>;
    if (
      typeof parsed.hypothesis !== "string" ||
      typeof parsed.universe !== "string" ||
      typeof parsed.startDate !== "string" ||
      typeof parsed.endDate !== "string" ||
      typeof parsed.rebalance !== "string" ||
      typeof parsed.benchmark !== "string" ||
      typeof parsed.txCostBps !== "number"
    ) {
      return null;
    }
    const factorMix =
      parsed.factorMix === "multifactor" ? "multifactor" : "momentum";
    return {
      hypothesis: parsed.hypothesis,
      factorMix,
      rebalance: parsed.rebalance,
      universe: parsed.universe,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      benchmark: parsed.benchmark,
      txCostBps: parsed.txCostBps,
    };
  } catch {
    return null;
  }
}

function stripFinalBlock(text: string): string {
  const idx = text.indexOf("[FINAL]");
  return idx === -1 ? text : text.slice(0, idx).trim();
}

export default function CoachPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([INTRO]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [finalPayload, setFinalPayload] = useState<FinalPayload | null>(null);
  const [showExamples, setShowExamples] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function sendTurn(userInput: string) {
    if (!userInput.trim() || loading) return;
    setErrorMsg(null);
    const next: Message[] = [
      ...messages,
      { role: "user", content: userInput.trim() },
    ];
    setMessages(next);
    setInput("");
    setLoading(true);

    // Optimistic empty assistant bubble that we'll fill via stream.
    setMessages((cur) => [...cur, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/coach/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: next }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `教练响应失败 (HTTP ${res.status})`);
      }
      // Parse the SSE stream manually — same shape as plan generate.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          if (!ev.startsWith("data:")) continue;
          const json = ev.slice(5).trim();
          if (!json) continue;
          let payload: { type: string; delta?: string; message?: string };
          try {
            payload = JSON.parse(json);
          } catch {
            continue;
          }
          if (payload.type === "delta" && typeof payload.delta === "string") {
            assistantText += payload.delta;
            // Update the last (assistant) bubble. We strip the FINAL block
            // for display so users don't see the JSON, but keep the raw text
            // around for parseFinal at end-of-stream.
            const display = stripFinalBlock(assistantText);
            setMessages((cur) => {
              const copy = [...cur];
              copy[copy.length - 1] = {
                role: "assistant",
                content: display || "...",
              };
              return copy;
            });
          } else if (payload.type === "error") {
            throw new Error(payload.message ?? "AI 调用失败");
          } else if (payload.type === "done") {
            // Stream complete.
          }
        }
      }

      // Final pass: check whether the AI emitted a [FINAL] payload.
      const final = parseFinal(assistantText);
      if (final) {
        setFinalPayload(final);
        setMessages((cur) => {
          const copy = [...cur];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = {
            ...last,
            content: stripFinalBlock(assistantText) || "已经为你整理好假设。",
            isFinal: true,
          };
          return copy;
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "教练响应失败";
      setErrorMsg(msg);
      // Remove the empty placeholder assistant bubble.
      setMessages((cur) => {
        const copy = [...cur];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant" && !last.content.trim()) {
          copy.pop();
        }
        return copy;
      });
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    if (loading) return;
    if (
      messages.length > 1 &&
      !window.confirm("确认重新开始？当前对话会被清空。")
    ) {
      return;
    }
    setMessages([INTRO]);
    setInput("");
    setErrorMsg(null);
    setFinalPayload(null);
  }

  function applyExample(ex: ExampleHypothesis) {
    // Picking an example bypasses the dialog entirely — straight to /new.
    const params = new URLSearchParams({
      hypothesis: ex.hypothesis,
      universe: ex.params.universe,
      startDate: ex.params.startDate,
      endDate: ex.params.endDate,
      rebalance: ex.params.rebalance,
      benchmark: ex.params.benchmark,
      txCostBps: String(ex.params.txCostBps),
      factorMix: ex.params.factorMix,
    });
    router.push(`/studies/new?${params.toString()}`);
  }

  function applyFinal() {
    if (!finalPayload) return;
    const params = new URLSearchParams({
      hypothesis: finalPayload.hypothesis,
      universe: finalPayload.universe,
      startDate: finalPayload.startDate,
      endDate: finalPayload.endDate,
      rebalance: finalPayload.rebalance,
      benchmark: finalPayload.benchmark,
      txCostBps: String(finalPayload.txCostBps),
      factorMix: finalPayload.factorMix,
    });
    router.push(`/studies/new?${params.toString()}`);
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-gray-600">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 inline-flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              AI 假设教练
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              通过 3-12 轮对话，把模糊的投资想法整理成可回测的研究假设
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExamples((v) => !v)}
            className="inline-flex items-center gap-1.5"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {showExamples ? "收起例子" : "查看例子"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-gray-600"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重新开始
          </Button>
          <Link href="/studies/new">
            <Button variant="ghost" size="sm" className="text-gray-600">
              跳过对话 →
            </Button>
          </Link>
        </div>
      </div>

      {showExamples && <ExampleLibrary onPick={applyExample} />}

      {/* Chat scrollback */}
      <div
        ref={scrollerRef}
        className="border border-gray-200 rounded-lg bg-white overflow-y-auto p-4 space-y-3"
        style={{ maxHeight: "60vh", minHeight: "320px" }}
      >
        {messages.map((m, i) => (
          <ChatBubble key={i} message={m} />
        ))}
        {loading && (
          <div className="text-xs text-gray-400 inline-flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            教练思考中…
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Final payload card */}
      {finalPayload && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2 pt-4 px-4 border-green-100">
            <CardTitle className="text-sm font-semibold text-green-900 inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              已整理好这个假设
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="bg-white border border-green-200 rounded-md p-3 text-sm text-gray-900 leading-relaxed">
              {finalPayload.hypothesis}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <FinalChip label="股票池" value={finalPayload.universe} />
              <FinalChip
                label="区间"
                value={`${finalPayload.startDate.slice(0, 7)} → ${finalPayload.endDate.slice(0, 7)}`}
              />
              <FinalChip label="再平衡" value={finalPayload.rebalance} />
              <FinalChip label="基准" value={finalPayload.benchmark} />
              <FinalChip
                label="因子组合"
                value={
                  finalPayload.factorMix === "multifactor"
                    ? "多因子 V+Q+M"
                    : "单因子 12-1 动量"
                }
              />
              <FinalChip label="交易成本" value={`${finalPayload.txCostBps} bps`} />
            </div>
            <Button
              onClick={applyFinal}
              className="bg-green-600 hover:bg-green-700 text-white inline-flex items-center gap-1.5"
            >
              进入新研究表单
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Input */}
      {!finalPayload && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendTurn(input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={loading ? "等教练回应…" : "你的回答…"}
            disabled={loading}
            className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60"
            maxLength={1000}
          />
          <Button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center gap-1.5"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            发送
          </Button>
        </form>
      )}

      <p className="text-xs text-gray-400 text-center">
        AI 仅作为研究助手，所有产出仍需你判断。今日剩余调用次数有限，超额会暂时停用。
      </p>
    </div>
  );
}

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div
      className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="h-7 w-7 shrink-0 rounded-full bg-blue-100 inline-flex items-center justify-center">
          <Sparkles className="h-3.5 w-3.5 text-blue-600" />
        </div>
      )}
      <div
        className={`rounded-lg px-3 py-2 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-blue-600 text-white"
            : message.isFinal
              ? "bg-green-50 border border-green-200 text-gray-900"
              : "bg-gray-100 text-gray-900"
        }`}
      >
        {message.content}
      </div>
      {isUser && (
        <div className="h-7 w-7 shrink-0 rounded-full bg-gray-200 inline-flex items-center justify-center text-xs font-semibold text-gray-700">
          你
        </div>
      )}
    </div>
  );
}

function FinalChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-green-200 rounded px-2 py-1.5">
      <div className="text-gray-500 text-[10px]">{label}</div>
      <div className="text-gray-900 font-medium truncate">{value}</div>
    </div>
  );
}

// =====================================================================
// Example library — collapsible browser of 20-30 curated hypotheses.
// =====================================================================

const DIFFICULTY_ORDER: Difficulty[] = ["初级", "中级", "高级"];
const DIFFICULTY_TONE: Record<Difficulty, string> = {
  初级: "bg-emerald-50 border-emerald-200 text-emerald-800",
  中级: "bg-blue-50 border-blue-200 text-blue-800",
  高级: "bg-purple-50 border-purple-200 text-purple-800",
};

function ExampleLibrary({
  onPick,
}: {
  onPick: (ex: ExampleHypothesis) => void;
}) {
  const [filter, setFilter] = useState<Difficulty | "全部">("全部");
  const items = filter === "全部"
    ? EXAMPLE_HYPOTHESES
    : EXAMPLE_HYPOTHESES.filter((e) => e.difficulty === filter);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
        <CardTitle className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-blue-600" />
          假设例子库（{EXAMPLE_HYPOTHESES.length} 条）
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          按难度分级。选一条直接预填新研究表单；想要更定制化用上方对话教练。
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["全部", ...DIFFICULTY_ORDER] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setFilter(d)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                filter === d
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
          {items.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => onPick(ex)}
              className="text-left border border-gray-200 rounded-md p-3 hover:border-blue-400 hover:bg-blue-50/30 transition-colors group"
            >
              <div className="flex items-start gap-2 mb-1">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${DIFFICULTY_TONE[ex.difficulty]}`}
                >
                  {ex.difficulty}
                </span>
                <span className="text-[10px] text-gray-500 mt-0.5">
                  {ex.category}
                </span>
              </div>
              <div className="text-sm font-medium text-gray-900 mb-1">
                {ex.title}
              </div>
              <div className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                {ex.hypothesis}
              </div>
              <div className="text-xs text-blue-600 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                直接使用 →
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
