"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PIPELINE_STEPS } from "@/data/execution";

export default function RunningPage() {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const completedSteps = PIPELINE_STEPS.filter((s) => s.status === "complete").length;
  const totalSteps = PIPELINE_STEPS.length;
  const progress = Math.round((completedSteps / totalSteps) * 100);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">Study Executing</h1>
            <p className="text-xs text-slate-500 mt-0.5">Quality + Value Combined Factor — running backtest pipeline</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push("/studies/demo-result")}>
            Jump to Result →
          </Button>
        </div>

        {/* Overall progress */}
        <Card className="border-blue-800">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Badge variant="running">Running</Badge>
                <span className="text-sm text-slate-300">
                  Step {completedSteps + 1} of {totalSteps}
                </span>
              </div>
              <span className="text-xs text-slate-500">{formatElapsed(elapsed)} elapsed</span>
            </div>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1.5">
              <span>{progress}% complete</span>
              <span>~{Math.max(0, 12 - Math.floor(elapsed / 60))} min remaining</span>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline steps */}
        <Card>
          <CardHeader className="py-2.5">
            <CardTitle>Pipeline Steps</CardTitle>
          </CardHeader>
          <CardContent className="py-3 space-y-1">
            {PIPELINE_STEPS.map((step) => (
              <div key={step.id} className="flex items-start gap-3 py-2 border-b border-slate-800 last:border-0">
                <div className="shrink-0 mt-0.5">
                  {step.status === "complete" && (
                    <div className="w-5 h-5 rounded-full bg-green-900 flex items-center justify-center">
                      <span className="text-green-400 text-xs">✓</span>
                    </div>
                  )}
                  {step.status === "running" && (
                    <div className="w-5 h-5 rounded-full bg-blue-900 flex items-center justify-center animate-pulse">
                      <span className="text-blue-400 text-xs">●</span>
                    </div>
                  )}
                  {step.status === "pending" && (
                    <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center">
                      <span className="text-slate-600 text-xs">○</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-medium ${step.status === "pending" ? "text-slate-500" : "text-slate-100"}`}>
                      {step.id}. {step.name}
                    </p>
                    {step.status === "complete" && step.durationSeconds && (
                      <span className="text-xs text-slate-500 shrink-0">{step.durationSeconds}s</span>
                    )}
                    {step.status === "running" && (
                      <Badge variant="running" className="shrink-0">Running</Badge>
                    )}
                  </div>
                  <p className={`text-xs mt-0.5 ${step.status === "pending" ? "text-slate-600" : "text-slate-400"}`}>
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => router.push("/studies/demo-result")}>
            View Result When Complete →
          </Button>
        </div>
      </main>
    </div>
  );
}
