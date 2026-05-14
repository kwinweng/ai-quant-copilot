// Phase 13 — Multi-agent investment debate.
//
// Three personas evaluate a completed study via a structured 4-turn debate:
//
//   1. Regan  (多头分析师) — argues FOR the hypothesis with 3 strongest data
//                          references
//   2. Jayzee (风险官)    — rebuts with 2-3 most fatal weaknesses, cites data
//   3. Regan  (回应)      — addresses each of Jayzee's risks with mitigation
//   4. Quinn  (量化主管)  — synthesizes a probability-weighted verdict and
//                          investment recommendation
//
// The orchestration is sequential because each turn depends on the previous.
// The full transcript is yielded as SSE events so the UI can show "Regan is
// typing..." instead of staring at a 30s loading spinner.

import OpenAI from "openai";
import {
  buildDebateContext,
  validateCitations,
  type DebateContext,
  type DebateContextInput,
} from "./debateContext";

// We re-use the singleton DeepSeek client from src/lib/ai.ts via a deferred
// import to avoid circular module load. (debate.ts is imported by the api
// route which also pulls assertUsageQuota from ai.ts.)
import { getDeepseekClient, DEEPSEEK_MODEL } from "./client";

// ---- Agent identities -----------------------------------------------------

export type AgentRole = "regan" | "jayzee" | "quinn";

export interface AgentMeta {
  role: AgentRole;
  displayName: string;
  title: string;
}

export const AGENTS: Record<AgentRole, AgentMeta> = {
  regan: { role: "regan", displayName: "Regan", title: "多头分析师" },
  jayzee: { role: "jayzee", displayName: "Jayzee", title: "风险官" },
  quinn: { role: "quinn", displayName: "Quinn", title: "量化主管" },
};

// ---- Prompts --------------------------------------------------------------

const REGAN_OPENING_PROMPT = `你是 Regan，一名经验丰富的多头分析师。你的任务：基于回测数据，找出本次研究**最有力的 3 个支持论据**。

## 立场
你站在多头一方。你相信好的策略值得继续投入资源研究、纸面跟踪、最终配置资金。但你不是无脑乐观——每一条论据必须用具体数据支撑，不能空喊「显著优于」「明显跑赢」。

## 风格
- 简体中文
- 总输出 ≤ 250 字
- 三段式：每段一个论据，先一句结论，再用数据支撑

## 数据引用要求 (硬性)
- 每个论据**必须**至少引用 1 个数据 reference，格式：[ref: metrics.cagr]、[ref: factor.Momentum]、[ref: annual.2020] 等
- 只能使用「研究数据」段落中明确列出的 reference tokens，**禁止编造**
- 论据 = 数据，不带数据的论断不算论据

## 输出格式
直接输出三段论据，每段以「**论据 1: …**」「**论据 2: …**」「**论据 3: …**」开头，**不要任何前言、寒暄、总结**。`;

const JAYZEE_PROMPT = `你是 Jayzee，一名严格的风险官。你的任务：基于 Regan 的多头陈述和回测数据，找出本次研究**最致命的 2-3 个风险或反对证据**。

## 立场
你的工作不是和稀泥，是替投资者**找出会让他们亏钱的东西**。你必须**至少找出 2 个严重风险**——禁止说"我大体同意 Regan"。如果策略真的完美，你应该质疑数据本身（幸存者偏差、样本期、过拟合可能）。

## 风格
- 简体中文
- 总输出 ≤ 250 字
- 二到三段，每段一个风险，从最严重排到次严重

## 数据引用要求 (硬性)
- 每个风险**必须**至少引用 1 个数据 reference，禁止编造
- 优先指向 [ref: drawdown.*]、[ref: bootstrap.*]、[ref: robustness.outOfSample]、[ref: annual.*] 中跑输的年份

## 输出格式
直接输出二到三段，每段以「**风险 1: …**」「**风险 2: …**」（可选 「**风险 3: …**」）开头，**不要前言、不要总结、不要附和 Regan**。`;

const REGAN_REBUTTAL_PROMPT = `你是 Regan。Jayzee 刚刚指出了风险。你的任务：**针对每一个风险给出缓解措施或反驳**。

## 立场
你不否认风险的存在，但你认为这些风险有缓解空间。每个回应必须：
1. 用一句话承认风险（不要否认）
2. 给出具体缓解措施，例如：「可在 Phase 14 加入行业上限」「可通过 ${"$"}{n} 个月滚动样本外验证」「该年份的低迷主要由 ${"$"}{factor} 拖累，多因子组合可平滑」

## 风格
- 简体中文
- 总输出 ≤ 200 字
- 按 Jayzee 的风险顺序逐条回应，不要漏掉

## 数据引用要求
- 回应中如果援引新的数据 reference，必须使用「研究数据」段落中列出的 token
- 不强制每段都引用，但建议至少一次

## 输出格式
直接输出回应，每段以「**回应风险 1: …**」「**回应风险 2: …**」开头，**不要前言**。`;

