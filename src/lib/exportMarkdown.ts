// Phase 3.1: client-safe markdown export of a completed Study + StudyResult.
// Reads from the API-shaped objects only — no Prisma / server imports — so it
// can be called from the browser to trigger a download.

interface MetricsBlock {
  cagr: number;
  sharpe: number;
  maxDrawdown: number;
  calmar: number;
  annualVol: number;
  beta: number;
  alpha: number;
  informationRatio: number | null;
  turnover: number | null;
  winRate: number | null;
}

interface MonthlyReturn {
  date: string;
  strategy: number;
  benchmark: number;
  active: number;
}

interface RebalanceEntry {
  date: string;
  holdings: string[];
  turnover: number;
  txCostApplied: number;
}

interface FactorDiagnostic {
  factor: string;
  ic: number;
  icir: number;
  topQuintileReturn: number;
  bottomQuintileReturn: number;
  spread: number;
}

interface DataQuality {
  universeSize?: number;
  universeNote?: string;
  survivorshipBias?: boolean;
  survivorshipNote?: string;
  factorType?: string;
  factorTypeNote?: string;
  advisoryDisclaimer?: string;
  benchmarkTicker?: string;
  backtestMonths?: number;
  rebalanceCount?: number;
  priceCoverage?: {
    totalDataPoints?: number;
    missingTickers?: string[];
    coveragePct?: number;
  };
}

interface SensitivityVariant {
  label: string;
  cagr: number;
  sharpe: number;
  maxDrawdown: number;
  alpha: number;
  informationRatio: number | null;
  isBaseline: boolean;
}

interface ParameterSensitivity {
  baseline: {
    lookbackMonths: number;
    skipMonths: number;
    rebalanceMonths: number;
    topQuintilePct: number;
  };
  byLookback: SensitivityVariant[];
  byRebalance: SensitivityVariant[];
  byQuintile: SensitivityVariant[];
  generatedAt: string;
}

export interface ExportResult {
  conclusion: string;
  metrics: { strategy: MetricsBlock; spy: MetricsBlock };
  factorDiagnostics?: FactorDiagnostic[];
  annualReturns?: { year: string; strategy: number; spy: number }[];
  monthlyReturns?: MonthlyReturn[];
  rebalanceHistory?: RebalanceEntry[];
  dataQuality?: DataQuality;
  aiExplanation?: string[];
  parameterSensitivity?: ParameterSensitivity | null;
}

export interface ExportStudy {
  id: string;
  title: string;
  hypothesis: string;
  universe: string;
  startDate: string;
  endDate: string;
  rebalance: string;
  benchmark: string;
  txCostBps: number;
}

