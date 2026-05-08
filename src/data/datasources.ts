export interface DataSource {
  id: string;
  name: string;
  type: string;
  status: "connected" | "disconnected" | "unknown" | "error";
  lastChecked?: string;
  details?: string;
}

export const DATA_SOURCES: DataSource[] = [
  {
    id: "futu-opend",
    name: "Futu OpenD",
    type: "Market Data / Broker API",
    status: "disconnected",
    details: "Requires Futu OpenD v6.x running locally on port 11111",
  },
  {
    id: "mock-fundamentals",
    name: "Fundamental Data (Mock)",
    type: "Factor Data",
    status: "connected",
    lastChecked: new Date().toISOString(),
    details: "Simulated ROIC, ROE, Gross Margin, PE, PB, PS — Stage 1 prototype only",
  },
  {
    id: "mock-prices",
    name: "Price Data (Mock)",
    type: "OHLCV",
    status: "connected",
    lastChecked: new Date().toISOString(),
    details: "Simulated daily OHLCV for US large-cap — Stage 1 prototype only",
  },
];
