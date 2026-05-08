"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PIPELINE_STEPS } from "@/data/execution";

// Sim: each real second, this many simulated seconds pass
const SIM_SPEED = 4;

// How many simulated seconds each step takes (total = 52 → ~13 real seconds)
const STEP_SIM_DURATIONS = [2, 6, 8, 8, 6, 10, 6, 6];

// Realistic display durations shown when a step completes
const STEP_DISPLAY_DURATIONS = [2, 38, 54, 47, 32, 65, 28, 31];

const SIM_TOTAL = STEP_SIM_DURATIONS.reduce((a, b) => a + b, 0);

function cumEnds(durations: number[]): number[] {
  return durations.reduce<number[]>((acc, d, i) => {
    acc.push((acc[i - 1] ?? 0) + d);
    return acc;
  }, []);
}

const CUM_ENDS = cumEnds(STEP_SIM_DURATIONS);

type StepStatus = "complete" | "running" | "pending";

function getStatuses(simTime: number): StepStatus[] {
  return STEP_SIM_DURATIONS.map((d, i) => {
    const end = CUM_ENDS[i];
    const start = end - d;
    if (simTime >= end) return "complete";
    if (simTime >= start) return "running";
    return "pending";
  });
}

export default function RunningPage() {
  const router = useRouter();
  const [simTime, setSimTime] = useState(0);
  const [realElapsed, setRealElapsed] = useState(0);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setRealElapsed((s) => s + 1);
      setSimTime((s) => {
        const next = s + SIM_SPEED;
        return next >= SIM_TOTAL ? SIM_TOTAL : next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const statuses = getStatuses(simTime);
  const isComplete = simTime >= SIM_TOTAL;
  const runningIdx = statuses.findIndex((s) => s === "running");
  const progress = Math.round((simTime / SIM_TOTAL) * 100);
  const secsRemaining = Math.max(0, Math.ceil((SIM_TOTAL - simTime) / SIM_SPEED));

  useEffect(() => {
    if (isComplete && !navigating) {
      setNavigating(true);
      const t = setTimeout(() => router.push("/studies/demo-result"), 1500);
      return () => clearTimeout(t);
    }
  }, [isComplete, navigating, router]);

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
            <p className="text-xs text-slate-500 mt-0.5">
              Quality + Value Combined Factor — running backtest pipeline
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push("/studies/demo-result")}>
            Skip to Result →
          </Button>
        </div>

        {/* Overall progress */}
        <Card className={isComplete ? "border-green-800" : "border-blue-800"}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {isComplete ? (
                  <Badge variant="success">Complete</Badge>
                ) : (
                  <Badge variant="running">Running</Badge>
                )}
                {!isComplete && runningIdx >= 0 && (
                  <span className="text-sm text-slate-300">
                    Step {runningIdx + 1} of {PIPELINE_STEPS.length}
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-500">{formatElapsed(realElapsed)} elapsed</span>
            </div>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${progress}%`,
                  backgroundColor: isComplete ? "#22c55e" : "#3b82f6",
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1.5">
              <span>{progress}% complete</span>
              {isComplete ? (
                <span className="text-green-400">Loading result…</span>
              ) : (
                <span>~{secsRemaining}s remaining</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pipeline steps */}
        <Card>
          <CardHeader className="py-2.5">
            <CardTitle>Pipeline Steps</CardTitle>
          </CardHeader>
          <CardContent className="py-3 space-y-1">
            {PIPELINE_STEPS.map((step, i) => {
              const status = statuses[i];
              return (
                <div
                  key={step.id}
                  className="flex items-start gap-3 py-2 border-b border-slate-800 last:border-0"
                >
                  <div className="shrink-0 mt-0.5">
                    {status === "complete" && (
                      <div className="w-5 h-5 rounded-full bg-green-900 flex items-center justify-center">
                        <span className="text-green-400 text-xs">✓</span>
                      </div>
                    )}
                    {status === "running" && (
                      <div className="w-5 h-5 rounded-full bg-blue-900 flex items-center justify-center animate-pulse">
                        <span className="text-blue-400 text-xs">●</span>
                      </div>
                    )}
                    {status === "pending" && (
                      <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center">
                        <span className="text-slate-600 text-xs">○</span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`text-sm font-medium ${
                          status === "pending" ? "text-slate-500" : "text-slate-100"
                        }`}
                      >
                        {step.id}. {step.name}
                      </p>
                      {status === "complete" && (
                        <span className="text-xs text-slate-500 shrink-0">
                          {STEP_DISPLAY_DURATIONS[i]}s
                        </span>
                      )}
                      {status === "running" && (
                        <Badge variant="running" className="shrink-0">
                          Running
                        </Badge>
                      )}
                    </div>
                    <p
                      className={`text-xs mt-0.5 ${
                        status === "pending" ? "text-slate-600" : "text-slate-400"
                      }`}
                    >
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          {isComplete ? (
            <Button onClick={() => router.push("/studies/demo-result")}>
              View Result →
            </Button>
          ) : (
            <Button onClick={() => router.push("/studies/demo-result")}>
              View Result When Complete →
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
