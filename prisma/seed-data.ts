// Static demo content used by `prisma/seed.ts` and the auto-seed-on-signup
// flow. Pure data — no Prisma imports — so this file can be consumed from
// both the seed script (Node) and runtime API code without circular deps.

export interface DemoMetrics {
  cagr: number;
  sharpe: number;
  maxDrawdown: number;
  spyCagr: number;
  spySharpe: number;
  spyMaxDrawdown: number;
  turnover: number;
}

export interface DemoStudyDefinition {
  title: string;
  hypothesis: string;
  market: string;
  universe: string;
  startDate: string;
  endDate: string;
  rebalance: string;
  benchmark: string;
  txCostBps: number;
  conclusion: string;
  metrics: {
    strategy: DemoMetrics & {
      calmar: number;
      annualVol: number;
      beta: number;
      alpha: number;
      informationRatio: number | null;
      winRate: number;
    };
    spy: {
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
    };
  };
  plan: {
    dataRequirements: string;
    factorDefs: string;
    backtestRules: string;
    riskChecks: string;
    limitations: string;
  };
  equityCurve: { date: string; strategy: number; spy: number }[];
  drawdown: { date: string; strategy: number; spy: number }[];
  annualReturns: { year: string; strategy: number; spy: number }[];
  factorDiagnostics: {
    factor: string;
    ic: number;
    icir: number;
    topQuintileReturn: number;
    bottomQuintileReturn: number;
    spread: number;
  }[];
  aiExplanation: string[];
}

function buildEquityCurve() {
  const points: { date: string; strategy: number; spy: number }[] = [];
  let strategy = 100;
  let spy = 100;
  for (let year = 2014; year <= 2024; year++) {
    for (let q = 1; q <= 4; q++) {
      if (year === 2024 && q > 1) break;
      strategy *= 1 + (0.031 + Math.sin(year * 2.1 + q) * 0.02);
      spy *= 1 + (0.025 + Math.sin(year * 1.7 + q) * 0.018);
      const month = (q * 3).toString().padStart(2, "0");
      points.push({
        date: `${year}-${month}`,
        strategy: parseFloat(strategy.toFixed(2)),
        spy: parseFloat(spy.toFixed(2)),
      });
    }
  }
  return points;
}

function buildDrawdown(curve: { date: string; strategy: number; spy: number }[]) {
  let stratPeak = curve[0].strategy;
  let spyPeak = curve[0].spy;
  return curve.map((p) => {
    stratPeak = Math.max(stratPeak, p.strategy);
    spyPeak = Math.max(spyPeak, p.spy);
    return {
      date: p.date,
      strategy: parseFloat((((p.strategy - stratPeak) / stratPeak) * 100).toFixed(2)),
      spy: parseFloat((((p.spy - spyPeak) / spyPeak) * 100).toFixed(2)),
    };
  });
}

const SHARED_EQUITY = buildEquityCurve();
const SHARED_DRAWDOWN = buildDrawdown(SHARED_EQUITY);

const DEFAULT_ANNUAL_RETURNS = [
  { year: "2014", strategy: 15.2, spy: 13.7 },
  { year: "2015", strategy: 2.1, spy: 1.4 },
  { year: "2016", strategy: 18.9, spy: 11.9 },
  { year: "2017", strategy: 24.3, spy: 21.8 },
  { year: "2018", strategy: -6.2, spy: -4.4 },
  { year: "2019", strategy: 31.8, spy: 31.5 },
  { year: "2020", strategy: 22.1, spy: 18.4 },
  { year: "2021", strategy: 28.6, spy: 28.7 },
  { year: "2022", strategy: -12.4, spy: -18.1 },
  { year: "2023", strategy: 21.7, spy: 26.3 },
];

const DEFAULT_FACTOR_DIAGNOSTICS = [
  {
    factor: "Quality Score",
    ic: 0.042,
    icir: 0.71,
    topQuintileReturn: 13.8,
    bottomQuintileReturn: 7.2,
    spread: 6.6,
  },
  {
    factor: "Value Score",
    ic: 0.031,
    icir: 0.52,
    topQuintileReturn: 12.1,
    bottomQuintileReturn: 8.9,
    spread: 3.2,
  },
  {
    factor: "Combined Factor",
    ic: 0.051,
    icir: 0.84,
    topQuintileReturn: 14.6,
    bottomQuintileReturn: 6.8,
    spread: 7.8,
  },
];

