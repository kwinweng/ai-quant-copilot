// Phase 13 — debateContext.ts unit tests.
//
// Covers the two critical guarantees the orchestrator depends on:
//   1. buildDebateContext produces a stable set of reference tokens that
//      match what the prompt will instruct agents to cite (metrics.*,
//      annual.YYYY, drawdown.YYYY-MM, factor.*, robustness.*, etc.)
//   2. validateCitations correctly distinguishes valid vs invalid [ref:]
//      tokens so we can detect hallucinated references.

import { describe, expect, it } from "vitest";
import {
  buildDebateContext,
  validateCitations,
  type DebateContextInput,
} from "./debateContext";

function sampleInput(): DebateContextInput {
  return {
    study: {
      title: "测试动量",
      hypothesis: "12-1 月动量跑赢 SPY",
      universe: "US Large Cap",
      benchmark: "SPY",
      rebalance: "Monthly",
      startDate: "2018-01-01",
      endDate: "2024-01-01",
      factorMix: "momentum",
      costModel: "simple",
    },
    result: {
      metrics: {
        strategy: {
          cagr: 12.5,
          sharpe: 0.85,
          maxDrawdown: -22.3,
          calmar: 0.56,
          annualVol: 18.2,
          beta: 1.05,
          alpha: 3.4,
          informationRatio: 0.42,
          winRate: 57,
          turnover: 0.28,
        },
        spy: {
          cagr: 9.1,
          sharpe: 0.65,
          maxDrawdown: -23.9,
          calmar: 0.38,
          annualVol: 16.5,
          beta: 1.0,
          alpha: 0,
          informationRatio: null,
          winRate: 54,
          turnover: 0,
        },
      },
      annualReturns: [
        { year: "2020", strategy: 25, spy: 18 },
        { year: "2021", strategy: 22, spy: 28 },
        { year: "2022", strategy: -18, spy: -19 },
      ],
      drawdown: [
        { date: "2020-03", strategy: -28, spy: -20 },
        { date: "2022-09", strategy: -22, spy: -25 },
        { date: "2018-12", strategy: -15, spy: -14 },
        { date: "2019-05", strategy: -8, spy: -7 },
        { date: "2023-03", strategy: -10, spy: -9 },
      ],
      factorDiagnostics: [
        {
          factor: "Momentum",
          ic: 0.062,
          icir: 0.95,
          topQuintileReturn: 0.18,
          bottomQuintileReturn: 0.05,
          spread: 13,
        },
      ],
      robustness: {
        whole: { cagr: 12.5, sharpe: 0.85, maxDrawdown: -22.3, monthsCount: 72 },
        inSample: { cagr: 14, sharpe: 0.9, maxDrawdown: -18 },
        outOfSample: { cagr: 10.5, sharpe: 0.78, maxDrawdown: -24 },
        bootstrap: {
          sharpe: { mean: 0.85, ci95Lower: 0.55, ci95Upper: 1.15 },
          cagr: { mean: 12.5, ci95Lower: 7, ci95Upper: 18 },
          maxDrawdown: { mean: -22, ci95Lower: -35, ci95Upper: -12 },
        },
      },
      benchmarkAttribution: {
        benchmarks: [
          { ticker: "SPY", label: "标普 500", alphaAnnualPct: 3.4, beta: 1.05, rSquared: 0.92 },
          { ticker: "QQQ", label: "纳指 100", alphaAnnualPct: 1.2, beta: 0.95, rSquared: 0.85 },
        ],
      },
      dataQuality: {
        universeSize: 60,
        survivorshipBias: true,
        backtestMonths: 72,
        rebalanceCount: 72,
      },
    },
  };
}

