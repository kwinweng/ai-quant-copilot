"use client";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EQUITY_CURVE,
  DRAWDOWN_CURVE,
  ANNUAL_RETURNS,
  FACTOR_DIAGNOSTICS,
  DATA_COVERAGE,
  RESULT_METRICS,
} from "@/data/results";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const AI_CONCLUSION =
  "The combined Quality + Value strategy shows statistically robust outperformance of +2.3% CAGR over SPY with improved risk-adjusted returns (Sharpe 0.91 vs 0.78). The strategy benefits from quality screens filtering out value traps, particularly effective during 2022 drawdown where it outperformed by 340 bps. Turnover of 68% is manageable at 5 bps cost assumption. Recommend exploring momentum overlay to reduce whipsaw during trend reversals.";

function MetricRow({ label, strategy, spy, isPositiveGood = true, strategyNum, spyNum }: {
  label: string;
  strategy: string | number | null;
  spy: string | number | null;
  isPositiveGood?: boolean;
  strategyNum?: number;
  spyNum?: number;
}) {
  const sVal = strategyNum ?? (typeof strategy === "number" ? strategy : null);
  const bVal = spyNum ?? (typeof spy === "number" ? spy : null);
  const isBetter = sVal !== null && bVal !== null
    ? isPositiveGood ? sVal > bVal : sVal < bVal
    : false;

  return (
    <tr className="border-b border-slate-800 last:border-0">
      <td className="py-2 text-sm text-slate-400">{label}</td>
      <td className={`py-2 text-sm font-semibold text-right ${isBetter ? "text-green-400" : "text-slate-200"}`}>
        {strategy ?? "—"}
      </td>
      <td className="py-2 text-sm text-slate-400 text-right">{spy ?? "—"}</td>
    </tr>
  );
}