export const DEMO_STUDIES: DemoStudyDefinition[] = [
  {
    title: "Quality + Value 组合因子",
    hypothesis:
      "美股大盘股中，综合质量因子（ROIC/ROE/毛利率）与价值因子（PE/PB/PS）的组合策略，在扣除交易成本后，10 年回测期内可超越 SPY 基准。",
    market: "US",
    universe: "US Large Cap (Russell 1000)",
    startDate: "2014-01-01",
    endDate: "2024-01-01",
    rebalance: "Quarterly",
    benchmark: "SPY",
    txCostBps: 5,
    conclusion:
      "Quality + Value 组合策略相对 SPY 有 +2.3% CAGR 的稳定超额收益，风险调整后回报亦有改善 (Sharpe 0.91 vs 0.78)。质量筛选有效过滤掉价值陷阱，2022 回撤期间超额收益尤其显著。建议探索动量叠加以减少趋势反转期间的换手摩擦。",
    metrics: {
      strategy: {
        cagr: 12.4,
        sharpe: 0.91,
        maxDrawdown: -21.3,
        calmar: 0.58,
        annualVol: 13.6,
        beta: 0.82,
        alpha: 2.3,
        informationRatio: 0.61,
        turnover: 68,
        spyCagr: 10.1,
        spySharpe: 0.78,
        spyMaxDrawdown: -24.7,
        winRate: 58.3,
      },
      spy: {
        cagr: 10.1,
        sharpe: 0.78,
        maxDrawdown: -24.7,
        calmar: 0.41,
        annualVol: 13.0,
        beta: 1.0,
        alpha: 0,
        informationRatio: null,
        turnover: null,
        winRate: null,
      },
    },
    plan: {
      dataRequirements:
        "OHLCV 价格数据 (Futu mock)\n基本面数据 ROIC/ROE/毛利率 (模拟)\n估值比率 PE/PB/PS (模拟)\nRussell 1000 成分股历史快照 (模拟)\nSPY 基准回报 (模拟)",
      factorDefs:
        "Quality Score = Z(ROIC) + Z(ROE) + Z(Gross Margin)\nValue Score = Z(-PE) + Z(-PB) + Z(-PS)\nCombined = 0.5 × Quality + 0.5 × Value, 选取顶部 20%",
      backtestRules:
        "每季度首个交易日按因子打分选取 Top 20%；等权配置，单票上限 3%；5 bps 单边交易成本；仅做多；剔除股价 < $5 或市值 < $1B 的标的。",
      riskChecks:
        "GICS 单一行业占比 ≤ 35%\n单票仓位 ≤ 3%\n组合至少持有 30 只股票\n年换手率 > 200% 触发预警",
      limitations:
        "存在幸存者偏差（使用当前 Russell 1000 池）\n基本面数据为模拟数据\n未考虑做空与衍生品\n交易成本模型简化（固定 5 bps，未建模冲击成本）",
    },
    equityCurve: SHARED_EQUITY,
    drawdown: SHARED_DRAWDOWN,
    annualReturns: DEFAULT_ANNUAL_RETURNS,
    factorDiagnostics: DEFAULT_FACTOR_DIAGNOSTICS,
    aiExplanation: [
      "策略相对 SPY 实现 +2.3% 年化超额收益，且 Sharpe 比率从 0.78 提升至 0.91。",
      "质量筛选有效过滤了价值陷阱，特别在 2022 年熊市中超额收益达 340 bps。",
      "68% 的年换手率在 5 bps 成本假设下仍保持正贡献，但需关注实盘流动性冲击。",
      "建议考虑加入动量过滤层以减少趋势反转区间的拖累。",
    ],
  },
  {
    title: "低波动异象",
    hypothesis:
      "美股大盘股中，低 Beta 标的在风险调整后能够长期跑赢高 Beta 同业，过去 5 年验证仍然成立。",
    market: "US",
    universe: "S&P 500",
    startDate: "2019-01-01",
    endDate: "2024-01-01",
    rebalance: "Monthly",
    benchmark: "SPY",
    txCostBps: 5,
    conclusion:
      "低波异象在 Sharpe 维度仍然成立 (+0.30 vs SPY)，但牛市中绝对收益落后。更适合作为防守型配置或尾部风险对冲组合。",
    metrics: {
      strategy: {
        cagr: 9.8,
        sharpe: 1.12,
        maxDrawdown: -15.6,
        calmar: 0.63,
        annualVol: 9.4,
        beta: 0.62,
        alpha: 1.1,
        informationRatio: 0.34,
        turnover: 42,
        spyCagr: 12.1,
        spySharpe: 0.82,
        spyMaxDrawdown: -24.7,
        winRate: 56.1,
      },
      spy: {
        cagr: 12.1,
        sharpe: 0.82,
        maxDrawdown: -24.7,
        calmar: 0.49,
        annualVol: 16.4,
        beta: 1.0,
        alpha: 0,
        informationRatio: null,
        turnover: null,
        winRate: null,
      },
    },
    plan: {
      dataRequirements: "S&P 500 OHLCV (mock)\n滚动 60 日 Beta\n再平衡日成分快照",
      factorDefs:
        "Beta_60d = 滚动 60 日相对 SPY 回归斜率\n排序后选取最低 20% 的 100 只股票",
      backtestRules:
        "每月初再平衡，等权配置；单票仓位上限 2%；5 bps 单边交易成本；仅做多。",
      riskChecks:
        "组合至少持有 80 只股票\n月换手率 > 25% 触发预警\n单一行业占比 ≤ 30%",
      limitations:
        "Beta 是历史值，前瞻意义有限\n组合对利率敏感度未单独建模\n未对冲市场系统性风险",
    },
    equityCurve: SHARED_EQUITY,
    drawdown: SHARED_DRAWDOWN,
    annualReturns: DEFAULT_ANNUAL_RETURNS,
    factorDiagnostics: DEFAULT_FACTOR_DIAGNOSTICS,
    aiExplanation: [
      "低波动组合 Sharpe 提升明显，但在 2021 年牛市中 CAGR 落后 SPY 约 230 bps。",
      "回撤显著优于基准 (-15.6% vs -24.7%)，适合防守型配置。",
      "建议与高 Beta 主动暴露策略配对使用以平衡风险。",
    ],
  },
  {
    title: "12-1 月动量因子",
    hypothesis:
      "美股中盘股中，12 个月（剔除最近一个月）的价格动量在扣除交易成本后仍能产生超额收益。",
    market: "US",
    universe: "US Mid Cap (Russell 2000)",
    startDate: "2014-01-01",
    endDate: "2024-01-01",
    rebalance: "Monthly",
    benchmark: "SPY",
    txCostBps: 10,
    conclusion:
      "动量因子原始 CAGR 高 (14.2%)，但最大回撤达 -31.7% 且年换手率 156%，扣除真实成本后超额收益被严重稀释。建议拉长再平衡周期或叠加动量崩溃过滤器。",
    metrics: {
      strategy: {
        cagr: 14.2,
        sharpe: 0.84,
        maxDrawdown: -31.7,
        calmar: 0.45,
        annualVol: 16.9,
        beta: 1.05,
        alpha: 1.6,
        informationRatio: 0.38,
        turnover: 156,
        spyCagr: 10.1,
        spySharpe: 0.78,
        spyMaxDrawdown: -24.7,
        winRate: 54.2,
      },
      spy: {
        cagr: 10.1,
        sharpe: 0.78,
        maxDrawdown: -24.7,
        calmar: 0.41,
        annualVol: 13.0,
        beta: 1.0,
        alpha: 0,
        informationRatio: null,
        turnover: null,
        winRate: null,
      },
    },
    plan: {
      dataRequirements: "Russell 2000 OHLCV (mock)\n12-1 动量打分\n月度成分快照",
      factorDefs:
        "Momentum_12_1 = 过去 12 个月累计回报 ÷ 最近 1 个月回报\nTop 20% 选股，等权配置",
      backtestRules:
        "每月初再平衡；10 bps 单边交易成本；仅做多；剔除股价 < $3 标的。",
      riskChecks:
        "组合至少持有 60 只股票\n年换手率 > 250% 触发预警\n动量崩溃区间触发降仓预案",
      limitations:
        "动量崩溃风险未通过动态对冲缓解\n小盘股流动性冲击未充分建模\n交易成本固定假设偏乐观",
    },
    equityCurve: SHARED_EQUITY,
    drawdown: SHARED_DRAWDOWN,
    annualReturns: DEFAULT_ANNUAL_RETURNS,
    factorDiagnostics: DEFAULT_FACTOR_DIAGNOSTICS,
    aiExplanation: [
      "原始动量收益高，但回撤与换手都显著高于其他因子。",
      "在 2009、2020 等动量崩溃区间表现不佳，需要保护性叠加。",
      "建议与质量或低波因子结合，降低单一动量风险。",
    ],
  },
];