function fmt(n: number | null | undefined, suffix = ""): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n}${suffix}`;
}

function pickBestWorst(monthly: MonthlyReturn[] | undefined, n = 5) {
  if (!monthly || monthly.length === 0) return { best: [], worst: [] };
  const sorted = [...monthly].sort((a, b) => b.strategy - a.strategy);
  return {
    best: sorted.slice(0, n),
    worst: sorted.slice(-n).reverse(),
  };
}

export function generateResultMarkdown(
  study: ExportStudy,
  result: ExportResult,
): string {
  const { strategy: s, spy } = result.metrics;
  const dq = result.dataQuality ?? {};
  const { best, worst } = pickBestWorst(result.monthlyReturns);
  const lines: string[] = [];

  lines.push(`# ${study.title}`);
  lines.push("");
  lines.push("> 由 AI Quant Copilot 生成 · " + new Date().toISOString().slice(0, 10));
  lines.push("");

  // Hypothesis
  lines.push("## 投资假设");
  lines.push("");
  lines.push(study.hypothesis);
  lines.push("");

  // Parameters
  lines.push("## 研究参数");
  lines.push("");
  lines.push(`| 字段 | 值 |`);
  lines.push(`| --- | --- |`);
  lines.push(`| 研究编号 | \`${study.id}\` |`);
  lines.push(`| 股票池 | ${study.universe} |`);
  lines.push(`| 回测区间 | ${study.startDate.slice(0, 10)} → ${study.endDate.slice(0, 10)} |`);
  lines.push(`| 再平衡频率 | ${study.rebalance} |`);
  lines.push(`| 基准 | ${study.benchmark} |`);
  lines.push(`| 交易成本 | ${study.txCostBps} bps / 笔 |`);
  lines.push("");

  // Data Quality & Bias — placed early for visibility per Phase 3.1 spec.
  lines.push("## 数据质量与偏差");
  lines.push("");
  if (dq.universeNote) lines.push(`- **股票池构成**：${dq.universeNote}`);
  if (dq.survivorshipNote)
    lines.push(`- **幸存者偏差**：${dq.survivorshipNote}`);
  if (dq.factorTypeNote) lines.push(`- **因子类型**：${dq.factorTypeNote}`);
  if (dq.advisoryDisclaimer)
    lines.push(`- **免责声明**：${dq.advisoryDisclaimer}`);
  if (dq.priceCoverage) {
    const { totalDataPoints, missingTickers = [], coveragePct } = dq.priceCoverage;
    lines.push(
      `- **价格覆盖**：${totalDataPoints ?? 0} 个月度数据点（覆盖率约 ${coveragePct ?? "—"}%）${missingTickers.length > 0 ? `；缺失 ${missingTickers.length} 只标的：\`${missingTickers.join(", ")}\`` : ""}`,
    );
  }
  lines.push("");

  // AI Conclusion
  if (result.conclusion) {
    lines.push("## AI 结论");
    lines.push("");
    lines.push(result.conclusion);
    lines.push("");
  }
  if (result.aiExplanation && result.aiExplanation.length > 0) {
    lines.push("### AI 解释要点");
    lines.push("");
    for (const p of result.aiExplanation) lines.push(`- ${p}`);
    lines.push("");
  }

  // Metrics
  lines.push("## 关键指标");
  lines.push("");
  lines.push(`| 指标 | 策略 | 基准 |`);
  lines.push(`| --- | ---: | ---: |`);
  lines.push(`| CAGR | ${fmt(s.cagr, "%")} | ${fmt(spy.cagr, "%")} |`);
  lines.push(`| Sharpe | ${fmt(s.sharpe)} | ${fmt(spy.sharpe)} |`);
  lines.push(`| Max Drawdown | ${fmt(s.maxDrawdown, "%")} | ${fmt(spy.maxDrawdown, "%")} |`);
  lines.push(`| Calmar | ${fmt(s.calmar)} | ${fmt(spy.calmar)} |`);
  lines.push(`| 年化波动率 | ${fmt(s.annualVol, "%")} | ${fmt(spy.annualVol, "%")} |`);
  lines.push(`| Beta | ${fmt(s.beta)} | ${fmt(spy.beta)} |`);
  lines.push(`| Alpha (年化) | ${fmt(s.alpha, "%")} | 0% |`);
  lines.push(`| IR | ${fmt(s.informationRatio)} | — |`);
  lines.push(`| 月度胜率 | ${fmt(s.winRate, "%")} | — |`);
  lines.push(`| 年化换手率 | ${fmt(s.turnover, "%")} | — |`);
  lines.push("");

  // Annual returns
  if (result.annualReturns && result.annualReturns.length > 0) {
    lines.push("## 年度收益");
    lines.push("");
    lines.push(`| 年份 | 策略 | 基准 | 超额 |`);
    lines.push(`| --- | ---: | ---: | ---: |`);
    for (const a of result.annualReturns) {
      lines.push(
        `| ${a.year} | ${fmt(a.strategy, "%")} | ${fmt(a.spy, "%")} | ${fmt(Math.round((a.strategy - a.spy) * 100) / 100, "%")} |`,
      );
    }
    lines.push("");
  }

  // Best / Worst months
  if (best.length > 0) {
    lines.push("## 最佳 / 最差月份");
    lines.push("");
    lines.push(`### 最佳 ${best.length} 个月`);
    lines.push("");
    lines.push(`| 月份 | 策略 | 基准 | 超额 |`);
    lines.push(`| --- | ---: | ---: | ---: |`);
    for (const m of best) {
      lines.push(
        `| ${m.date} | ${(m.strategy * 100).toFixed(2)}% | ${(m.benchmark * 100).toFixed(2)}% | ${(m.active * 100).toFixed(2)}% |`,
      );
    }
    lines.push("");
    lines.push(`### 最差 ${worst.length} 个月`);
    lines.push("");
    lines.push(`| 月份 | 策略 | 基准 | 超额 |`);
    lines.push(`| --- | ---: | ---: | ---: |`);
    for (const m of worst) {
      lines.push(
        `| ${m.date} | ${(m.strategy * 100).toFixed(2)}% | ${(m.benchmark * 100).toFixed(2)}% | ${(m.active * 100).toFixed(2)}% |`,
      );
    }
    lines.push("");
  }

  // Factor diagnostics
  if (result.factorDiagnostics && result.factorDiagnostics.length > 0) {
    lines.push("## 因子诊断");
    lines.push("");
    lines.push(`| 因子 | IC | IC IR | Q1 收益 | Q5 收益 | 价差 |`);
    lines.push(`| --- | ---: | ---: | ---: | ---: | ---: |`);
    for (const f of result.factorDiagnostics) {
      lines.push(
        `| ${f.factor} | ${f.ic.toFixed(3)} | ${f.icir.toFixed(2)} | ${f.topQuintileReturn}% | ${f.bottomQuintileReturn}% | ${f.spread}% |`,
      );
    }
    lines.push("");
  }

  // Parameter sensitivity (Phase 3.1)
  const ps = result.parameterSensitivity;
  if (ps) {
    const writeAxis = (
      title: string,
      rows: SensitivityVariant[],
    ) => {
      if (rows.length === 0) return;
      lines.push(`### ${title}`);
      lines.push("");
      lines.push(`| 参数 | CAGR | Sharpe | Max DD | Alpha | IR |`);
      lines.push(`| --- | ---: | ---: | ---: | ---: | ---: |`);
      for (const r of rows) {
        const tag = r.isBaseline ? " *(基准)*" : "";
        const ir = r.informationRatio == null ? "—" : r.informationRatio.toFixed(2);
        lines.push(
          `| ${r.label}${tag} | ${r.cagr.toFixed(2)}% | ${r.sharpe.toFixed(2)} | ${r.maxDrawdown.toFixed(2)}% | ${r.alpha >= 0 ? "+" : ""}${r.alpha.toFixed(2)}% | ${ir} |`,
        );
      }
      lines.push("");
    };
    lines.push("## 参数敏感性");
    lines.push("");
    lines.push(
      `> 基准：${ps.baseline.lookbackMonths}-${ps.baseline.skipMonths} 动量 · ${ps.baseline.rebalanceMonths === 1 ? "月度" : `${ps.baseline.rebalanceMonths} 月`}再平衡 · Top ${Math.round(ps.baseline.topQuintilePct * 100)}%`,
    );
    lines.push("");
    writeAxis("动量回看期（其他参数固定）", ps.byLookback);
    writeAxis("再平衡频率（其他参数固定）", ps.byRebalance);
    writeAxis("分位桶宽度（其他参数固定）", ps.byQuintile);
  }

  // Rebalance history (cap to 24 most recent for readability; full list is in the UI)
  if (result.rebalanceHistory && result.rebalanceHistory.length > 0) {
    const recent = result.rebalanceHistory.slice(-24);
    lines.push(
      `## 再平衡历史（最近 ${recent.length} 次 / 共 ${result.rebalanceHistory.length} 次）`,
    );
    lines.push("");
    lines.push(`| 日期 | 持仓 | 单边换手 | 交易成本影响 |`);
    lines.push(`| --- | --- | ---: | ---: |`);
    for (const r of recent) {
      lines.push(
        `| ${r.date} | ${r.holdings.join(", ")} | ${(r.turnover * 100).toFixed(1)}% | ${(r.txCostApplied * 10000).toFixed(1)} bps |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
