import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UNIVERSE, DEFAULT_BENCHMARK, rebalanceMonthsOf } from "./universe";
import { fetchMonthlyPrices } from "./prices";
import { compute121Momentum } from "./factor";
import { runBacktest as runEngine } from "./engine";
import {
  computeAnnualReturns,
  computeDrawdownSeries,
  computeEquityCurve,
  computeFactorDiagnostics,
  computeResultMetrics,
} from "./metrics";

// Canonical step list — single source of truth shared by the runner and the
// running page UI (frontend reads this from progress.steps).
export const BACKTEST_STEPS: { name: string; description: string }[] = [
  { name: "校验参数", description: "检查股票池、日期范围和因子定义" },
  { name: "获取股票池价格", description: "从 Yahoo Finance 拉取月度调整收盘价" },
  { name: "获取基准价格", description: "拉取基准（默认 SPY）月度数据" },
  { name: "计算因子得分", description: "12-1 动量因子（避开短期反转）" },
  { name: "构建投资组合", description: "按再平衡频率选 top 20% 等权" },
  { name: "运行回测引擎", description: "月度模拟，应用单边交易成本" },
  { name: "计算风险指标", description: "CAGR、Sharpe、Max DD、Beta、Alpha、IR" },
  { name: "汇总研究结果", description: "保存到数据库，AI 报告由结果页按需生成" },
];

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

const initialSteps = (): StoredStep[] =>
  BACKTEST_STEPS.map((s) => ({
    name: s.name,
    description: s.description,
    status: "pending",
  }));

async function initProgress(studyId: string): Promise<void> {
  const now = new Date().toISOString();
  await prisma.studyProgress.upsert({
    where: { studyId },
    create: {
      studyId,
      currentStep: 0,
      steps: initialSteps() as unknown as Prisma.InputJsonValue,
      logs: [
        { ts: now, message: "回测开始", level: "info" },
      ] as unknown as Prisma.InputJsonValue,
    },
    update: {
      currentStep: 0,
      steps: initialSteps() as unknown as Prisma.InputJsonValue,
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
  const steps = (row?.steps as unknown as StoredStep[]) ?? initialSteps();
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
      },
    });
    if (!study) {
      console.warn(`[backtest] study ${studyId} not found, skipping`);
      return;
    }

    await initProgress(studyId);
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

    // -------- Step 4: compute factor scores --------
    await assertNotCancelled(studyId);
    const t4 = Date.now();
    await setStep(studyId, 3, "running", "计算 12-1 动量因子");
    const scores = compute121Momentum(prices);
    const totalScores = Object.values(scores).reduce((s, m) => s + m.size, 0);
    await setStep(
      studyId,
      3,
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
    await setStep(studyId, 4, "running", "按再平衡频率构建投资组合");
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
      4,
      "complete",
      `共 ${path.rebalances.length} 次再平衡，每次持仓 ${path.rebalances[0]?.holdings.length ?? 0} 只`,
      `${path.rebalances.length} 次再平衡`,
      Math.round((Date.now() - t5) / 1000),
    );

    const t6 = Date.now();
    await setStep(studyId, 5, "running", `回测引擎模拟 ${path.equity.length - 1} 个月`);
    // engine already ran above; this step measures its share of wall-clock.
    await setStep(
      studyId,
      5,
      "complete",
      "回测完成",
      `${path.equity.length - 1} 个交易月`,
      Math.round((Date.now() - t6) / 1000),
    );

    // -------- Step 7: compute metrics + factor diagnostics --------
    await assertNotCancelled(studyId);
    const t7 = Date.now();
    await setStep(studyId, 6, "running", "计算风险指标与因子诊断");
    const metrics = computeResultMetrics(path);
    const equityCurve = computeEquityCurve(path);
    const drawdown = computeDrawdownSeries(path);
    const annualReturns = computeAnnualReturns(path);
    const factorDiagnostics = computeFactorDiagnostics(
      scores,
      prices,
      path.axis,
    );
    await setStep(
      studyId,
      6,
      "complete",
      `指标计算完成：CAGR=${metrics.strategy.cagr}%，Sharpe=${metrics.strategy.sharpe}，MaxDD=${metrics.strategy.maxDrawdown}%`,
      undefined,
      Math.round((Date.now() - t7) / 1000),
    );

    // -------- Step 8: persist result --------
    await assertNotCancelled(studyId);
    const t8 = Date.now();
    await setStep(studyId, 7, "running", "保存研究结果到数据库");
    const payload = {
      conclusion: "", // intentionally empty — Result page triggers AI gen
      metrics: metrics as unknown as Prisma.InputJsonValue,
      equityCurve: equityCurve as unknown as Prisma.InputJsonValue,
      drawdown: drawdown as unknown as Prisma.InputJsonValue,
      annualReturns: annualReturns as unknown as Prisma.InputJsonValue,
      factorDiagnostics: factorDiagnostics as unknown as Prisma.InputJsonValue,
      aiExplanation: [] as unknown as Prisma.InputJsonValue,
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
      7,
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
