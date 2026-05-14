import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

// Lazy singleton — instantiating at module load would crash if the env var is
// missing during local dev, even on routes that don't need AI.
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DEEPSEEK_API_KEY is not set. Configure it in .env.local for dev or in /root/ai-quant-copilot/.env on prod.",
    );
  }
  _client = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
  });
  return _client;
}

// `deepseek-chat` is V3-0324; `deepseek-reasoner` (R1) is also acceptable but
// slower and pricier. Allow override so deployments can pin a model.
const MODEL = process.env.AI_MODEL || "deepseek-chat";

// ============================================================
// Error normalization — turns DeepSeek/OpenAI errors into terse
// Chinese messages safe to show end users. The raw `.message`
// from the SDK can include the API key fragment, request URL,
// or upstream stack frames — never surface those to the browser.
// ============================================================

function scrubSecrets(msg: string): string {
  return msg
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/Bearer\s+\S+/gi, "Bearer ***");
}

export function describeAiError(err: unknown): string {
  // APIConnectionError extends APIError but has no HTTP status — handle first.
  if (err instanceof OpenAI.APIConnectionError) {
    return "无法连接 AI 服务，请检查网络后重试";
  }
  if (err instanceof OpenAI.APIError) {
    const status = err.status;
    if (status === 401) {
      return "AI 服务认证失败，请联系管理员检查 API Key 配置";
    }
    if (status === 402) {
      return "AI 账户余额不足，请联系管理员充值";
    }
    if (status === 403) {
      return "AI 服务拒绝访问，请联系管理员检查权限";
    }
    if (status === 404) {
      return "AI 模型不存在或已下线，请联系管理员";
    }
    if (status === 429) {
      return "AI 服务繁忙或限流，请稍后重试";
    }
    if (status === 400 || status === 422) {
      return "AI 请求被拒绝（参数错误），请重试或联系管理员";
    }
    if (typeof status === "number" && status >= 500) {
      return "AI 服务暂时不可用，请稍后重试";
    }
    return `AI 服务错误（HTTP ${status ?? "未知"}）`;
  }
  if (err instanceof Error) {
    if (err.message.includes("DEEPSEEK_API_KEY")) {
      return "AI 服务未配置，请联系管理员";
    }
    return scrubSecrets(err.message);
  }
  return "AI 调用失败";
}

// Sprint #5 H6: classify an error as "user-billable" or not for quota
// purposes. Transient failures (rate limits, server errors, timeouts) DO
// count against the user's daily quota — DeepSeek likely already started
// generating, so it's compute we paid for and we don't want users in a
// rapid retry loop to drain the budget. Permanent / config errors (401,
// 402, 403, 404, missing API key) are never billable — they're not the
// user's fault.
export function isBillableError(err: unknown): boolean {
  if (err instanceof OpenAI.APIConnectionError) return false; // never reached server
  if (err instanceof OpenAI.APIError) {
    const status = err.status;
    if (
      status === 401 ||
      status === 402 ||
      status === 403 ||
      status === 404 ||
      status === 400 ||
      status === 422
    ) {
      return false;
    }
    // 429 + 500-class: server saw the request, possibly partially executed it.
    return true;
  }
  if (err instanceof Error && err.message.includes("DEEPSEEK_API_KEY")) {
    return false;
  }
  // Unknown error class: be generous, don't bill.
  return false;
}

// ============================================================
// Per-user per-day quota — cheap protection against runaway costs.
// ============================================================

export type UsageKind = "plan" | "conclusion" | "coach" | "debate" | "review";

const DEFAULT_QUOTAS: Record<UsageKind, number> = {
  plan: 10,
  conclusion: 20,
  // Coach turns: a single dialog can take 3-12 turns (per the design),
  // so allow ~4 sessions per day before throttling.
  coach: 60,
  // Phase 13: multi-agent debate is expensive (4 LLM calls per run, ~6k
  // output tokens). 5 generations/day per user covers exploring a few
  // studies without inviting abuse.
  debate: 5,
  // Phase 15: per-portfolio quarterly review summaries. One AI call each
  // with 7-day cache, so 10/day is generous.
  review: 10,
};

