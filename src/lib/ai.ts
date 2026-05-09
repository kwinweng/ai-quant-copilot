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
// Per-user per-day quota — cheap protection against runaway costs.
// ============================================================

export type UsageKind = "plan" | "conclusion";

const DEFAULT_QUOTAS: Record<UsageKind, number> = {
  plan: 10,
  conclusion: 20,
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
    select: { planCalls: true, conclusionCalls: true },
  });
  const used = row
    ? kind === "plan"
      ? row.planCalls
      : row.conclusionCalls
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
    kind === "plan" ? { planCalls: { increment: 1 } } : { conclusionCalls: { increment: 1 } };
  await prisma.aiUsageDay.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      planCalls: kind === "plan" ? 1 : 0,
      conclusionCalls: kind === "conclusion" ? 1 : 0,
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
