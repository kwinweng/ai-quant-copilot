import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UNIVERSE, DEFAULT_BENCHMARK, rebalanceMonthsOf } from "./universe";
import { fetchMonthlyPrices } from "./prices";
import { compute121Momentum, computeMomentum } from "./factor";
import type { FactorScores } from "./factor";
import { runBacktest as runEngine } from "./engine";
import type { MonthKey } from "./prices";
import {
  computeAnnualReturns,
  computeDrawdownSeries,
  computeEquityCurve,
  computeFactorDiagnostics,
  computeResultMetrics,
} from "./metrics";
import { getMergedSnapshotsForUniverse } from "@/lib/fundamentals/cache";
import type { FundamentalSnapshot } from "@/lib/fundamentals/types";
import {
  computeCoverage,
  computeMultiFactorScores,
  zscoreMomentumAtMonth,
  type FactorCoverageReport,
} from "@/lib/factors/multifactor";

// Canonical step list for momentum-only studies. Multi-factor studies extend
// this with an extra "拉取基本面数据" step — see stepsForFactorMix below.
const STEPS_MOMENTUM: { name: string; description: string }[] = [
  { name: "校验参数", description: "检查股票池、日期范围和因子定义" },
  { name: "获取股票池价格", description: "从 Yahoo Finance 拉取月度调整收盘价" },
  { name: "获取基准价格", description: "拉取基准（默认 SPY）月度数据" },
  { name: "计算因子得分", description: "12-1 动量因子（避开短期反转）" },
  { name: "构建投资组合", description: "按再平衡频率选 top 20% 等权" },
  { name: "运行回测引擎", description: "月度模拟，应用单边交易成本" },
  { name: "计算风险指标", description: "CAGR、Sharpe、Max DD、Beta、Alpha、IR" },
  {
    name: "敏感性扫描",
    description: "扫描动量回看期、再平衡频率和分位桶宽度",
  },
  { name: "汇总研究结果", description: "保存到数据库，AI 报告由结果页按需生成" },
];

const STEPS_MULTIFACTOR: { name: string; description: string }[] = [
  { name: "校验参数", description: "检查股票池、日期范围和因子定义" },
  { name: "获取股票池价格", description: "从 Yahoo Finance 拉取月度调整收盘价" },
  { name: "获取基准价格", description: "拉取基准（默认 SPY）月度数据" },
  {
    name: "拉取基本面数据",
    description: "Yahoo + SEC EDGAR 混合，按 24h 缓存策略",
  },
  {
    name: "计算因子得分",
    description: "Value + Quality + Momentum 等权 z-score 合成",
  },
  { name: "构建投资组合", description: "按再平衡频率选 top 20% 等权" },
  { name: "运行回测引擎", description: "月度模拟，应用单边交易成本" },
  { name: "计算风险指标", description: "CAGR、Sharpe、Max DD、Beta、Alpha、IR" },
  {
    name: "敏感性扫描",
    description: "扫描动量回看期、再平衡频率和分位桶宽度",
  },
  { name: "汇总研究结果", description: "保存到数据库，AI 报告由结果页按需生成" },
];

export function stepsForFactorMix(
  mix: string,
): { name: string; description: string }[] {
  return mix === "multifactor" ? STEPS_MULTIFACTOR : STEPS_MOMENTUM;
}