function utcDateKey(d = new Date()): Date {
  // Truncate to UTC midnight so we get one row per user per calendar day.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface QuotaExceeded {
  exceeded: true;
  used: number;
  limit: number;
  kind: UsageKind;
}

// Check (without incrementing) whether the user can make another call. Caller
// is responsible for `incrementUsage` after the call succeeds — we don't bump
// up-front so that AI-side errors don't burn the user's quota.
export async function assertUsageQuota(
  userId: string,
  kind: UsageKind,
): Promise<QuotaExceeded | null> {
  const date = utcDateKey();
  const limit = DEFAULT_QUOTAS[kind];
  const row = await prisma.aiUsageDay.findUnique({
    where: { userId_date: { userId, date } },
    select: {
      planCalls: true,
      conclusionCalls: true,
      coachCalls: true,
      debateCalls: true,
      reviewCalls: true,
    },
  });
  const used = row
    ? kind === "plan"
      ? row.planCalls
      : kind === "conclusion"
        ? row.conclusionCalls
        : kind === "coach"
          ? row.coachCalls
          : kind === "debate"
            ? row.debateCalls
            : row.reviewCalls
    : 0;
  if (used >= limit) {
    return { exceeded: true, used, limit, kind };
  }
  return null;
}

export async function incrementUsage(
  userId: string,
  kind: UsageKind,
): Promise<void> {
  const date = utcDateKey();
  const inc =
    kind === "plan"
      ? { planCalls: { increment: 1 } }
      : kind === "conclusion"
        ? { conclusionCalls: { increment: 1 } }
        : kind === "coach"
          ? { coachCalls: { increment: 1 } }
          : kind === "debate"
            ? { debateCalls: { increment: 1 } }
            : { reviewCalls: { increment: 1 } };
  await prisma.aiUsageDay.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      planCalls: kind === "plan" ? 1 : 0,
      conclusionCalls: kind === "conclusion" ? 1 : 0,
      coachCalls: kind === "coach" ? 1 : 0,
      debateCalls: kind === "debate" ? 1 : 0,
      reviewCalls: kind === "review" ? 1 : 0,
    },
    update: inc,
  });
}

const PLAN_SYSTEM_PROMPT = `你是一名经验丰富的量化研究主管，专门帮助投资人把模糊的投资假设转化为可执行的回测研究计划。

输出语言：简体中文。
风格：术语精准、严谨、落地，避免空话。
受众：会读策略，但不一定写代码的投资经理。

你的输出必须严格按照下面 5 个 H2 章节，章节标题保持完全一致，**不要新增、删除或重命名章节**：

## 数据需求
列出回测所需的数据类型，每行一项，要求覆盖：价格/基本面/估值因子/基准/股票池构成。

## 因子定义
用清晰的数学/伪代码风格定义每个因子的计算方式，例如：
Quality Score = Z(ROIC) + Z(ROE) + Z(毛利率)

## 回测规则
明确说明再平衡频率、选股阈值、仓位限制、做多/做空、交易成本假设、杠杆约束。

## 风险检查
列出该策略需要监控的风险维度，如行业暴露、个股集中度、换手率、流动性。

## 已知局限
列出该策略已知的局限或偏差，例如幸存者偏差、数据假设、未建模的成本、样本外失效风险。

每个章节用无序列表（"- " 开头）输出 3-6 项要点，不要写小标题、表格或代码块（伪代码可以放在普通行内）。`;

interface PlanInputStudy {
  hypothesis: string;
  market: string;
  universe: string;
  startDate: Date | string;
  endDate: Date | string;
  rebalance: string;
  benchmark: string;
  txCostBps: number;
}

function buildUserMessage(study: PlanInputStudy): string {
  const start =
    typeof study.startDate === "string"
      ? study.startDate.slice(0, 10)
      : study.startDate.toISOString().slice(0, 10);
  const end =
    typeof study.endDate === "string"
      ? study.endDate.slice(0, 10)
      : study.endDate.toISOString().slice(0, 10);
  return [
    "请为以下投资假设生成研究计划：",
    "",
    `<hypothesis>${study.hypothesis}</hypothesis>`,
    `<market>${study.market}</market>`,
    `<universe>${study.universe}</universe>`,
    `<date_range>${start} → ${end}</date_range>`,
    `<rebalance>${study.rebalance}</rebalance>`,
    `<benchmark>${study.benchmark}</benchmark>`,
    `<tx_cost_bps>${study.txCostBps}</tx_cost_bps>`,
  ].join("\n");
}

