"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RESEARCH_PLAN } from "@/data/plan";

export default function PlanPage() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  function handleStart() {
    setStarting(true);
    setTimeout(() => router.push("/studies/running"), 500);
  }

  const plan = RESEARCH_PLAN;

  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">Research Plan</h1>
            <p className="text-xs text-slate-500 mt-0.5">Review the AI-generated plan before running the backtest</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              Edit Parameters
            </Button>
            <Button size="sm" onClick={handleStart} disabled={starting}>
              {starting ? "Starting…" : "Start Study →"}
            </Button>
          </div>
        </div>

        {/* Hypothesis */}
        <Card className="border-blue-800">
          <CardHeader className="py-2.5">
            <CardTitle>Hypothesis</CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            <p className="text-sm text-slate-200">{plan.hypothesis}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
              {Object.entries(plan.parameters).map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-slate-500 capitalize">{k.replace(/([A-Z])/g, " $1")}</p>
                  <p className="text-sm text-slate-200">{v}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Data Requirements */}
        <Card>
          <CardHeader className="py-2.5">
            <CardTitle>Data Requirements</CardTitle>
          </CardHeader>
          <CardContent className="py-3 space-y-2">
            {plan.dataRequirements.map((req, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-slate-200">{req.item}</span>
                  <span className="text-xs text-slate-500 ml-2">({req.source})</span>
                </div>
                <Badge variant={req.status === "available" ? "success" : "warning"}>
                  {req.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Factor Definitions */}
        <Card>
          <CardHeader className="py-2.5">
            <CardTitle>Factor Definitions</CardTitle>
          </CardHeader>
          <CardContent className="py-3 space-y-3">
            {plan.factorDefinitions.map((f, i) => (
              <div key={i} className="bg-slate-800 rounded p-3">
                <p className="text-sm font-medium text-slate-100">{f.name}</p>
                <code className="block text-xs text-blue-300 mt-1 break-all">{f.formula}</code>
                <p className="text-xs text-slate-400 mt-1">{f.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Backtest Rules */}
        <Card>
          <CardHeader className="py-2.5">
            <CardTitle>Backtest Rules</CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            <ul className="space-y-1.5">
              {plan.backtestRules.map((rule, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-300">
                  <span className="text-blue-400 shrink-0">•</span>
                  {rule}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Risk Checks */}
        <Card>
          <CardHeader className="py-2.5">
            <CardTitle>Risk Checks</CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            <ul className="space-y-1.5">
              {plan.riskChecks.map((check, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-300">
                  <span className="text-yellow-400 shrink-0">⚑</span>
                  {check}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Known Limitations */}
        <Card className="border-yellow-800">
          <CardHeader className="py-2.5">
            <CardTitle className="text-yellow-300">Known Limitations</CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            <ul className="space-y-1.5">
              {plan.knownLimitations.map((lim, i) => (
                <li key={i} className="flex gap-2 text-sm text-yellow-200/70">
                  <span className="shrink-0">⚠</span>
                  {lim}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 pb-8">
          <Button variant="outline" onClick={() => router.back()}>Edit Parameters</Button>
          <Button onClick={handleStart} disabled={starting}>
            {starting ? "Starting…" : "Start Study →"}
          </Button>
        </div>
      </main>
    </div>
  );
}