describe("buildDebateContext", () => {
  it("emits canonical reference tokens for metrics", () => {
    const ctx = buildDebateContext(sampleInput());
    for (const key of [
      "metrics.cagr",
      "metrics.sharpe",
      "metrics.maxDrawdown",
      "metrics.alpha",
    ]) {
      expect(ctx.references.has(key)).toBe(true);
    }
  });

  it("emits annual.YYYY references for each annual return row", () => {
    const ctx = buildDebateContext(sampleInput());
    expect(ctx.references.has("annual.2020")).toBe(true);
    expect(ctx.references.has("annual.2021")).toBe(true);
    expect(ctx.references.has("annual.2022")).toBe(true);
  });

  it("emits factor and attribution references", () => {
    const ctx = buildDebateContext(sampleInput());
    expect(ctx.references.has("factor.Momentum")).toBe(true);
    expect(ctx.references.has("attribution.SPY")).toBe(true);
    expect(ctx.references.has("attribution.QQQ")).toBe(true);
  });

  it("emits robustness + bootstrap references when robustness present", () => {
    const ctx = buildDebateContext(sampleInput());
    expect(ctx.references.has("robustness.whole")).toBe(true);
    expect(ctx.references.has("robustness.inSample")).toBe(true);
    expect(ctx.references.has("robustness.outOfSample")).toBe(true);
    expect(ctx.references.has("bootstrap.sharpe")).toBe(true);
    expect(ctx.references.has("bootstrap.cagr")).toBe(true);
    expect(ctx.references.has("bootstrap.maxDrawdown")).toBe(true);
  });

  it("emits drawdown references for the 5 worst time points", () => {
    const ctx = buildDebateContext(sampleInput());
    expect(ctx.references.has("drawdown.2020-03")).toBe(true);
    expect(ctx.references.has("drawdown.2022-09")).toBe(true);
    // Total count: 5 metrics × varies, but we should have at most 5 drawdowns.
    const ddCount = [...ctx.references].filter((r) => r.startsWith("drawdown.")).length;
    expect(ddCount).toBeLessThanOrEqual(5);
  });

  it("includes the hypothesis and study metadata in text", () => {
    const ctx = buildDebateContext(sampleInput());
    expect(ctx.text).toContain("12-1 月动量跑赢 SPY");
    expect(ctx.text).toContain("SPY");
    expect(ctx.text).toContain("Monthly");
  });

  it("survives missing optional sections without crashing", () => {
    const input: DebateContextInput = {
      study: sampleInput().study,
      result: {
        metrics: { strategy: { cagr: 10 }, spy: { cagr: 8 } },
      },
    };
    const ctx = buildDebateContext(input);
    expect(ctx.references.has("metrics.cagr")).toBe(true);
    expect(ctx.text.length).toBeGreaterThan(0);
  });

  it("keeps context text length reasonable (< 6KB) for compact LLM input", () => {
    const ctx = buildDebateContext(sampleInput());
    // 6KB is a soft budget — agents have 64k context but we don't want to
    // burn tokens on a single context block.
    expect(ctx.text.length).toBeLessThan(6000);
  });
});

describe("validateCitations", () => {
  const baseCtx = buildDebateContext(sampleInput());

  it("returns 1.0 valid ratio when all citations are real", () => {
    const reply =
      "策略明显跑赢基准 [ref: metrics.cagr]，且因子 IC 稳定 [ref: factor.Momentum].";
    const r = validateCitations(reply, baseCtx);
    expect(r.cited.length).toBe(2);
    expect(r.invalid.length).toBe(0);
    expect(r.validRatio).toBe(1);
  });

  it("flags hallucinated tokens as invalid", () => {
    const reply =
      "看 [ref: metrics.cagr] 真不错，再看 [ref: metrics.imaginaryField] 也很强。";
    const r = validateCitations(reply, baseCtx);
    expect(r.cited).toContain("metrics.imaginaryField");
    expect(r.invalid).toContain("metrics.imaginaryField");
    expect(r.invalid).not.toContain("metrics.cagr");
    expect(r.validRatio).toBe(0.5);
  });

  it("returns 0/0 when reply has no citations at all", () => {
    const r = validateCitations("没有任何引用的纯文本。", baseCtx);
    expect(r.cited).toEqual([]);
    expect(r.invalid).toEqual([]);
    expect(r.validRatio).toBe(0);
  });

  it("ignores whitespace inside [ref: ...] brackets", () => {
    const reply = "[ref:   metrics.cagr   ]";
    const r = validateCitations(reply, baseCtx);
    expect(r.cited).toEqual(["metrics.cagr"]);
    expect(r.invalid).toEqual([]);
  });
});