// Stream the plan as text deltas. Caller should accumulate the full string and
// pass it to parseStudyPlan() when stream is exhausted.
export async function* streamStudyPlan(
  study: PlanInputStudy,
): AsyncGenerator<string, void, void> {
  const client = getClient();
  // `include_usage` makes DeepSeek emit a final chunk with token totals; we
  // don't currently store them but the option keeps the door open.
  const stream = await client.chat.completions.create({
    model: MODEL,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 2048,
    messages: [
      { role: "system", content: PLAN_SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(study) },
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export interface ParsedStudyPlan {
  dataRequirements: string;
  factorDefs: string;
  backtestRules: string;
  riskChecks: string;
  limitations: string;
}

const SECTION_MAP: Array<{ heading: string; key: keyof ParsedStudyPlan }> = [
  { heading: "数据需求", key: "dataRequirements" },
  { heading: "因子定义", key: "factorDefs" },
  { heading: "回测规则", key: "backtestRules" },
  { heading: "风险检查", key: "riskChecks" },
  { heading: "已知局限", key: "limitations" },
];

// Convert "- foo\n- bar" markdown bullets into "foo\nbar" (the existing UI
// renders raw lines). Tolerates "* " bullets and stray indentation.
function bulletsToLines(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

export function parseStudyPlan(markdown: string): ParsedStudyPlan {
  const sections: Record<string, string> = {};
  // Split on H2 headings — capturing group keeps the heading so we can pair it
  // with the body that follows.
  const parts = markdown.split(/^##\s+(.+?)\s*$/m);
  // parts looks like [pre, heading1, body1, heading2, body2, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i].trim();
    const body = (parts[i + 1] ?? "").trim();
    sections[heading] = body;
  }

  const result: ParsedStudyPlan = {
    dataRequirements: "",
    factorDefs: "",
    backtestRules: "",
    riskChecks: "",
    limitations: "",
  };
  for (const { heading, key } of SECTION_MAP) {
    const body = sections[heading] ?? "";
    result[key] = bulletsToLines(body);
  }
  return result;
}

// ============================================================
// Conclusion generation — one-shot, used by Result page when
// aiExplanation is empty (e.g. legacy mock seed data).
// ============================================================

const CONCLUSION_SYSTEM_PROMPT = `你是一名资深量化分析师，需要根据回测的指标与因子诊断结果，给出对策略的人类可读解读。

输出语言：简体中文。
风格：先给一个有判断的总评，再给可操作的洞察。避免空话和"显著优于市场"等无信息表述。
受众：会读策略，但希望专家解读结果的投资经理。

你必须返回严格的 JSON 对象，schema 如下，**不要输出任何额外文字、Markdown 或代码围栏**：
{
  "conclusion": "1 段（3-5 句话）的整体表现总评：是否击败基准、风险/收益是否合理、值不值得继续深入研究。结尾必须包含'建议保留 / 建议改进 / 建议放弃'之一。",
  "aiExplanation": [
    "4-6 条要点字符串，每条覆盖一个具体观察：命中较好的因子或区间（带数字）、失败/风险点（如最大回撤、特定年度跑输等，带数字）、与基准的关键差异、后续研究建议（如增加因子、调整再平衡频率、换股票池等）。"
  ]
}

aiExplanation 必须是字符串数组，长度 4-6。每条不要带前缀符号（如 "- " 或 "* "），保持纯文本。`;

export interface ConclusionInputResult {
  metrics: unknown;
  factorDiagnostics: unknown;
  annualReturns: unknown;
}

export interface ConclusionInputStudy {
  hypothesis: string;
  universe: string;
  benchmark: string;
  rebalance: string;
  startDate: Date | string;
  endDate: Date | string;
}

function buildConclusionUserMessage(
  study: ConclusionInputStudy,
  result: ConclusionInputResult,
): string {
  const start =
    typeof study.startDate === "string"
      ? study.startDate.slice(0, 10)
      : study.startDate.toISOString().slice(0, 10);
  const end =
    typeof study.endDate === "string"
      ? study.endDate.slice(0, 10)
      : study.endDate.toISOString().slice(0, 10);
  return [
    "请基于以下回测结果生成解读，按指定 JSON schema 输出：",
    "",
    `<hypothesis>${study.hypothesis}</hypothesis>`,
    `<universe>${study.universe}</universe>`,
    `<benchmark>${study.benchmark}</benchmark>`,
    `<date_range>${start} → ${end}</date_range>`,
    `<rebalance>${study.rebalance}</rebalance>`,
    "",
    "<metrics>",
    JSON.stringify(result.metrics, null, 2),
    "</metrics>",
    "",
    "<annual_returns>",
    JSON.stringify(result.annualReturns, null, 2),
    "</annual_returns>",
    "",
    "<factor_diagnostics>",
    JSON.stringify(result.factorDiagnostics, null, 2),
    "</factor_diagnostics>",
  ].join("\n");
}

export interface ParsedStudyConclusion {
  conclusion: string;
  aiExplanation: string[];
}

export async function generateStudyConclusion(
  study: ConclusionInputStudy,
  result: ConclusionInputResult,
): Promise<ParsedStudyConclusion> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CONCLUSION_SYSTEM_PROMPT },
      {
        role: "user",
        content: buildConclusionUserMessage(study, result),
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) {
    return { conclusion: "", aiExplanation: [] };
  }

  try {
    const parsed = JSON.parse(raw) as {
      conclusion?: unknown;
      aiExplanation?: unknown;
    };
    const conclusion =
      typeof parsed.conclusion === "string" ? parsed.conclusion.trim() : "";
    const aiExplanation = Array.isArray(parsed.aiExplanation)
      ? parsed.aiExplanation
          .filter((p): p is string => typeof p === "string")
          .map((p) => p.replace(/^\s*[-*]\s+/, "").trim())
          .filter((p) => p.length > 0)
      : [];

    if (!conclusion && aiExplanation.length === 0) {
      // JSON parsed but had neither field — fall back to raw text so the UI
      // shows something instead of an empty card.
      return { conclusion: raw, aiExplanation: [] };
    }
    return { conclusion, aiExplanation };
  } catch {
    // Model deviated from JSON mode — show the raw text rather than 500.
    return { conclusion: raw, aiExplanation: [] };
  }
}

// ============================================================
// Sprint #3 — hypothesis coach (multi-turn dialogue)
//
// Goal: walk a quant beginner through a 3-12 turn dialogue and emit a
// fully-formed hypothesis + parameter dict at the end.
//
// The coach asks ONE focused question per turn, with at most 3 suggested
// answers when relevant. When the model thinks the hypothesis is complete,
// it returns a special "[FINAL]" line followed by a JSON object with the
// shape consumed by /studies/new.
// ============================================================

import { exampleSummaryForFewShot } from "@/data/exampleHypotheses";

const COACH_SYSTEM_PROMPT_TEMPLATE = `你是一名耐心的量化研究教练，目标是通过对话帮助量化新手把模糊的投资想法逐步完善为一个**完整、可回测、参数齐全**的研究假设。

## 用户画像
- 有投资经验，但量化建模经验有限。
- 对常见因子（动量、价值、质量、低波）有耳闻但不熟悉细节。
- 容易被参数选择搞晕（回看期、再平衡频率、桶宽）。

## 对话策略
1. **每轮只问一个最关键的问题**。绝不一次问 2 个问题。
2. **必要时给出 2-3 个明确选项**，每个选项一句话解释取舍。
3. 用户回答后，**简短复述**对方的方向再追问下一项，让用户感到被理解。
4. **避免术语冷启动**：先问"你最近对哪类股票/市场现象有想法？"再深入参数。
5. **轮数自适应**：用户输入清晰且经验足时 3-5 轮可结束；用户回答简短或要求更多解释时 6-12 轮。

## 必须收集到的字段
1. **hypothesis** — 一句话假设，必须包含主体（哪类股票）+ 信号（什么因子）+ 时间窗口 + 基准
2. **factorMix** — "momentum"（仅动量）或 "multifactor"（多因子）
3. **rebalance** — "月度" 或 "季度"
4. **universe** — 默认 "US Large Cap (Russell 1000)"，除非用户明确要求其他
5. **startDate / endDate** — 默认 2014-01-01 → 2024-01-01（10 年）
6. **benchmark** — "SPY"/"QQQ"/"IWM"，默认 SPY
7. **txCostBps** — 默认 5

## 输出格式

### 仍在对话阶段（绝大多数轮次）
直接输出对用户的简体中文回应，不要包裹任何 JSON 或代码块。

### 准备结束对话时（最后一轮）
**必须**且**只**输出以下两段：

第一段：一句话总结收集到的假设。
第二段：以独立一行 \`[FINAL]\` 开头，紧跟一个 JSON 对象，字段如下：

\`\`\`
[FINAL]
{
  "hypothesis": "完整的一句话假设",
  "factorMix": "momentum" 或 "multifactor",
  "rebalance": "月度" 或 "季度",
  "universe": "US Large Cap (Russell 1000)",
  "startDate": "2014-01-01",
  "endDate": "2024-01-01",
  "benchmark": "SPY",
  "txCostBps": 5
}
\`\`\`

JSON 必须可被 JSON.parse 解析。不要在 JSON 后追加任何文字。

## 例子库（仅供你参考方向，不要直接照抄；用户可能想要你没列出的方向）
${"<<EXAMPLES>>"}`;

interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Stream one coach turn. Caller passes the full conversation history; we
 * prepend the system prompt with the example library injected as few-shot
 * context. Yields text deltas like streamStudyPlan does.
 */
export async function* streamCoachTurn(
  history: CoachMessage[],
): AsyncGenerator<string, void, void> {
  const client = getClient();
  const systemPrompt = COACH_SYSTEM_PROMPT_TEMPLATE.replace(
    "<<EXAMPLES>>",
    exampleSummaryForFewShot(),
  );

  const stream = await client.chat.completions.create({
    model: MODEL,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.7,
    messages: [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export interface CoachFinalPayload {
  hypothesis: string;
  factorMix: "momentum" | "multifactor";
  rebalance: string;
  universe: string;
  startDate: string;
  endDate: string;
  benchmark: string;
  txCostBps: number;
}

/**
 * Detect whether a (possibly partial) coach response contains the [FINAL]
 * sentinel + JSON block. Returns the parsed payload or null. Robust against
 * surrounding code-fence, leading whitespace, and post-JSON garbage.
 */
export function parseCoachFinal(text: string): CoachFinalPayload | null {
  const sentinelIdx = text.indexOf("[FINAL]");
  if (sentinelIdx === -1) return null;
  const after = text.slice(sentinelIdx + "[FINAL]".length);
  // Find the first '{' and the matching final '}' by brace-counting.
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
  const jsonRaw = after.slice(start, end + 1);
  try {
    const parsed = JSON.parse(jsonRaw) as Partial<CoachFinalPayload>;
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

/**
 * Strip the [FINAL]…JSON block from a coach response so we can show the
 * preceding human-readable summary in the chat without leaking JSON.
 */
export function stripCoachFinalBlock(text: string): string {
  const idx = text.indexOf("[FINAL]");
  if (idx === -1) return text;
  return text.slice(0, idx).trim();
}

// ============================================================
// Concise study title generation
//
// Previously /api/studies POST took the first 60 chars of the hypothesis
// as the title — that produced ugly truncated mid-sentence labels like
// "美股大盘股中，综合质量因子（ROIC/ROE/毛利率）与价值因子（PE/PB/PS..."
//
// This helper asks DeepSeek to compress the hypothesis into 8-16 chars
// emphasizing factor / strategy core. Falls back to a heuristic on AI
// failure so study creation never blocks on the AI service.
// ============================================================

const TITLE_SYSTEM_PROMPT = `你是一名量化研究助理。任务：把投资假设压缩成一个 8-16 字的简体中文研究标题。

## 输出要求
- 只输出标题本身，不要引号、不要前缀、不要解释、不要标点结尾
- 突出策略核心：因子组合 + 关键参数（如有）
- 略去常见通用词："美股"、"策略"、"组合"、"研究"、"回测"、"基准"、"SPY"
- 不要包含具体百分比、年限、bps 等数字细节
- 最长 16 字，最短 8 字

## 例子
假设：美股大盘股中，过去 12 个月（跳过最近 1 月）涨幅最高的 Top 20% 标的，季度调仓后 10 年回测可跑赢 SPY 基准。
标题：12-1 月价格动量

假设：综合质量因子（ROIC/ROE/毛利率）与价值因子（PE/PB/PS）的组合策略，扣除交易成本后跑赢 SPY。
标题：Quality + Value 多因子

假设：美股大盘股中，过去 12 个月波动率最低的 Top 20% 标的，能以低风险获得不输市场的回报。
标题：低波动率防御组合

假设：高 ROIC + 低 PE 的双因子排序合成，季度调仓选 Top 20%，跑赢 SPY 5 个百分点。
标题：高 ROIC × 低 PE 双因子

假设：美股大盘股中，市净率（P/B）最低的 Top 20% 标的跑赢 SPY。
标题：低 P/B 价值因子`;

const TITLE_FALLBACK_MAX = 24; // hard cap on heuristic fallback length

/**
 * Heuristic fallback title — keyword-pattern matching when AI is unavailable.
 * Catches the common factors so failed AI calls still produce a half-decent
 * label. Returns a slice-of-hypothesis as last resort.
 */
function heuristicTitle(hypothesis: string): string {
  const h = hypothesis.toLowerCase();
  const has = (...needles: string[]) =>
    needles.some((n) => h.includes(n.toLowerCase()));
  const tags: string[] = [];
  if (has("12-1", "12 个月", "12个月")) tags.push("12-1 动量");
  else if (has("9-1", "9 个月")) tags.push("9-1 动量");
  else if (has("6-1", "6 个月")) tags.push("6-1 动量");
  else if (has("动量", "momentum")) tags.push("动量");
  if (has("价值", "value", "pe", "pb", "ps")) tags.push("价值");
  if (has("质量", "quality", "roe", "roic", "毛利率", "gross margin"))
    tags.push("质量");
  if (has("低波", "波动率最低", "low vol")) tags.push("低波动");
  if (has("低 d", "低负债", "debt/equity", "负债权益")) tags.push("低杠杆");
  if (has("高股息", "股息", "dividend")) tags.push("高股息");
  if (tags.length >= 2) return `${tags.join(" + ")} 组合`;
  if (tags.length === 1) return `${tags[0]}因子`;
  // Last resort: trimmed slice of hypothesis up to first punctuation.
  const cut = hypothesis.replace(/[，。、；,.;].*$/, "").trim();
  return (cut || hypothesis).slice(0, TITLE_FALLBACK_MAX);
}

/**
 * Compress a hypothesis into an 8-16 char study title via DeepSeek.
 * Never throws — falls back to a heuristic on failure.
 *
 * Bills against the user's plan quota (single AI call, lightweight).
 */
export async function generateStudyTitle(hypothesis: string): Promise<string> {
  const trimmed = hypothesis.trim();
  if (trimmed.length === 0) return "未命名研究";
  // If hypothesis is already short enough to use as-is, skip the AI call.
  if (trimmed.length <= 18) return trimmed;

  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 60,
      temperature: 0.3, // low temp = deterministic, same hypothesis → same title
      messages: [
        { role: "system", content: TITLE_SYSTEM_PROMPT },
        { role: "user", content: `假设：${trimmed}\n标题：` },
      ],
    });
    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    // Defensive cleanup: strip trailing punctuation, quotes, "标题：" prefix.
    const cleaned = raw
      .replace(/^["「『'《标题：:\s]+/u, "")
      .replace(/["」』'》。.，,；;:\s]+$/u, "")
      .trim();
    // Sanity bounds: 4-24 chars. Anything wildly outside falls back.
    if (cleaned.length >= 4 && cleaned.length <= 24) {
      return cleaned;
    }
    return heuristicTitle(trimmed);
  } catch (err) {
    console.warn(
      "[ai] generateStudyTitle failed, using heuristic:",
      err instanceof Error ? err.message : err,
    );
    return heuristicTitle(trimmed);
  }
}