export default function DemoResult() {
  const m = RESULT_METRICS;

  const equitySample = EQUITY_CURVE.filter((_, i) => i % 2 === 0);
  const drawdownSample = DRAWDOWN_CURVE.filter((_, i) => i % 2 === 0);

  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-lg font-semibold text-slate-100">Quality + Value Combined Factor</h1>
              <Badge variant="success">Complete</Badge>
            </div>
            <p className="text-xs text-slate-500">US Large Cap · 2014–2024 · Quarterly rebalance · 5 bps tx cost</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href="/studies/new">
              <Button size="sm" variant="outline">New Variation</Button>
            </Link>
            <Link href="/">
              <Button size="sm" variant="ghost">← Dashboard</Button>
            </Link>
          </div>
        </div>

        {/* AI Conclusion */}
        <Card className="border-blue-800">
          <CardHeader className="py-2.5 flex flex-row items-center gap-2">
            <CardTitle>AI Conclusion</CardTitle>
            <Badge variant="default">GPT-4o (mock)</Badge>
          </CardHeader>
          <CardContent className="py-3">
            <p className="text-sm text-slate-300 leading-relaxed">{AI_CONCLUSION}</p>
          </CardContent>
        </Card>

        {/* Metrics table */}
        <Card>
          <CardHeader className="py-2.5">
            <CardTitle>Performance Summary</CardTitle>
          </CardHeader>
          <CardContent className="py-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="py-2 text-xs text-slate-500 text-left font-medium">Metric</th>
                  <th className="py-2 text-xs text-slate-300 text-right font-medium">Strategy</th>
                  <th className="py-2 text-xs text-slate-500 text-right font-medium">SPY</th>
                </tr>
              </thead>
              <tbody>
                <MetricRow label="CAGR" strategy={`${m.strategy.cagr}%`} spy={`${m.spy.cagr}%`} strategyNum={m.strategy.cagr} spyNum={m.spy.cagr} />
                <MetricRow label="Sharpe Ratio" strategy={m.strategy.sharpe} spy={m.spy.sharpe} />
                <MetricRow label="Max Drawdown" strategy={`${m.strategy.maxDrawdown}%`} spy={`${m.spy.maxDrawdown}%`} strategyNum={m.strategy.maxDrawdown} spyNum={m.spy.maxDrawdown} isPositiveGood={true} />
                <MetricRow label="Calmar Ratio" strategy={m.strategy.calmar} spy={m.spy.calmar} />
                <MetricRow label="Annual Vol" strategy={`${m.strategy.annualVol}%`} spy={`${m.spy.annualVol}%`} strategyNum={m.strategy.annualVol} spyNum={m.spy.annualVol} isPositiveGood={false} />
                <MetricRow label="Beta" strategy={m.strategy.beta} spy={m.spy.beta} isPositiveGood={false} />
                <MetricRow label="Alpha (ann.)" strategy={`+${m.strategy.alpha}%`} spy="0%" strategyNum={m.strategy.alpha} spyNum={0} />
                <MetricRow label="Information Ratio" strategy={m.strategy.informationRatio} spy="—" />
                <MetricRow label="Turnover" strategy={`${m.strategy.turnover}%`} spy="—" />
                <MetricRow label="Monthly Win Rate" strategy={`${m.strategy.winRate}%`} spy="—" />
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Equity Curve */}
        <Card>
          <CardHeader className="py-2.5">
            <CardTitle>Cumulative Returns (rebased to 100)</CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={equitySample} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} interval={3} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6 }}
                  labelStyle={{ color: "#94a3b8" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="strategy" stroke="#3b82f6" strokeWidth={2} dot={false} name="Strategy" />
                <Line type="monotone" dataKey="spy" stroke="#64748b" strokeWidth={1.5} dot={false} name="SPY" strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Drawdown */}
        <Card>
          <CardHeader className="py-2.5">
            <CardTitle>Drawdown (%)</CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={drawdownSample} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} interval={3} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                <ReferenceLine y={0} stroke="#334155" />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6 }}
                  labelStyle={{ color: "#94a3b8" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="strategy" stroke="#3b82f6" strokeWidth={2} dot={false} name="Strategy" />
                <Line type="monotone" dataKey="spy" stroke="#64748b" strokeWidth={1.5} dot={false} name="SPY" strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Annual Returns */}
        <Card>
          <CardHeader className="py-2.5">
            <CardTitle>Annual Returns (%)</CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ANNUAL_RETURNS} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="year" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                <ReferenceLine y={0} stroke="#334155" />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6 }}
                  labelStyle={{ color: "#94a3b8" }}
                  formatter={(v) => [`${v}%`]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="strategy" fill="#3b82f6" name="Strategy" radius={[2, 2, 0, 0]} />
                <Bar dataKey="spy" fill="#475569" name="SPY" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Factor Diagnostics */}
        <Card>
          <CardHeader className="py-2.5">
            <CardTitle>Factor Diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="py-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="py-2 text-xs text-slate-500 text-left font-medium">Factor</th>
                  <th className="py-2 text-xs text-slate-500 text-right font-medium">IC</th>
                  <th className="py-2 text-xs text-slate-500 text-right font-medium">IC IR</th>
                  <th className="py-2 text-xs text-slate-500 text-right font-medium hidden sm:table-cell">Q1 Return</th>
                  <th className="py-2 text-xs text-slate-500 text-right font-medium hidden sm:table-cell">Q5 Return</th>
                  <th className="py-2 text-xs text-slate-500 text-right font-medium">Spread</th>
                </tr>
              </thead>
              <tbody>
                {FACTOR_DIAGNOSTICS.map((f) => (
                  <tr key={f.factor} className="border-b border-slate-800 last:border-0">
                    <td className="py-2 text-sm text-slate-300 font-medium">{f.factor}</td>
                    <td className="py-2 text-sm text-slate-200 text-right">{f.ic.toFixed(3)}</td>
                    <td className="py-2 text-sm text-slate-200 text-right">{f.icir.toFixed(2)}</td>
                    <td className="py-2 text-sm text-green-400 text-right hidden sm:table-cell">{f.topQuintileReturn}%</td>
                    <td className="py-2 text-sm text-red-400 text-right hidden sm:table-cell">{f.bottomQuintileReturn}%</td>
                    <td className="py-2 text-sm text-blue-400 text-right font-semibold">{f.spread}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Data Coverage */}
        <Card>
          <CardHeader className="py-2.5">
            <CardTitle>Data Coverage</CardTitle>
          </CardHeader>
          <CardContent className="py-3 space-y-2.5">
            {DATA_COVERAGE.map((d) => (
              <div key={d.metric}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">{d.metric}</span>
                  <span className="text-slate-400">{d.coverage}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${d.coverage}%` }}
                  />
                </div>
                <p className="text-xs text-slate-600 mt-0.5">{d.note}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Next experiment buttons */}
        <Card className="border-slate-700">
          <CardHeader className="py-2.5">
            <CardTitle>Next Experiments</CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            <p className="text-xs text-slate-500 mb-3">Based on AI analysis, consider these follow-up studies:</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/studies/new">
                <Button size="sm" variant="outline">+ Add Momentum Overlay</Button>
              </Link>
              <Link href="/studies/new">
                <Button size="sm" variant="outline">+ Test Monthly Rebalance</Button>
              </Link>
              <Link href="/studies/new">
                <Button size="sm" variant="outline">+ Extend to Mid-Cap</Button>
              </Link>
              <Link href="/studies/new">
                <Button size="sm" variant="outline">+ Factor Decay Analysis</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="pb-8" />
      </main>
    </div>
  );
}
