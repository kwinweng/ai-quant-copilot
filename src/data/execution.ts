export interface PipelineStep {
  id: number;
  name: string;
  description: string;
  status: "complete" | "running" | "pending";
  durationSeconds?: number;
}

export const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: 1,
    name: "Validate Parameters",
    description: "Check universe, date range, and factor definitions",
    status: "complete",
    durationSeconds: 2,
  },
  {
    id: 2,
    name: "Fetch Price Data",
    description: "Download OHLCV for Russell 1000 constituents (2014–2024)",
    status: "complete",
    durationSeconds: 38,
  },
  {
    id: 3,
    name: "Fetch Fundamental Data",
    description: "Load ROIC, ROE, Gross Margin, PE, PB, PS for all symbols",
    status: "complete",
    durationSeconds: 54,
  },
  {
    id: 4,
    name: "Compute Factor Scores",
    description: "Z-score Quality + Value composites per quarter",
    status: "running",
    durationSeconds: undefined,
  },
  {
    id: 5,
    name: "Construct Portfolios",
    description: "Select top quintile, apply concentration limits",
    status: "pending",
  },
  {
    id: 6,
    name: "Run Backtest Engine",
    description: "Simulate daily PnL with transaction costs and rebalance",
    status: "pending",
  },
  {
    id: 7,
    name: "Compute Risk Metrics",
    description: "CAGR, Sharpe, Max Drawdown, Calmar, Information Ratio",
    status: "pending",
  },
  {
    id: 8,
    name: "Generate AI Report",
    description: "AI synthesis of results, factor attribution, recommendations",
    status: "pending",
  },
];
