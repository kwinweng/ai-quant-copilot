export interface StudyMetrics {
  cagr: number;
  sharpe: number;
  maxDrawdown: number;
  spyCagr: number;
  spySharpe: number;
  spyMaxDrawdown: number;
  turnover: number;
}

export interface Study {
  id: string;
  name: string;
  hypothesis: string;
  status: "complete" | "running" | "draft" | "failed";
  createdAt: string;
  completedAt?: string;
  metrics?: StudyMetrics;
  aiConclusion?: string;
  universe: string;
  dateRange: string;
  rebalance: string;
  benchmark: string;
  transactionCost: string;
}

export const DEMO_STUDY: Study = {
  id: "study-001",
  name: "Quality + Value Combined Factor",
  hypothesis:
    "US large-cap universe, combined Quality + Value factor using ROIC/ROE/gross margin and PE/PB/PS outperforms SPY over a 10-year horizon after transaction costs.",
  status: "complete",
  createdAt: "2024-12-01T09:00:00Z",
  completedAt: "2024-12-01T09:14:32Z",
  universe: "US Large Cap (Russell 1000)",
  dateRange: "2014-01-01 to 2024-01-01",
  rebalance: "Quarterly",
  benchmark: "SPY",
  transactionCost: "5 bps per trade",
  metrics: {
    cagr: 12.4,
    sharpe: 0.91,
    maxDrawdown: -21.3,
    spyCagr: 10.1,
    spySharpe: 0.78,
    spyMaxDrawdown: -24.7,
    turnover: 68,
  },
  aiConclusion:
    "The combined Quality + Value strategy shows statistically robust outperformance of +2.3% CAGR over SPY with improved risk-adjusted returns (Sharpe 0.91 vs 0.78). The strategy benefits from quality screens filtering out value traps, particularly effective during 2022 drawdown where it outperformed by 340 bps. Turnover of 68% is manageable at 5 bps cost assumption. Recommend exploring momentum overlay to reduce whipsaw during trend reversals.",
};

export const RECENT_STUDIES: Study[] = [
  DEMO_STUDY,
  {
    id: "study-002",
    name: "Low Volatility Anomaly",
    hypothesis:
      "Low-beta US large-cap stocks outperform high-beta peers on risk-adjusted basis over 5 years.",
    status: "complete",
    createdAt: "2024-11-15T14:20:00Z",
    completedAt: "2024-11-15T14:28:45Z",
    universe: "S&P 500",
    dateRange: "2019-01-01 to 2024-01-01",
    rebalance: "Monthly",
    benchmark: "SPY",
    transactionCost: "5 bps per trade",
    metrics: {
      cagr: 9.8,
      sharpe: 1.12,
      maxDrawdown: -15.6,
      spyCagr: 12.1,
      spySharpe: 0.82,
      spyMaxDrawdown: -24.7,
      turnover: 42,
    },
    aiConclusion:
      "Low-vol anomaly confirmed on Sharpe basis (+0.30 vs SPY) but absolute returns lag in bull markets. Best suited as defensive allocation or tail-risk hedge.",
  },
  {
    id: "study-003",
    name: "Momentum Factor — 12-1 Month",
    hypothesis:
      "12-month price momentum (excluding last month) in mid-cap universe generates alpha net of transaction costs.",
    status: "complete",
    createdAt: "2024-10-22T10:05:00Z",
    completedAt: "2024-10-22T10:19:12Z",
    universe: "US Mid Cap (Russell 2000)",
    dateRange: "2014-01-01 to 2024-01-01",
    rebalance: "Monthly",
    benchmark: "SPY",
    transactionCost: "10 bps per trade",
    metrics: {
      cagr: 14.2,
      sharpe: 0.84,
      maxDrawdown: -31.7,
      spyCagr: 10.1,
      spySharpe: 0.78,
      spyMaxDrawdown: -24.7,
      turnover: 156,
    },
    aiConclusion:
      "Strong CAGR but elevated max drawdown (-31.7%) and high turnover (156%) erode real-world profitability. Consider longer rebalance intervals or momentum crash filters.",
  },
];

export const ACTIVE_TASK = {
  id: "task-001",
  studyName: "Earnings Surprise + Momentum Combo",
  progress: 42,
  currentStep: "Fetching earnings revision data",
  startedAt: "2024-12-05T08:30:00Z",
  estimatedMinutesLeft: 8,
};