// Phase 4: build a multi-factor FactorScores by *combining* (a) the month-
// varying 12-1 momentum series we already compute and (b) a constant Value+
// Quality tilt from today's Yahoo+SEC fundamentals snapshot. Result has the
// same shape as compute121Momentum so the engine can swap it in unchanged.
//
// Caveat (disclosed in dataQuality): Value/Quality are point-in-NOW, not
// point-in-time historical, so this strategy has look-ahead on fundamentals.
// The Phase 4 spec explicitly accepts this trade-off and surfaces it in the
// data-quality panel.
function buildMultiFactorScores(
  momentumScores: FactorScores,
  fundamentals: Record<string, FundamentalSnapshot>,
): FactorScores {
  const tickers = Object.keys(momentumScores);
  if (tickers.length === 0) return {};

  // Cross-sectional z-score helpers — operate on a single static snapshot.
  const fieldZ = (field: keyof FundamentalSnapshot, lowerIsBetter: boolean) => {
    const vals: number[] = [];
    const present = new Map<string, number>();
    for (const t of tickers) {
      const v = fundamentals[t]?.[field];
      if (typeof v === "number" && Number.isFinite(v)) {
        vals.push(v);
        present.set(t, v);
      }
    }
    if (vals.length < 2) return new Map<string, number>();
    const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
    const std = Math.sqrt(
      vals.reduce((s, x) => s + (x - mean) ** 2, 0) / vals.length,
    );
    if (std === 0) return new Map<string, number>();
    const out = new Map<string, number>();
    for (const [t, v] of present) {
      const z = (v - mean) / std;
      out.set(t, lowerIsBetter ? -z : z);
    }
    return out;
  };

  // Lower-is-better: PE / PB / PS / EV-EBITDA / debt-to-equity.
  const peZ = fieldZ("pe", true);
  const pbZ = fieldZ("pb", true);
  const psZ = fieldZ("ps", true);
  const evZ = fieldZ("evEbitda", true);
  const roeZ = fieldZ("roe", false);
  const roicZ = fieldZ("roic", false);
  const gmZ = fieldZ("grossMargin", false);
  const deZ = fieldZ("debtToEquity", true);

  // Constant per-ticker value/quality tilt (does not vary across months).
  const valueQualityZ = new Map<string, number>();
  for (const t of tickers) {
    const components: number[] = [];
    for (const m of [peZ, pbZ, psZ, evZ]) {
      const v = m.get(t);
      if (v !== undefined) components.push(v);
    }
    for (const m of [roeZ, roicZ, gmZ, deZ]) {
      const v = m.get(t);
      if (v !== undefined) components.push(v);
    }
    if (components.length > 0) {
      valueQualityZ.set(
        t,
        components.reduce((s, x) => s + x, 0) / components.length,
      );
    }
  }

  // For each (ticker, month) pair, composite = average of (per-month momentum
  // z-scored cross-sectionally at that month) + (static value/quality z).
  // First, pre-compute cross-sectional momentum z-scores per month so we can
  // mix on the same scale.
  // Collect all months that appear in any ticker's momentum series.
  const allMonths = new Set<MonthKey>();
  for (const t of tickers) {
    for (const k of momentumScores[t]?.keys() ?? []) allMonths.add(k);
  }
  const monthMomZ = new Map<MonthKey, Map<string, number>>();
  for (const month of allMonths) {
    const vals: number[] = [];
    const present = new Map<string, number>();
    for (const t of tickers) {
      const v = momentumScores[t]?.get(month);
      if (typeof v === "number" && Number.isFinite(v)) {
        vals.push(v);
        present.set(t, v);
      }
    }
    if (vals.length < 2) continue;
    const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
    const std = Math.sqrt(
      vals.reduce((s, x) => s + (x - mean) ** 2, 0) / vals.length,
    );
    if (std === 0) continue;
    const out = new Map<string, number>();
    for (const [t, v] of present) out.set(t, (v - mean) / std);
    monthMomZ.set(month, out);
  }

  const composite: FactorScores = {};
  for (const t of tickers) {
    const m = new Map<MonthKey, number>();
    for (const month of allMonths) {
      const momZ = monthMomZ.get(month)?.get(t);
      const vqZ = valueQualityZ.get(t);
      const components: number[] = [];
      if (momZ !== undefined) components.push(momZ);
      if (vqZ !== undefined) components.push(vqZ);
      if (components.length === 0) continue;
      m.set(month, components.reduce((s, x) => s + x, 0) / components.length);
    }
    composite[t] = m;
  }
  return composite;
}

// Phase 3 / 3.1 backwards-compat export. Existing callers read this without
// knowing about factorMix; for the dashboard's "9 vs 10 step" total we now
// derive from the actual stored steps.
export const BACKTEST_STEPS = STEPS_MOMENTUM;

type StepStatus = "pending" | "running" | "complete" | "error";

interface StoredStep {
  name: string;
  description?: string;
  status: StepStatus;
  durationSec?: number;
  note?: string;
}

interface StoredLog {
  ts: string;
  message: string;
  level: "info" | "warning" | "error";
}

const initialSteps = (factorMix: string): StoredStep[] =>
  stepsForFactorMix(factorMix).map((s) => ({
    name: s.name,
    description: s.description,
    status: "pending",
  }));

