// Phase 13 — Debate context summarizer.
//
// A full StudyResult is ~30k tokens of JSON (equity curve has 120+ monthly
// points, factor diagnostics + bootstrap CI + attribution all stack up). The
// three agents (Regan / Jayzee / Quinn) don't need the raw arrays — they
// need a compact, well-labelled summary they can reason over and cite.
//
// This module produces a flat object of clearly-named "data references" that
// the prompts ask the agents to quote verbatim when making claims. We later
// post-process agent output to verify they're citing real keys (see
// debate.ts validation).

export interface DebateContextInput {
  study: {
    title: string;
    hypothesis: string;
    universe: string;
    benchmark: string;
    rebalance: string;
    startDate: Date | string;
    endDate: Date | string;
    factorMix: string;
    costModel: string;
  };
  result: {
    metrics: unknown;
    equityCurve?: unknown;
    drawdown?: unknown;
    annualReturns?: unknown;
    factorDiagnostics?: unknown;
    monthlyReturns?: unknown;
    rebalanceHistory?: unknown;
    dataQuality?: unknown;
    parameterSensitivity?: unknown;
    factorCoverage?: unknown;
    factorBreakdown?: unknown;
    robustness?: unknown;
    benchmarkAttribution?: unknown;
  };
}

export interface DebateContext {
  /** Compact text block injected into agent prompts. */
  text: string;
  /** Set of canonical reference tokens the agents are allowed to cite. */
  references: Set<string>;
}

// ---- Helpers --------------------------------------------------------------

function fmtPct(n: unknown, digits = 2): string {
  if (typeof n !== "number" || !isFinite(n)) return "n/a";
  return `${n.toFixed(digits)}%`;
}

function fmtNum(n: unknown, digits = 2): string {
  if (typeof n !== "number" || !isFinite(n)) return "n/a";
  return n.toFixed(digits);
}