const QUINN_PROMPT = `你是 Quinn，量化主管。你刚刚听完了 Regan 和 Jayzee 的辩论，现在你需要给出**概率加权的最终判断**。

## 立场
你不是法官，你是 PM。你必须做出投资判断而不是「双方都有道理」。你的工作是把双方的论据加权综合，给出一个**多头胜率（0-100%）**和**明确的投资建议**。

## 风格
- 简体中文
- 总输出 ≤ 200 字
- 必须严格按下面 JSON schema 输出，不要包裹 markdown 代码块

## 输出格式 (硬性)
**只**输出以下 JSON 对象，不要任何前后文字：

\`\`\`
{
  "bullProbability": <0-100 的整数>,
  "verdict": "建议保留" | "建议改进" | "建议放弃",
  "summary": "<2-3 句话总结，必须解释为什么给出这个概率，引用至少 1 个 [ref:] token>",
  "nextSteps": [
    "<下一步建议 1>",
    "<下一步建议 2>",
    "<下一步建议 3>"
  ]
}
\`\`\`

bullProbability 的判定参考：
- ≥ 70：策略明显跑赢、样本外稳健、回撤可控
- 50-69：有 alpha 但风险点真实存在
- 30-49：风险大于收益，需要重大改进
- < 30：策略基本失败，建议放弃`;

// ---- Turn types -----------------------------------------------------------

export type DebateEvent =
  | { type: "turn-start"; turn: number; role: AgentRole }
  | { type: "delta"; turn: number; role: AgentRole; delta: string }
  | { type: "turn-end"; turn: number; role: AgentRole; content: string }
  | {
      type: "verdict";
      bullProbability: number;
      verdict: "建议保留" | "建议改进" | "建议放弃";
      summary: string;
      nextSteps: string[];
    }
  | { type: "done" }
  | { type: "error"; message: string };

export interface DebateTranscriptEntry {
  turn: number;
  role: AgentRole;
  content: string;
}

export interface DebateVerdict {
  bullProbability: number;
  verdict: "建议保留" | "建议改进" | "建议放弃";
  summary: string;
  nextSteps: string[];
}

export interface DebateResult {
  contextRefCount: number;
  transcript: DebateTranscriptEntry[];
  verdict: DebateVerdict | null;
  generatedAt: string;
  model: string;
  citationValidRatio: number;
}

// ---- Orchestrator ---------------------------------------------------------

async function streamAgentTurn(
  systemPrompt: string,
  userPrompt: string,
  // History of prior agent turns to inject as context
  history: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  maxTokens: number,
): Promise<AsyncGenerator<string, string, void>> {
  const client = getDeepseekClient();
  const stream = await client.chat.completions.create({
    model: DEEPSEEK_MODEL,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.6,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userPrompt },
    ],
  });

  async function* gen(): AsyncGenerator<string, string, void> {
    let acc = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        acc += delta;
        yield delta;
      }
    }
    return acc;
  }
  return gen();
}

function buildResearchDataBlock(ctx: DebateContext): string {
  return `## 研究数据 (引用 [ref: …] 时只能使用下面列出的 token)\n\n${ctx.text}\n\n可用 references: ${[...ctx.references].join(", ")}`;
}

function parseVerdict(raw: string): DebateVerdict | null {
  // Quinn might wrap output in ```json fences or add leading/trailing prose.
  // Find the first { and brace-count to the matching close.
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      bullProbability?: unknown;
      verdict?: unknown;
      summary?: unknown;
      nextSteps?: unknown;
    };
    const bp = parsed.bullProbability;
    const verdict = parsed.verdict;
    const summary = parsed.summary;
    const steps = parsed.nextSteps;
    if (
      typeof bp !== "number" ||
      bp < 0 ||
      bp > 100 ||
      (verdict !== "建议保留" && verdict !== "建议改进" && verdict !== "建议放弃") ||
      typeof summary !== "string" ||
      !Array.isArray(steps)
    ) {
      return null;
    }
    return {
      bullProbability: Math.round(bp),
      verdict,
      summary: summary.trim(),
      nextSteps: steps
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 5),
    };
  } catch {
    return null;
  }
}

/**
 * Run the full 4-turn debate, yielding DebateEvent items as they happen.
 * Returns the final DebateResult for caching to StudyResult.aiDebate.
 *
 * Caller is responsible for quota check + increment.
 */