async function initProgress(
  studyId: string,
  factorMix: string,
): Promise<void> {
  const now = new Date().toISOString();
  await prisma.studyProgress.upsert({
    where: { studyId },
    create: {
      studyId,
      currentStep: 0,
      steps: initialSteps(factorMix) as unknown as Prisma.InputJsonValue,
      logs: [
        { ts: now, message: "回测开始", level: "info" },
      ] as unknown as Prisma.InputJsonValue,
    },
    update: {
      currentStep: 0,
      steps: initialSteps(factorMix) as unknown as Prisma.InputJsonValue,
      logs: [
        { ts: now, message: "回测重启", level: "info" },
      ] as unknown as Prisma.InputJsonValue,
      startedAt: new Date(),
    },
  });
}

async function readStepsAndLogs(
  studyId: string,
): Promise<{ steps: StoredStep[]; logs: StoredLog[] }> {
  const row = await prisma.studyProgress.findUnique({
    where: { studyId },
    select: { steps: true, logs: true },
  });
  // Fallback to momentum-only steps if a row somehow lacks one — only happens
  // for in-memory tests. The real init path always populates it.
  const steps = (row?.steps as unknown as StoredStep[]) ?? initialSteps("momentum");
  const logs = (row?.logs as unknown as StoredLog[]) ?? [];
  return { steps, logs };
}

async function setStep(
  studyId: string,
  index: number,
  status: StepStatus,
  message?: string,
  note?: string,
  durationSec?: number,
): Promise<void> {
  const { steps, logs } = await readStepsAndLogs(studyId);
  if (index >= 0 && index < steps.length) {
    steps[index] = {
      ...steps[index],
      status,
      ...(note !== undefined ? { note } : {}),
      ...(durationSec !== undefined ? { durationSec } : {}),
    };
  }
  if (message) {
    logs.push({
      ts: new Date().toISOString(),
      message,
      level: status === "error" ? "error" : "info",
    });
  }
  // currentStep is the index of the in-flight step; if we just finished one
  // and there's a next one, advance. If the just-completed step is the last,
  // keep currentStep at the last index.
  let currentStep = steps.findIndex((s) => s.status === "running");
  if (currentStep === -1) {
    const lastComplete = steps.findIndex((s) => s.status !== "complete");
    currentStep = lastComplete === -1 ? steps.length - 1 : lastComplete;
  }
  await prisma.studyProgress.update({
    where: { studyId },
    data: {
      steps: steps as unknown as Prisma.InputJsonValue,
      logs: logs as unknown as Prisma.InputJsonValue,
      currentStep,
    },
  });
}

async function appendLog(
  studyId: string,
  message: string,
  level: "info" | "warning" | "error" = "info",
): Promise<void> {
  const { logs } = await readStepsAndLogs(studyId);
  logs.push({ ts: new Date().toISOString(), message, level });
  await prisma.studyProgress.update({
    where: { studyId },
    data: { logs: logs as unknown as Prisma.InputJsonValue },
  });
}

class BacktestCancelled extends Error {
  constructor() {
    super("用户已取消");
    this.name = "BacktestCancelled";
  }
}

// Throws if the user clicked cancel since we last checked. Called at every
// step boundary so a cancelled study doesn't get silently flipped to
// COMPLETED at the end.
async function assertNotCancelled(studyId: string): Promise<void> {
  const row = await prisma.study.findUnique({
    where: { id: studyId },
    select: { status: true },
  });
  if (row?.status === "CANCELLED") {
    throw new BacktestCancelled();
  }
}

function validateStudyInput(study: {
  startDate: Date;
  endDate: Date;
  rebalance: string;
  txCostBps: number;
}): void {
  if (study.startDate >= study.endDate) {
    throw new Error("回测开始日期必须早于结束日期");
  }
  const rebalance = rebalanceMonthsOf(study.rebalance);
  if (!rebalance) {
    throw new Error(`未识别的再平衡频率：${study.rebalance}`);
  }
  if (!Number.isFinite(study.txCostBps) || study.txCostBps < 0) {
    throw new Error("交易成本必须为非负数");
  }
  // We always backtest at least 18 months so factor warm-up + meaningful stats
  // are possible. Demo seed studies use 10-year ranges so this is just a guard.
  const months =
    (study.endDate.getUTCFullYear() - study.startDate.getUTCFullYear()) * 12 +
    (study.endDate.getUTCMonth() - study.startDate.getUTCMonth());
  if (months < 18) {
    throw new Error(
      `回测区间过短（仅 ${months} 个月），至少需要 18 个月以保证因子预热`,
    );
  }
}

