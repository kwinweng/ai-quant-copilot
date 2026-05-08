export interface EquityCurvePoint {
  date: string;
  strategy: number;
  spy: number;
}

export interface DrawdownPoint {
  date: string;
  strategy: number;
  spy: number;
}

export interface AnnualReturn {
  year: string;
  strategy: number;
  spy: number;
}

export interface FactorDiagnostic {
  factor: string;
  ic: number;
  icir: number;
  topQuintileReturn: number;
  bottomQuintileReturn: number;
  spread: number;
}

export interface DataCoverage {
  metric: string;
  coverage: number;
  note: string;
}

function generateEquityCurve(): EquityCurvePoint[] {
  const points: EquityCurvePoint[] = [];
  let strategy = 100;
  let spy = 100;
  const startYear = 2014;

  for (let year = startYear; year <= 2024; year++) {
    for (let quarter = 1; quarter <= 4; quarter++) {
      if (year === 2024 && quarter > 1) break;
      const stratReturn = 0.031 + (Math.sin(year * 2.1 + quarter) * 0.02);
      const spyReturn = 0.025 + (Math.sin(year * 1.7 + quarter) * 0.018);

      strategy *= 1 + stratReturn;
      spy *= 1 + spyReturn;

      const month = (quarter * 3).toString().padStart(2, "0");
      points.push({
        date: `${year}-${month}`,
        strategy: parseFloat(strategy.toFixed(2)),
        spy: parseFloat(spy.toFixed(2)),
      });
    }
  }
  return points;
}

function generateDrawdown(): DrawdownPoint[] {
  const curve = generateEquityCurve();
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

export const EQUITY_CURVE: EquityCurvePoint[] = generateEquityCurve();

export const DRAWDOWN_CURVE: DrawdownPoint[] = generateDrawdown();

export const ANNUAL_RETURNS: AnnualReturn[] = [
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

export const FACTOR_DIAGNOSTICS: FactorDiagnostic[] = [
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

export const DATA_COVERAGE: DataCoverage[] = [
  { metric: "Price data completeness", coverage: 99.8, note: "Missing: 2 delistings" },
  { metric: "ROIC coverage", coverage: 94.2, note: "Excludes financials sector" },
  { metric: "ROE coverage", coverage: 97.1, note: "Full large-cap coverage" },
  { metric: "PE ratio coverage", coverage: 92.4, note: "Excludes negative-earnings periods" },
  { metric: "PB ratio coverage", coverage: 98.6, note: "Full coverage" },
  { metric: "PS ratio coverage", coverage: 98.9, note: "Full coverage" },
];

export const RESULT_METRICS = {
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
};
