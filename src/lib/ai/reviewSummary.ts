// Phase 15 — one-shot AI summary for a paper portfolio's quarterly review.
//
// Tiny, cheap, cached. Reuses the conclusion / debate DeepSeek client.

import { getDeepseekClient, DEEPSEEK_MODEL } from "./client";

const REVIEW_SYSTEM_PROMPT = `你是一名经验丰富的量化分析师。基于一份纸面组合的实际持有期数据 vs 回测预期，你需要写一段 2-3 句话的中文总结。

## 风格
- 简体中文
- 总长度 50-120 字
- 直白但有判断："表现优于/劣于预期"是 OK 的，"显著优于市场"这种空话不行
- 必须引用具体数字（hit rate / 跟踪误差 / CAGR 差异）
- 末尾给出 1 条具体的可操作建议（如"考虑加大仓位"、"暂停加仓观察"、"考虑归档"）

## 输出格式
只输出总结正文，不要任何前缀、标题、JSON。`;

export interface ReviewSummaryInput {
  studyTitle: string;
  startMonth: string;
  monthsObserved: number;
  hitRate: number | null;
  trackingError: number | null;
  actualCagr: number | null;
  expectedCagr: number | null;
  executionRate: number | null;
}

function fmtPct(n: number | null, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  return `${(n * 100).toFixed(digits)}%`;
}

/**
 * Generate an AI summary. Never throws — returns a heuristic fallback string
 * on AI failure so the review UI always has something to show.
 */
export async function generateReviewSummary(
  input: ReviewSummaryInput,
): Promise<string> {
  // Heuristic fallback assembled up-front so the catch path doesn't need to
  // re-do the formatting.
  const fallback = heuristicSummary(input);

  // Fast exit: no data, no AI call.
  if (input.monthsObserved < 1) return fallback;

  try {
    const client = getDeepseekClient();
    const userMsg = [
      `研究：${input.studyTitle}`,
      `跟踪起始月：${input.startMonth}`,
      `已观察月数：${input.monthsObserved}`,
      `Hit rate (月度方向一致率)：${fmtPct(input.hitRate, 0)}`,
      `年化跟踪误差：${fmtPct(input.trackingError, 1)}`,
      `实际 CAGR (overlap 区间)：${fmtPct(input.actualCagr, 1)}`,
      `回测 CAGR (同区间)：${fmtPct(input.expectedCagr, 1)}`,
      `调仓建议执行率：${fmtPct(input.executionRate, 0)}`,
    ].join("\n");
    const res = await client.chat.completions.create({
      model: DEEPSEEK_MODEL,
      max_tokens: 220,
      temperature: 0.5,
      messages: [
        { role: "system", content: REVIEW_SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
    });
    const raw = res.choices[0]?.message?.content?.trim() ?? "";
    if (raw.length >= 20 && raw.length <= 400) return raw;
    return fallback;
  } catch (err) {
    console.warn("[reviewSummary] AI call failed, using heuristic:", err);
    return fallback;
  }
}

function heuristicSummary(input: ReviewSummaryInput): string {
  if (input.monthsObserved < 1) {
    return "尚未观察到完整月度数据，等待第一次月度调仓后再生成校准。";
  }
  const cagrGap =
    input.actualCagr != null && input.expectedCagr != null
      ? input.actualCagr - input.expectedCagr
      : null;
  let verdict = "表现接近预期";
  if (cagrGap != null) {
    if (cagrGap > 0.03) verdict = "实际表现优于回测预期";
    else if (cagrGap < -0.03) verdict = "实际表现劣于回测预期";
  }
  const hit = fmtPct(input.hitRate, 0);
  const te = fmtPct(input.trackingError, 1);
  return `${verdict}（${input.monthsObserved} 月样本，月度方向一致率 ${hit}，年化跟踪误差 ${te}）。建议继续跟踪积累更多数据点。`;
}
