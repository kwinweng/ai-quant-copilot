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
import {
  getMergedSnapshotsForUniverse,
  getSecHistoryForUniverse,
} from "@/lib/fundamentals/cache";
import type { FundamentalSnapshot } from "@/lib/fundamentals/types";
import {
  computeCoverage,
  computeMultiFactorScores,
  zscoreMomentumAtMonth,
  type FactorCoverageReport,
} from "@/lib/factors/multifactor";
import { buildMultiFactorScores } from "@/lib/factors/pitMultifactor";
import { buildRobustnessReport } from "./robustness";

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

// Sprint #7: PIT helpers (monthKeyToCutoff / pickSnapshotAsOf /
// crossSectionalZ / buildMultiFactorScores) extracted to
// src/lib/factors/pitMultifactor.ts so they can be unit-tested without
// running the full backtest orchestration. Imports below preserve the
// runner.ts call sites unchanged.

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

// Sprint #4 U10: lightweight in-flight note update so the running page can
// show "Yahoo+SEC 17/30 · SEC 历史 12/30" within a step instead of just
// spinning silently for 30-60 seconds.
async function updateStepNote(
  studyId: string,
  index: number,
  note: string,
): Promise<void> {
  try {
    const { steps, logs } = await readStepsAndLogs(studyId);
    if (index >= 0 && index < steps.length) {
      steps[index] = { ...steps[index], note };
      await prisma.studyProgress.update({
        where: { studyId },
        data: {
          steps: steps as unknown as Prisma.InputJsonValue,
          logs: logs as unknown as Prisma.InputJsonValue,
        },
      });
    }
  } catch (err) {
    // Note updates are best-effort UI sugar — never let them fail the run.
    console.warn(
      `[backtest] updateStepNote failed for ${studyId}@${index}:`,
      err instanceof Error ? err.message : err,
    );
  }
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
        costModel: true,
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
    // Phase 4+ PIT: parallel-fetch (a) Yahoo current snapshot for static
    // Value tilt and (b) SEC full filing history for time-varying Quality.
    let fundamentals: Record<string, FundamentalSnapshot> = {};
    let secHistory: Record<string, FundamentalSnapshot[]> = {};
    let factorCoverage: FactorCoverageReport | undefined;
    if (isMultiFactor) {
      await assertNotCancelled(studyId);
      const tFund = Date.now();
      await setStep(
        studyId,
        3,
        "running",
        `开始拉取基本面数据（Yahoo 当前快照 + SEC EDGAR 历史 filings，${UNIVERSE.length} 个标的，首次约 30-60 秒，后续 24h 内复用缓存）`,
        `0/${UNIVERSE.length}`,
      );
      // Sprint #4 U10: maintain a live note string showing both fetchers'
      // progress so the running page reflects within-step movement.
      let mergedDone = 0;
      let secDone = 0;
      const total = UNIVERSE.length;
      const refreshNote = () => {
        updateStepNote(
          studyId,
          3,
          `Yahoo+SEC ${mergedDone}/${total} · SEC 历史 ${secDone}/${total}`,
        ).catch(() => {});
      };
      const [merged, history] = await Promise.all([
        getMergedSnapshotsForUniverse(
          UNIVERSE,
          4,
          ({ ticker, completed, hasData }) => {
            mergedDone = completed;
            refreshNote();
            if (completed % 5 === 0 || completed === total) {
              appendLog(
                studyId,
                `Yahoo+SEC 合并 ${completed}/${total}（${ticker}${hasData ? "" : " 无数据"}）`,
              ).catch(() => {});
            }
          },
        ),
        getSecHistoryForUniverse(
          UNIVERSE,
          4,
          ({ ticker, completed, snapshotCount }) => {
            secDone = completed;
            refreshNote();
            if (completed % 5 === 0 || completed === total) {
              appendLog(
                studyId,
                `SEC 历史 ${completed}/${total}（${ticker} ${snapshotCount} 个 10-K 快照）`,
              ).catch(() => {});
            }
          },
        ),
      ]);
      fundamentals = merged;
      secHistory = history;
      factorCoverage = computeCoverage(UNIVERSE, fundamentals);
      const covered = UNIVERSE.length - factorCoverage.missingTickers.length;
      const totalHistRows = Object.values(secHistory).reduce(
        (s, arr) => s + arr.length,
        0,
      );
      await setStep(
        studyId,
        3,
        "complete",
        `基本面数据拉取完成（${covered}/${UNIVERSE.length} 当前快照有数据，SEC 历史共 ${totalHistRows} 条 filing）`,
        `价值 ${Math.round(factorCoverage.valueCoverage * 100)}% · 质量 ${Math.round(factorCoverage.qualityCoverage * 100)}%`,
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
        ? "计算多因子合成得分（Value 静态 + Quality PIT 90 天 lag + 12-1 Momentum，等权合成）"
        : "计算 12-1 动量因子",
    );
    const momentumScores = compute121Momentum(prices);
    let scores: FactorScores;
    if (isMultiFactor) {
      // Phase 5: pass `prices` so Value ratios are computed PIT-correctly
      // from MarketCap_M / SEC absolute USD inputs (no longer the static
      // Yahoo Value tilt of the Phase 4.2 design).
      scores = buildMultiFactorScores(
        momentumScores,
        fundamentals,
        secHistory,
        prices,
      );
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
    // Phase 7: pass costMode so engine applies tiered model when configured.
    const costMode =
      study.costModel === "tiered" ? "tiered" : "simple";
    const path = runEngine({
      prices,
      benchmark,
      scores,
      startDate: study.startDate,
      endDate: study.endDate,
      rebalanceMonths: rebalanceMonthsOf(study.rebalance),
      txCostBps: study.txCostBps,
      costMode,
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

    // Phase 8: robustness analytics — bootstrap CIs + in/out-of-sample split +
    // halve-period metrics. Cheap (pure compute on already-loaded data) and
    // wrapped in try/catch so any future bug here doesn't fail the study.
    let robustness: ReturnType<typeof buildRobustnessReport> | null = null;
    try {
      robustness = buildRobustnessReport(path);
    } catch (robErr) {
      console.warn("[backtest] robustness report failed:", robErr);
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
      universeNote: `当前股票池为静态 ${UNIVERSE.length} 只美股大市值列表（覆盖 8 个 GICS 板块），整个回测窗口期保持不变。仍存在幸存者偏差（每只标的今天仍在交易），Phase 6.5 计划接入历史指数成分股以消除`,
      survivorshipBias: true,
      survivorshipNote:
        "因为股票池在整个回测窗口里固定，已退市/被剔除指数的标的不在样本里，回测结果存在幸存者偏差",
      factorType: isMultiFactor
        ? "Multi-factor (Value + Quality + 12-1 Momentum)"
        : "Price-only momentum",
      factorTypeNote: isMultiFactor
        ? "全 PIT 多因子：Quality 因子（ROE / ROIC / 毛利率 / 负债权益）来自 SEC EDGAR 全历史 10-K filings，每月 M 只用 reportedAt < M − 90 天 的最新一份。Value 因子（PE / PB / PS）从 MarketCap_M = MarketCap_today × (adjclose_M / adjclose_today) 反推、除以 SEC PIT-visible 绝对值（NetIncomeTTM / StockholdersEquity / RevenuesTTM）得到，已消除前视偏差。EV/EBITDA 仍用 Yahoo 当前快照兜底。ROIC 为简化版 NetIncome/(Equity+TotalDebt) 代理。Momentum 月度滚动 12-1。"
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
      // Phase 7: cost model disclosure
      costModel: study.costModel,
      costModelNote:
        study.costModel === "tiered"
          ? `分层交易成本模型：mega-cap 1 bps、large-cap 4 bps、mid-cap 10 bps 基础点差 + sqrt(turnover) × 5 bps 市场冲击 + 用户填的 ${study.txCostBps} bps 佣金。比单一 ${study.txCostBps} bps 更接近实盘。`
          : `单一 ${study.txCostBps} bps 模型：所有标的、所有规模一致。新研究默认走「分层」模型，老研究保持兼容。`,
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
      // Phase 8: robustness report — null when computation failed.
      robustness: robustness
        ? (robustness as unknown as Prisma.InputJsonValue)
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