export async function* runDebate(
  input: DebateContextInput,
): AsyncGenerator<DebateEvent, DebateResult, void> {
  const ctx = buildDebateContext(input);
  const researchBlock = buildResearchDataBlock(ctx);
  const userOpening = `请基于以下研究数据展开评估：\n\n${researchBlock}`;

  const transcript: DebateTranscriptEntry[] = [];
  // history accumulates Q&A so each agent sees what came before
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];

  let totalCited = 0;
  let totalInvalid = 0;

  // ---- Turn 1: Regan opening ----
  yield { type: "turn-start", turn: 1, role: "regan" };
  let reganOpening = "";
  try {
    const gen = await streamAgentTurn(REGAN_OPENING_PROMPT, userOpening, [], 700);
    while (true) {
      const next = await gen.next();
      if (next.done) {
        reganOpening = next.value;
        break;
      }
      yield { type: "delta", turn: 1, role: "regan", delta: next.value };
    }
  } catch (err) {
    yield { type: "error", message: aiErrorMessage(err) };
    throw err;
  }
  transcript.push({ turn: 1, role: "regan", content: reganOpening });
  history.push({ role: "user", content: userOpening });
  history.push({ role: "assistant", content: reganOpening });
  yield { type: "turn-end", turn: 1, role: "regan", content: reganOpening };
  const reganCitations = validateCitations(reganOpening, ctx);
  totalCited += reganCitations.cited.length;
  totalInvalid += reganCitations.invalid.length;

  // ---- Turn 2: Jayzee rebuts ----
  yield { type: "turn-start", turn: 2, role: "jayzee" };
  const jayzeeUser = `Regan 刚刚陈述了多头论据（见上）。基于同一份研究数据，请你给出风险反驳。\n\n${researchBlock}`;
  let jayzeeReply = "";
  try {
    const gen = await streamAgentTurn(JAYZEE_PROMPT, jayzeeUser, history, 700);
    while (true) {
      const next = await gen.next();
      if (next.done) {
        jayzeeReply = next.value;
        break;
      }
      yield { type: "delta", turn: 2, role: "jayzee", delta: next.value };
    }
  } catch (err) {
    yield { type: "error", message: aiErrorMessage(err) };
    throw err;
  }
  transcript.push({ turn: 2, role: "jayzee", content: jayzeeReply });
  history.push({ role: "user", content: jayzeeUser });
  history.push({ role: "assistant", content: jayzeeReply });
  yield { type: "turn-end", turn: 2, role: "jayzee", content: jayzeeReply };
  const jc = validateCitations(jayzeeReply, ctx);
  totalCited += jc.cited.length;
  totalInvalid += jc.invalid.length;

  // ---- Turn 3: Regan rebuttal ----
  yield { type: "turn-start", turn: 3, role: "regan" };
  const reganUser = `Jayzee 提出了风险（见上）。请逐一给出缓解措施或反驳。\n\n${researchBlock}`;
  let reganRebut = "";
  try {
    const gen = await streamAgentTurn(REGAN_REBUTTAL_PROMPT, reganUser, history, 600);
    while (true) {
      const next = await gen.next();
      if (next.done) {
        reganRebut = next.value;
        break;
      }
      yield { type: "delta", turn: 3, role: "regan", delta: next.value };
    }
  } catch (err) {
    yield { type: "error", message: aiErrorMessage(err) };
    throw err;
  }
  transcript.push({ turn: 3, role: "regan", content: reganRebut });
  history.push({ role: "user", content: reganUser });
  history.push({ role: "assistant", content: reganRebut });
  yield { type: "turn-end", turn: 3, role: "regan", content: reganRebut };
  const rc = validateCitations(reganRebut, ctx);
  totalCited += rc.cited.length;
  totalInvalid += rc.invalid.length;

  // ---- Turn 4: Quinn verdict ----
  yield { type: "turn-start", turn: 4, role: "quinn" };
  const quinnUser = `Regan 和 Jayzee 的辩论见上。请综合三轮发言，按 JSON schema 输出最终判断。\n\n${researchBlock}`;
  let quinnReply = "";
  try {
    const gen = await streamAgentTurn(QUINN_PROMPT, quinnUser, history, 500);
    while (true) {
      const next = await gen.next();
      if (next.done) {
        quinnReply = next.value;
        break;
      }
      yield { type: "delta", turn: 4, role: "quinn", delta: next.value };
    }
  } catch (err) {
    yield { type: "error", message: aiErrorMessage(err) };
    throw err;
  }
  transcript.push({ turn: 4, role: "quinn", content: quinnReply });
  yield { type: "turn-end", turn: 4, role: "quinn", content: quinnReply };

  const verdict = parseVerdict(quinnReply);
  if (verdict) {
    yield { type: "verdict", ...verdict };
  }

  yield { type: "done" };

  const validRatio =
    totalCited === 0 ? 0 : (totalCited - totalInvalid) / totalCited;

  return {
    contextRefCount: ctx.references.size,
    transcript,
    verdict,
    generatedAt: new Date().toISOString(),
    model: DEEPSEEK_MODEL,
    citationValidRatio: validRatio,
  };
}

function aiErrorMessage(err: unknown): string {
  if (err instanceof OpenAI.APIConnectionError) {
    return "无法连接 AI 服务";
  }
  if (err instanceof OpenAI.APIError) {
    if (err.status === 429) return "AI 服务繁忙或限流，请稍后重试";
    if (typeof err.status === "number" && err.status >= 500) {
      return "AI 服务暂时不可用，请稍后重试";
    }
    return `AI 服务错误 (HTTP ${err.status ?? "未知"})`;
  }
  return "AI 调用失败";
}