// ====================================================================
// Phase 3.1: parameter sensitivity sweep.
//
// Runs a small grid of single-axis variations holding the other parameters at
// the user's chosen baseline. Re-uses already-fetched prices, so each variant
// costs a couple ms — only the engine's monthly loop runs.
//
// Three axes:
//   • lookback: 6-1, 9-1, 12-1 momentum
//   • rebalance frequency: monthly (1) vs quarterly (3)
//   • top quintile bucket width: 10%, 20%, 30%
// ====================================================================

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

interface SensitivityRunInput {
  prices: Record<string, Map<MonthKey, number>>;
  benchmark: Map<MonthKey, number>;
  startDate: Date;
  endDate: Date;
  txCostBps: number;
  baselineLookback: number;
  baselineSkip: number;
  baselineRebalanceMonths: number;
  baselineTopQuintilePct: number;
}

function metricsForVariant(
  args: SensitivityRunInput,
  override: Partial<{
    lookbackMonths: number;
    skipMonths: number;
    rebalanceMonths: number;
    topQuintilePct: number;
  }>,
): Omit<SensitivityVariant, "label" | "isBaseline"> {
  const lookback = override.lookbackMonths ?? args.baselineLookback;
  const skip = override.skipMonths ?? args.baselineSkip;
  const rebalanceMonths = override.rebalanceMonths ?? args.baselineRebalanceMonths;
  const topQuintilePct = override.topQuintilePct ?? args.baselineTopQuintilePct;

  const scores = computeMomentum(args.prices, lookback, skip);
  const path = runEngine({
    prices: args.prices,
    benchmark: args.benchmark,
    scores,
    startDate: args.startDate,
    endDate: args.endDate,
    rebalanceMonths,
    txCostBps: args.txCostBps,
    topQuintilePct,
  });

  if (path.equity.length < 2) {
    return {
      cagr: 0,
      sharpe: 0,
      maxDrawdown: 0,
      alpha: 0,
      informationRatio: null,
    };
  }

  // computeResultMetrics is loaded statically at the top of the file via the
  // metrics import — re-importing dynamically would be wasteful.
  const m = computeResultMetrics(path);
  return {
    cagr: m.strategy.cagr,
    sharpe: m.strategy.sharpe,
    maxDrawdown: m.strategy.maxDrawdown,
    alpha: m.strategy.alpha,
    informationRatio: m.strategy.informationRatio,
  };
}

function runSensitivitySweep(
  args: SensitivityRunInput,
): ParameterSensitivity {
  const lookbackVariants = [
    { lookback: 6, label: "6-1 动量" },
    { lookback: 9, label: "9-1 动量" },
    { lookback: 12, label: "12-1 动量" },
  ];
  const byLookback: SensitivityVariant[] = lookbackVariants.map((v) => {
    const m = metricsForVariant(args, { lookbackMonths: v.lookback, skipMonths: 1 });
    return {
      label: v.label,
      ...m,
      isBaseline: v.lookback === args.baselineLookback && args.baselineSkip === 1,
    };
  });

  const rebalVariants = [
    { months: 1, label: "月度再平衡" },
    { months: 3, label: "季度再平衡" },
  ];
  const byRebalance: SensitivityVariant[] = rebalVariants.map((v) => {
    const m = metricsForVariant(args, { rebalanceMonths: v.months });
    return {
      label: v.label,
      ...m,
      isBaseline: v.months === args.baselineRebalanceMonths,
    };
  });

  const quintileVariants = [
    { pct: 0.1, label: "Top 10%" },
    { pct: 0.2, label: "Top 20%" },
    { pct: 0.3, label: "Top 30%" },
  ];
  const byQuintile: SensitivityVariant[] = quintileVariants.map((v) => {
    const m = metricsForVariant(args, { topQuintilePct: v.pct });
    return {
      label: v.label,
      ...m,
      isBaseline: Math.abs(v.pct - args.baselineTopQuintilePct) < 1e-6,
    };
  });

  return {
    baseline: {
      lookbackMonths: args.baselineLookback,
      skipMonths: args.baselineSkip,
      rebalanceMonths: args.baselineRebalanceMonths,
      topQuintilePct: args.baselineTopQuintilePct,
    },
    byLookback,
    byRebalance,
    byQuintile,
    generatedAt: new Date().toISOString(),
  };
}

