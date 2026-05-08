import Link from "next/link";
import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RECENT_STUDIES, ACTIVE_TASK } from "@/data/studies";

function MetricPill({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-xs text-slate-500 truncate">{label}</span>
      <span className={`text-sm font-semibold ${positive === true ? "text-green-400" : positive === false ? "text-red-400" : "text-slate-100"}`}>
        {value}
      </span>
    </div>
  );
}

function StudyCard({ study }: { study: (typeof RECENT_STUDIES)[0] }) {
  const m = study.metrics;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 py-2.5">
        <div className="min-w-0">
          <CardTitle className="truncate">{study.name}</CardTitle>
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{study.hypothesis}</p>
        </div>
        <Badge variant="success" className="shrink-0">Complete</Badge>
      </CardHeader>
      <CardContent className="py-3">
        {m && (
          <div className="grid grid-cols-4 gap-3 mb-3">
            <MetricPill label="CAGR" value={`${m.cagr}%`} positive={m.cagr > m.spyCagr} />
            <MetricPill label="Sharpe" value={m.sharpe.toFixed(2)} positive={m.sharpe > m.spySharpe} />
            <MetricPill label="Max DD" value={`${m.maxDrawdown}%`} positive={m.maxDrawdown > m.spyMaxDrawdown} />
            <MetricPill label="Turnover" value={`${m.turnover}%`} />
          </div>
        )}
        {study.aiConclusion && (
          <div className="bg-slate-800 rounded p-2.5 mt-1">
            <p className="text-xs text-slate-400 line-clamp-2">{study.aiConclusion}</p>
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <Link href="/studies/demo-result">
            <Button size="sm" variant="outline">View Report</Button>
          </Link>
          <Link href="/studies/new">
            <Button size="sm" variant="ghost">New Variation</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">Research Dashboard</h1>
            <p className="text-xs text-slate-500 mt-0.5">US equity factor research — Stage 1 prototype</p>
          </div>
          <Link href="/studies/new">
            <Button>+ New Study</Button>
          </Link>
        </div>

        {/* Active task */}
        <Card className="border-blue-800 bg-slate-900">
          <CardHeader className="py-2.5 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Active Study</CardTitle>
              <Badge variant="running">Running</Badge>
            </div>
            <Link href="/studies/running">
              <Button size="sm" variant="ghost">View Progress →</Button>
            </Link>
          </CardHeader>
          <CardContent className="py-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-100">{ACTIVE_TASK.studyName}</p>
                <p className="text-xs text-slate-400 mt-0.5">{ACTIVE_TASK.currentStep}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-32">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>{ACTIVE_TASK.progress}%</span>
                    <span>~{ACTIVE_TASK.estimatedMinutesLeft}m left</span>
                  </div>
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${ACTIVE_TASK.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent studies */}
        <div>
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Recent Studies</h2>
          <div className="space-y-3">
            {RECENT_STUDIES.map((study) => (
              <StudyCard key={study.id} study={study} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
