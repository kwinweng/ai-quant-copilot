export const RESEARCH_PLAN = {
  hypothesis:
    "US large-cap universe, combined Quality + Value factor using ROIC/ROE/gross margin and PE/PB/PS outperforms SPY over a 10-year horizon after transaction costs.",
  parameters: {
    universe: "US Large Cap (Russell 1000, ~1000 stocks)",
    dateRange: "2014-01-01 to 2024-01-01",
    rebalance: "Quarterly",
    benchmark: "SPY",
    transactionCost: "5 bps per trade",
  },
  dataRequirements: [
    { item: "OHLCV price data", source: "Futu (mocked)", status: "available" },
    { item: "Fundamental data (ROIC, ROE, Gross Margin)", source: "Simulated", status: "available" },
    { item: "Valuation ratios (PE, PB, PS)", source: "Simulated", status: "available" },
    { item: "Russell 1000 constituents (historical)", source: "Simulated", status: "available" },
    { item: "SPY benchmark returns", source: "Simulated", status: "available" },
  ],
  factorDefinitions: [
    {
      name: "Quality Score",
      formula: "Z-score(ROIC) + Z-score(ROE) + Z-score(Gross_Margin)",
      description: "Equal-weighted z-score composite of three profitability metrics",
    },
    {
      name: "Value Score",
      formula: "Z-score(-PE) + Z-score(-PB) + Z-score(-PS)",
      description: "Negative valuation ratios (lower = cheaper), z-score composite",
    },
    {
      name: "Combined Factor",
      formula: "0.5 × Quality_Score + 0.5 × Value_Score",
      description: "Equal-weighted combination; top quintile (20%) selected",
    },
  ],
  backtestRules: [
    "Select top 20% of stocks by Combined Factor score at each rebalance",
    "Equal-weight portfolio; cap single position at 3% of portfolio",
    "Rebalance quarterly on first trading day of quarter",
    "Apply 5 bps transaction cost per trade (one-way)",
    "No leverage; long-only",
    "Exclude stocks with price < $5 or market cap < $1B to avoid illiquidity",
  ],
  riskChecks: [
    "Sector concentration cap: no single GICS sector > 35%",
    "Single stock weight cap: 3% maximum",
    "Minimum 30 stocks in portfolio at all times",
    "Annual turnover monitored; flag if > 200%",
  ],
  knownLimitations: [
    "Survivorship bias: uses current Russell 1000 universe (point-in-time not available in mock data)",
    "Fundamental data is simulated — factor definitions are illustrative only",
    "No short-selling or derivatives considered",
    "Transaction cost model is simplified (fixed 5 bps; market impact not modeled)",
  ],
};