// Public entry point. Fire-and-forget from /start. Never throws — failures are
// logged to DB and the study is marked FAILED.
export async function runBacktest(studyId: string): Promise<void> {
  try {
    const study = await prisma.study.findUnique({
      where: { id: studyId },
      select: {
        id: true,
        userId: true,
        startDate: true,
        endDate: true,
        rebalance: true,
        benchmark: true,
        txCostBps: true,
        universe: true,
        factorMix: true,
      },
    });
    if (!study) {
      console.warn(`[backtest] study ${studyId} not found, skipping`);
      return;
    }

    const isMultiFactor = study.factorMix === "multifactor";
    // Step indices shift by +1 starting at index 3 when multifactor is enabled
    // (we insert "拉取基本面数据" at slot 3).
    const stepIdx = (m: number) => (isMultiFactor && m >= 3 ? m + 1 : m);

    await initProgress(studyId, study.factorMix);
    // /start route already set Study.status to RUNNING; we don't redo it here
    // so we don't accidentally overwrite a CANCELLED status set in the
    // brief window between /start and runBacktest's first await.

    // -------- Step 1: validate --------
    await assertNotCancelled(studyId);
    const t1 = Date.now();
    await setStep(studyId, 0, "running", "开始校验参数");
    validateStudyInput(study);
    await setStep(
      studyId,
      0,
      "complete",
      "参数校验通过",
      undefined,
      Math.round((Date.now() - t1) / 1000),
    );

    // -------- Step 2: fetch universe prices --------
    await assertNotCancelled(studyId);
    const t2 = Date.now();
    await setStep(
      studyId,
      1,
      "running",
      `开始拉取股票池价格（${UNIVERSE.length} 个标的）`,
    );
    const prices = await fetchMonthlyPrices({
      tickers: UNIVERSE,
      startDate: study.startDate,
      endDate: study.endDate,
      onTickerDone: ({ ticker, completed, total, pointCount }) => {
        if (completed % 5 === 0 || completed === total) {
          appendLog(
            studyId,
            `已加载 ${completed}/${total}（${ticker} ${pointCount} 个月）`,
          ).catch(() => {});
        }
      },
    });
    const totalPoints = Object.values(prices).reduce((s, m) => s + m.size, 0);
    await setStep(
      studyId,
      1,
      "complete",
      `股票池价格拉取完成，共 ${totalPoints} 个月度数据点`,
      `${UNIVERSE.length} 个标的`,
      Math.round((Date.now() - t2) / 1000),
    );

    // -------- Step 3: fetch benchmark --------
    await assertNotCancelled(studyId);
    const t3 = Date.now();
    const benchTicker = study.benchmark || DEFAULT_BENCHMARK;
    await setStep(studyId, 2, "running", `开始拉取基准 ${benchTicker} 价格`);
    const benchData = await fetchMonthlyPrices({
      tickers: [benchTicker],
      startDate: study.startDate,
      endDate: study.endDate,
    });
    const benchmark = benchData[benchTicker] ?? new Map();
    if (benchmark.size === 0) {
      throw new Error(`基准 ${benchTicker} 无可用价格数据`);
    }
    await setStep(
      studyId,
      2,
      "complete",
      `基准 ${benchTicker} 价格拉取完成（${benchmark.size} 个月）`,
      undefined,
      Math.round((Date.now() - t3) / 1000),
    );

    // -------- Step 3.5 (multifactor only): fetch fundamentals --------
    let fundamentals: Record<string, FundamentalSnapshot> = {};
    let factorCoverage: FactorCoverageReport | undefined;
    if (isMultiFactor) {
      await assertNotCancelled(studyId);
      const tFund = Date.now();
      await setStep(
        studyId,
        3, // multifactor's step 3 = fundamentals
        "running",
        `开始拉取基本面数据（Yahoo + SEC EDGAR，${UNIVERSE.length} 个标的）`,
      );
      fundamentals = await getMergedSnapshotsForUniverse(
        UNIVERSE,
        4,
        ({ ticker, completed, total, hasData }) => {
          if (completed % 5 === 0 || completed === total) {
            appendLog(
              studyId,
              `基本面 ${completed}/${total}（${ticker}${hasData ? "" : " 无数据"}）`,
            ).catch(() => {});
          }
        },
      );
      factorCoverage = computeCoverage(UNIVERSE, fundamentals);
      const covered = UNIVERSE.length - factorCoverage.missingTickers.length;
      await setStep(
        studyId,
        3,
        "complete",
        `基本面数据拉取完成（${covered}/${UNIVERSE.length} 有数据，价值覆盖 ${Math.round(factorCoverage.valueCoverage * 100)}%、质量覆盖 ${Math.round(factorCoverage.qualityCoverage * 100)}%）`,
        undefined,
        Math.round((Date.now() - tFund) / 1000),
      );
    }

    // -------- Step 4: compute factor scores --------
    await assertNotCancelled(studyId);
    const t4 = Date.now();
    await setStep(
      studyId,
      stepIdx(3),
      "running",
      isMultiFactor
        ? "计算多因子合成得分（Value + Quality + 12-1 Momentum 等权 z-score）"
        : "计算 12-1 动量因子",
    );
    const momentumScores = compute121Momentum(prices);
    let scores: FactorScores;
    if (isMultiFactor) {
      scores = buildMultiFactorScores(momentumScores, fundamentals);
    } else {
      scores = momentumScores;
    }
    const totalScores = Object.values(scores).reduce((s, m) => s + m.size, 0);
    await setStep(
      studyId,
      stepIdx(3),
      "complete",
      `因子得分计算完成（共 ${totalScores} 个 ticker-month 信号）`,
      undefined,
      Math.round((Date.now() - t4) / 1000),
    );

    // -------- Step 5: construct portfolios + Step 6: run engine --------
    // We fold portfolio construction and engine execution together because
    // construction happens inside the monthly loop. We mark step 5 complete
    // before step 6 starts, but they share the same engine call.
    await assertNotCancelled(studyId);
    const t5 = Date.now();
    await setStep(studyId, stepIdx(4), "running", "按再平衡频率构建投资组合");
    const path = runEngine({
      prices,
      benchmark,
      scores,
      startDate: study.startDate,
      endDate: study.endDate,
      rebalanceMonths: rebalanceMonthsOf(study.rebalance),
      txCostBps: study.txCostBps,
    });
    if (path.equity.length < 2) {
      throw new Error(
        "回测产出过少（无足够历史价格做因子预热），请扩大回测区间或检查数据源",
      );
    }
    await setStep(
      studyId,
      stepIdx(4),
      "complete",
      `共 ${path.rebalances.length} 次再平衡，每次持仓 ${path.rebalances[0]?.holdings.length ?? 0} 只`,
      `${path.rebalances.length} 次再平衡`,
      Math.round((Date.now() - t5) / 1000),
    );

    const t6 = Date.now();
    await setStep(studyId, stepIdx(5), "running", `回测引擎模拟 ${path.equity.length - 1} 个月`);
    // engine already ran above; this step measures its share of wall-clock.
    await setStep(
      studyId,
      stepIdx(5),
      "complete",
      "回测完成",
      `${path.equity.length - 1} 个交易月`,
      Math.round((Date.now() - t6) / 1000),
    );

    // -------- Step 7: compute metrics + factor diagnostics --------
    await assertNotCancelled(studyId);
    const t7 = Date.now();
    await setStep(studyId, stepIdx(6), "running", "计算风险指标与因子诊断");
    const metrics = computeResultMetrics(path);
    const equityCurve = computeEquityCurve(path);
    const drawdown = computeDrawdownSeries(path);
    const annualReturns = computeAnnualReturns(path);
    // Factor diagnostics intentionally use raw 12-1 momentum (not the multi-
    // factor composite) — IC measurements are most interpretable on a single
    // factor at a time. The composite is reflected separately via
    // factorBreakdown for the latest portfolio.
    const factorDiagnostics = computeFactorDiagnostics(
      momentumScores,
      prices,
      path.axis,
    );
    await setStep(
      studyId,
      stepIdx(6),
      "complete",
      `指标计算完成：CAGR=${metrics.strategy.cagr}%，Sharpe=${metrics.strategy.sharpe}，MaxDD=${metrics.strategy.maxDrawdown}%`,
      undefined,
      Math.round((Date.now() - t7) / 1000),
    );

    // -------- Step 8: parameter sensitivity sweep --------
    await assertNotCancelled(studyId);
    const tSens = Date.now();
    await setStep(
      studyId,
      stepIdx(7),
      "running",
      "敏感性扫描：动量回看期、再平衡频率、分位桶宽度",
    );
    let parameterSensitivity: ParameterSensitivity | null = null;
    try {
      parameterSensitivity = runSensitivitySweep({
        prices,
        benchmark,
        startDate: study.startDate,
        endDate: study.endDate,
        txCostBps: study.txCostBps,
        baselineLookback: 12,
        baselineSkip: 1,
        baselineRebalanceMonths: rebalanceMonthsOf(study.rebalance),
        baselineTopQuintilePct: 0.2,
      });
      await setStep(
        studyId,
        stepIdx(7),
        "complete",
        `敏感性扫描完成（${parameterSensitivity.byLookback.length + parameterSensitivity.byRebalance.length + parameterSensitivity.byQuintile.length} 次试算）`,
        undefined,
        Math.round((Date.now() - tSens) / 1000),
      );
    } catch (sensErr) {
      // Sensitivity is a nice-to-have — don't fail the whole study if a single
      // variant blows up. Log a warning and continue with parameterSensitivity
      // null; the result page handles that case gracefully.
      console.warn("[backtest] sensitivity sweep failed:", sensErr);
      await appendLog(
        studyId,
        `敏感性扫描跳过：${sensErr instanceof Error ? sensErr.message : "未知错误"}`,
        "warning",
      );
      await setStep(
        studyId,
        stepIdx(7),
        "complete",
        "敏感性扫描跳过",
        "已记录警告",
        Math.round((Date.now() - tSens) / 1000),
      );
    }

    // Phase 4: compute multi-factor breakdown for the *latest* rebalance — gives
    // the Result page concrete Value/Quality/Momentum component scores for the
    // portfolio actually held at end-of-backtest. This is purely diagnostic;
    // the engine has already run with the multi-factor composite for selection.
    let factorBreakdown:
      | {
          generatedAt: string;
          asOfRebalance: string;
          holdings: {
            ticker: string;
            value?: number;
            quality?: number;
            momentum?: number;
            composite?: number;
          }[];
        }
      | null = null;
    if (isMultiFactor && path.rebalances.length > 0) {
      const lastRebalance = path.rebalances[path.rebalances.length - 1];
      const momRaw: Record<string, number | undefined> = {};
      for (const t of UNIVERSE) {
        momRaw[t] = momentumScores[t]?.get(lastRebalance.date);
      }
      const momZ = zscoreMomentumAtMonth(momRaw);
      const mfOut = computeMultiFactorScores({
        tickers: UNIVERSE,
        fundamentals,
        momentumByTicker: momZ,
      });
      factorBreakdown = {
        generatedAt: new Date().toISOString(),
        asOfRebalance: lastRebalance.date,
        holdings: lastRebalance.holdings.map((t) => ({
          ticker: t,
          value: mfOut.scores[t]?.value,
          quality: mfOut.scores[t]?.quality,
          momentum: mfOut.scores[t]?.momentum,
          composite: mfOut.scores[t]?.composite,
        })),
      };
    }

    // -------- Step 9: persist result --------
    await assertNotCancelled(studyId);
    const t8 = Date.now();
    await setStep(studyId, stepIdx(8), "running", "保存研究结果到数据库");

    // Phase 3.1: emit monthly returns, rebalance history, and data-quality
    // metadata so the Result page can render Best/Worst Months, the rebalance
    // table, and the survivorship-bias panel without re-deriving everything.
    const monthlyReturns = path.returns.map((r) => ({
      date: r.date,
      strategy: r.strategy,
      benchmark: r.benchmark,
      active: r.active,
    }));
    const rebalanceHistory = path.rebalances.map((r) => ({
      date: r.date,
      holdings: r.holdings,
      turnover: r.turnover,
      txCostApplied: r.txCostApplied,
    }));
    const missingTickers = Object.entries(prices)
      .filter(([, m]) => m.size === 0)
      .map(([t]) => t);
    const dataQuality = {
      universeSize: UNIVERSE.length,
      universeNote: "当前股票池为静态 30 只美股大市值列表（硬编码），不是历史完整 S&P 500 成分股",
      survivorshipBias: true,
      survivorshipNote:
        "因为股票池在整个回测窗口里固定，已退市/被剔除指数的标的不在样本里，回测结果存在幸存者偏差",
      factorType: isMultiFactor
        ? "Multi-factor (Value + Quality + 12-1 Momentum)"
        : "Price-only momentum",
      factorTypeNote: isMultiFactor
        ? "Value/Quality 使用 Yahoo + SEC EDGAR 当前快照（点-in-now），并非历史 PIT 数据；回测假设这些基本面在整个窗口期保持不变，存在前视偏差。ROIC 为简化版 NetIncome/(Equity+TotalDebt) 代理，未做后税利息调整。EV/EBITDA 优先取 Yahoo 直接值，缺失时用 EV÷EBITDA 自算兜底。Momentum 是月度滚动 12-1。"
        : "当前因子仅使用价格信息（12-1 动量），不包含估值/质量/成长等基本面因子",
      priceCoverage: {
        totalDataPoints: totalPoints,
        missingTickers,
        coveragePct: Math.round(
          (totalPoints / (UNIVERSE.length * Math.max(1, benchmark.size))) * 100,
        ),
      },
      benchmarkTicker: benchTicker,
      backtestMonths: path.equity.length - 1,
      rebalanceCount: path.rebalances.length,
      advisoryDisclaimer: "本研究结果仅供研究和教育用途，不构成投资建议",
    };

    const payload = {
      conclusion: "", // intentionally empty — Result page triggers AI gen
      metrics: metrics as unknown as Prisma.InputJsonValue,
      equityCurve: equityCurve as unknown as Prisma.InputJsonValue,
      drawdown: drawdown as unknown as Prisma.InputJsonValue,
      annualReturns: annualReturns as unknown as Prisma.InputJsonValue,
      factorDiagnostics: factorDiagnostics as unknown as Prisma.InputJsonValue,
      aiExplanation: [] as unknown as Prisma.InputJsonValue,
      monthlyReturns: monthlyReturns as unknown as Prisma.InputJsonValue,
      rebalanceHistory: rebalanceHistory as unknown as Prisma.InputJsonValue,
      dataQuality: dataQuality as unknown as Prisma.InputJsonValue,
      // parameterSensitivity is Json? — store DbNull when the sweep failed so
      // the column is SQL NULL rather than the JSON literal `null`.
      parameterSensitivity:
        parameterSensitivity === null
          ? Prisma.DbNull
          : (parameterSensitivity as unknown as Prisma.InputJsonValue),
      // Phase 4 — both Json?, only populated for multifactor studies.
      factorCoverage: factorCoverage
        ? (factorCoverage as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      factorBreakdown: factorBreakdown
        ? (factorBreakdown as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
    };
    await prisma.studyResult.upsert({
      where: { studyId },
      create: { studyId, ...payload },
      update: payload,
    });
    await prisma.study.update({
      where: { id: studyId },
      data: { status: "COMPLETED" },
    });
    await setStep(
      studyId,
      stepIdx(8),
      "complete",
      "研究结果已保存，AI 解读将在结果页加载时按需生成",
      undefined,
      Math.round((Date.now() - t8) / 1000),
    );
    await appendLog(studyId, "回测全部完成");
  } catch (err) {
    if (err instanceof BacktestCancelled) {
      console.log(`[backtest] ${studyId} cancelled by user`);
      try {
        await appendLog(studyId, "用户已取消回测", "warning");
      } catch (writeErr) {
        console.error("[backtest] failed to log cancellation:", writeErr);
      }
      // Status was already set to CANCELLED by the /cancel endpoint; don't
      // touch it.
      return;
    }
    console.error(`[backtest] runBacktest failed for ${studyId}:`, err);
    const message = err instanceof Error ? err.message : "未知错误";
    try {
      const { steps } = await readStepsAndLogs(studyId);
      // Mark the currently-running step (if any) as error; otherwise the first
      // not-complete step.
      let idx = steps.findIndex((s) => s.status === "running");
      if (idx === -1) idx = steps.findIndex((s) => s.status !== "complete");
      if (idx === -1) idx = steps.length - 1;
      await setStep(studyId, idx, "error", `回测失败：${message}`);
      await prisma.study.update({
        where: { id: studyId },
        data: { status: "FAILED" },
      });
    } catch (writeErr) {
      console.error(
        "[backtest] also failed to record FAILED status:",
        writeErr,
      );
    }
  }
}