function ymd(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

interface MetricsShape {
  strategy?: Record<string, unknown>;
  spy?: Record<string, unknown>;
}

interface AnnualReturn {
  year: string;
  strategy: number;
  spy: number;
}

interface DrawdownPoint {
  date: string;
  strategy: number;
  spy: number;
}

interface FactorDiagnostic {
  factor: string;
  ic: number;
  icir: number;
  topQuintileReturn: number;
  bottomQuintileReturn: number;
  spread: number;
}

interface RobustnessShape {
  whole?: { cagr?: number; sharpe?: number; maxDrawdown?: number; monthsCount?: number };
  inSample?: { cagr?: number; sharpe?: number; maxDrawdown?: number; label?: string };
  outOfSample?: { cagr?: number; sharpe?: number; maxDrawdown?: number; label?: string };
  bootstrap?: {
    sharpe?: { mean?: number; ci95Lower?: number; ci95Upper?: number };
    cagr?: { mean?: number; ci95Lower?: number; ci95Upper?: number };
    maxDrawdown?: { mean?: number; ci95Lower?: number; ci95Upper?: number };
  };
}

interface BenchmarkAttributionShape {
  benchmarks?: Array<{
    ticker: string;
    label: string;
    alphaAnnualPct: number;
    beta: number;
    rSquared: number;
  }>;
}

// ---- Main -----------------------------------------------------------------

export function buildDebateContext(input: DebateContextInput): DebateContext {
  const refs = new Set<string>();
  const lines: string[] = [];
  const ref = (key: string) => {
    refs.add(key);
    return key;
  };

  const s = input.study;
  const r = input.result;
  const m = (r.metrics as MetricsShape) ?? {};

  lines.push("## 研究背景");
  lines.push(`标题：${s.title}`);
  lines.push(`假设：${s.hypothesis}`);
  lines.push(
    `回测窗口：${ymd(s.startDate)} → ${ymd(s.endDate)}（${s.rebalance}调仓，基准 ${s.benchmark}）`,
  );
  lines.push(`股票池：${s.universe}　因子组合：${s.factorMix}　成本模型：${s.costModel}`);
  lines.push("");

  // -- Metrics ----
  lines.push("## 关键指标 (策略 vs 基准)");
  const strat = (m.strategy ?? {}) as Record<string, unknown>;
  const bench = (m.spy ?? {}) as Record<string, unknown>;
  const metricKeys: Array<{ key: string; label: string; pct: boolean }> = [
    { key: "cagr", label: "CAGR", pct: true },
    { key: "sharpe", label: "Sharpe", pct: false },
    { key: "maxDrawdown", label: "MaxDD", pct: true },
    { key: "calmar", label: "Calmar", pct: false },
    { key: "annualVol", label: "AnnualVol", pct: true },
    { key: "beta", label: "Beta", pct: false },
    { key: "alpha", label: "Alpha", pct: true },
    { key: "informationRatio", label: "IR", pct: false },
    { key: "winRate", label: "WinRate", pct: true },
    { key: "turnover", label: "Turnover", pct: true },
  ];
  for (const mk of metricKeys) {
    const sv = strat[mk.key];
    const bv = bench[mk.key];
    const fmt = mk.pct ? fmtPct : fmtNum;
    lines.push(
      `${mk.label}: 策略 ${fmt(sv)} / 基准 ${fmt(bv)}  [ref: metrics.${mk.key}]`,
    );
    ref(`metrics.${mk.key}`);
  }
  lines.push("");

  // -- Annual returns: keep all years, very compact ----
  const annuals = (r.annualReturns ?? []) as AnnualReturn[];
  if (Array.isArray(annuals) && annuals.length > 0) {
    lines.push("## 年度收益 (%)");
    for (const a of annuals) {
      const active = (a.strategy - a.spy).toFixed(1);
      lines.push(
        `${a.year}: 策略 ${fmtPct(a.strategy, 1)} / 基准 ${fmtPct(a.spy, 1)} / 主动 ${active}pp  [ref: annual.${a.year}]`,
      );
      ref(`annual.${a.year}`);
    }
    lines.push("");
  }

  // -- Drawdown: just the worst-N points + the trough ----
  const dds = (r.drawdown ?? []) as DrawdownPoint[];
  if (Array.isArray(dds) && dds.length > 0) {
    const sorted = [...dds]
      .filter((d) => typeof d.strategy === "number")
      .sort((a, b) => a.strategy - b.strategy);
    const worst = sorted.slice(0, 5);
    lines.push("## 最深回撤区间 (策略 5 个最差时点)");
    for (const w of worst) {
      lines.push(
        `${w.date}: 策略 ${fmtPct(w.strategy, 1)} / 基准 ${fmtPct(w.spy ?? 0, 1)}  [ref: drawdown.${w.date}]`,
      );
      ref(`drawdown.${w.date}`);
    }
    lines.push("");
  }

  // -- Factor diagnostics ----
  const fd = (r.factorDiagnostics ?? []) as FactorDiagnostic[];
  if (Array.isArray(fd) && fd.length > 0) {
    lines.push("## 因子诊断");
    for (const f of fd) {
      lines.push(
        `${f.factor}: IC ${fmtNum(f.ic, 3)} / ICIR ${fmtNum(f.icir, 2)} / Top-Bot spread ${fmtPct(f.spread, 2)}  [ref: factor.${f.factor}]`,
      );
      ref(`factor.${f.factor}`);
    }
    lines.push("");
  }

  // -- Robustness ----
  const rob = (r.robustness ?? null) as RobustnessShape | null;
  if (rob) {
    lines.push("## 稳健性 (Phase 8)");
    if (rob.whole) {
      lines.push(
        `全样本: CAGR ${fmtPct(rob.whole.cagr, 2)} / Sharpe ${fmtNum(rob.whole.sharpe, 2)} / MaxDD ${fmtPct(rob.whole.maxDrawdown, 2)} (${rob.whole.monthsCount ?? "?"}m)  [ref: robustness.whole]`,
      );
      ref("robustness.whole");
    }
    if (rob.inSample) {
      lines.push(
        `样本内: CAGR ${fmtPct(rob.inSample.cagr, 2)} / Sharpe ${fmtNum(rob.inSample.sharpe, 2)} / MaxDD ${fmtPct(rob.inSample.maxDrawdown, 2)}  [ref: robustness.inSample]`,
      );
      ref("robustness.inSample");
    }
    if (rob.outOfSample) {
      lines.push(
        `样本外: CAGR ${fmtPct(rob.outOfSample.cagr, 2)} / Sharpe ${fmtNum(rob.outOfSample.sharpe, 2)} / MaxDD ${fmtPct(rob.outOfSample.maxDrawdown, 2)}  [ref: robustness.outOfSample]`,
      );
      ref("robustness.outOfSample");
    }
    if (rob.bootstrap) {
      const bs = rob.bootstrap;
      if (bs.sharpe) {
        lines.push(
          `Bootstrap Sharpe 95% CI: [${fmtNum(bs.sharpe.ci95Lower, 2)}, ${fmtNum(bs.sharpe.ci95Upper, 2)}] (mean ${fmtNum(bs.sharpe.mean, 2)})  [ref: bootstrap.sharpe]`,
        );
        ref("bootstrap.sharpe");
      }
      if (bs.cagr) {
        lines.push(
          `Bootstrap CAGR 95% CI: [${fmtPct(bs.cagr.ci95Lower, 2)}, ${fmtPct(bs.cagr.ci95Upper, 2)}] (mean ${fmtPct(bs.cagr.mean, 2)})  [ref: bootstrap.cagr]`,
        );
        ref("bootstrap.cagr");
      }
      if (bs.maxDrawdown) {
        lines.push(
          `Bootstrap MaxDD 95% CI: [${fmtPct(bs.maxDrawdown.ci95Lower, 2)}, ${fmtPct(bs.maxDrawdown.ci95Upper, 2)}] (mean ${fmtPct(bs.maxDrawdown.mean, 2)})  [ref: bootstrap.maxDrawdown]`,
        );
        ref("bootstrap.maxDrawdown");
      }
    }
    lines.push("");
  }

  // -- Multi-benchmark attribution ----
  const ba = (r.benchmarkAttribution ?? null) as BenchmarkAttributionShape | null;
  if (ba && Array.isArray(ba.benchmarks)) {
    lines.push("## 多基准 OLS 归因 (Phase 9)");
    for (const b of ba.benchmarks) {
      lines.push(
        `${b.ticker} (${b.label}): α ${fmtPct(b.alphaAnnualPct, 2)} / β ${fmtNum(b.beta, 2)} / R² ${fmtNum(b.rSquared, 3)}  [ref: attribution.${b.ticker}]`,
      );
      ref(`attribution.${b.ticker}`);
    }
    lines.push("");
  }

  // -- Data quality (short) ----
  const dq = (r.dataQuality ?? {}) as Record<string, unknown>;
  if (dq && Object.keys(dq).length > 0) {
    lines.push("## 数据质量");
    const universeSize = dq.universeSize;
    const survivor = dq.survivorshipBias;
    const months = dq.backtestMonths;
    const rebalances = dq.rebalanceCount;
    lines.push(
      `股票池规模: ${universeSize ?? "?"}　幸存者偏差: ${survivor ? "存在" : "无标注"}　回测月数: ${months ?? "?"}　调仓次数: ${rebalances ?? "?"}  [ref: dataQuality]`,
    );
    ref("dataQuality");
    lines.push("");
  }

  const text = lines.join("\n");
  return { text, references: refs };
}

/**
 * Soft-validate that an agent's reply only cites references that exist in the
 * provided context. Returns the count of valid + total citations and the
 * unknown tokens (if any) — caller decides whether to retry or accept.
 *
 * We treat citations as anything matching `[ref: <token>]` (case-insensitive).
 */
export function validateCitations(
  reply: string,
  context: DebateContext,
): {
  cited: string[];
  invalid: string[];
  validRatio: number;
} {
  const cited: string[] = [];
  const invalid: string[] = [];
  const re = /\[ref:\s*([a-zA-Z0-9_.\-一-鿿]+)\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(reply))) {
    const token = m[1];
    cited.push(token);
    if (!context.references.has(token)) invalid.push(token);
  }
  const total = cited.length;
  const validCount = total - invalid.length;
  const validRatio = total === 0 ? 0 : validCount / total;
  return { cited, invalid, validRatio };
}
