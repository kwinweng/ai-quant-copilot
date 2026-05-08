"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const EXAMPLE_HYPOTHESIS =
  "US large-cap universe, combined Quality + Value factor using ROIC/ROE/gross margin and PE/PB/PS outperforms SPY over a 10-year horizon after transaction costs.";

export default function NewStudy() {
  const router = useRouter();
  const [hypothesis, setHypothesis] = useState("");
  const [universe, setUniverse] = useState("US Large Cap (Russell 1000)");
  const [startDate, setStartDate] = useState("2014-01-01");
  const [endDate, setEndDate] = useState("2024-01-01");
  const [rebalance, setRebalance] = useState("Quarterly");
  const [benchmark, setBenchmark] = useState("SPY");
  const [txCost, setTxCost] = useState("5");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => router.push("/studies/plan"), 600);
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-slate-100">New Study</h1>
          <p className="text-xs text-slate-500 mt-0.5">Define your hypothesis and parameters to generate a research plan</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Hypothesis */}
          <Card>
            <CardHeader className="py-2.5">
              <CardTitle>Investment Hypothesis</CardTitle>
            </CardHeader>
            <CardContent className="py-3 space-y-2">
              <textarea
                className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder="Describe your factor hypothesis in plain English…"
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                required
              />
              <button
                type="button"
                className="text-xs text-blue-400 hover:text-blue-300"
                onClick={() => setHypothesis(EXAMPLE_HYPOTHESIS)}
              >
                Use example hypothesis →
              </button>
            </CardContent>
          </Card>

          {/* Parameters */}
          <Card>
            <CardHeader className="py-2.5">
              <CardTitle>Parameters</CardTitle>
            </CardHeader>
            <CardContent className="py-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Universe</label>
                  <select
                    className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={universe}
                    onChange={(e) => setUniverse(e.target.value)}
                  >
                    <option>US Large Cap (Russell 1000)</option>
                    <option>S&P 500</option>
                    <option>US Mid Cap (Russell 2000)</option>
                    <option>US All Cap (Russell 3000)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Rebalance Frequency</label>
                  <select
                    className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={rebalance}
                    onChange={(e) => setRebalance(e.target.value)}
                  >
                    <option>Monthly</option>
                    <option>Quarterly</option>
                    <option>Semi-Annual</option>
                    <option>Annual</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">End Date</label>
                  <input
                    type="date"
                    className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Benchmark</label>
                  <select
                    className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={benchmark}
                    onChange={(e) => setBenchmark(e.target.value)}
                  >
                    <option>SPY</option>
                    <option>QQQ</option>
                    <option>IWM</option>
                    <option>None</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Transaction Cost (bps per trade)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={txCost}
                    onChange={(e) => setTxCost(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Generating Plan…" : "Generate Research Plan →"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
