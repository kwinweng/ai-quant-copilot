"use client";
import { useState } from "react";
import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DATA_SOURCES, type DataSource } from "@/data/datasources";

type MockLog = { timestamp: string; message: string; type: "info" | "error" | "success" };

export default function DataSourcesPage() {
  const [sources, setSources] = useState<DataSource[]>(DATA_SOURCES);
  const [logs, setLogs] = useState<MockLog[]>([]);
  const [testing, setTesting] = useState<string | null>(null);

  function addLog(message: string, type: MockLog["type"] = "info") {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [{ timestamp, message, type }, ...prev].slice(0, 20));
  }

  function handleTestConnection(sourceId: string) {
    setTesting(sourceId);
    addLog(`Testing connection to ${sources.find((s) => s.id === sourceId)?.name}…`);

    setTimeout(() => {
      if (sourceId === "futu-opend") {
        addLog("TCP connect to 127.0.0.1:11111 — Connection refused", "error");
        addLog("Futu OpenD is not running. Start it from the Futu NiuNiu desktop app.", "error");
        setSources((prev) =>
          prev.map((s) => (s.id === sourceId ? { ...s, status: "error", lastChecked: new Date().toISOString() } : s))
        );
      } else {
        addLog(`${sources.find((s) => s.id === sourceId)?.name} — Connection OK (mock)`, "success");
        setSources((prev) =>
          prev.map((s) =>
            s.id === sourceId ? { ...s, status: "connected", lastChecked: new Date().toISOString() } : s
          )
        );
      }
      setTesting(null);
    }, 1800);
  }

  function handleFetchSample(sourceId: string) {
    setTesting(sourceId + "-fetch");
    addLog("Requesting AAPL 5Y Daily Bars from Futu OpenD…");

    setTimeout(() => {
      if (sourceId === "futu-opend") {
        addLog("Fetch failed: Futu OpenD not connected. Test connection first.", "error");
      }
      setTesting(null);
    }, 1200);
  }

  function statusBadge(status: DataSource["status"]) {
    switch (status) {
      case "connected": return <Badge variant="success">Connected</Badge>;
      case "disconnected": return <Badge variant="muted">Not Connected</Badge>;
      case "unknown": return <Badge variant="warning">Unknown</Badge>;
      case "error": return <Badge variant="danger">Error</Badge>;
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Data Sources</h1>
          <p className="text-xs text-slate-500 mt-0.5">Check and test connections to data providers used in backtests</p>
        </div>

        {sources.map((source) => (
          <Card key={source.id}>
            <CardHeader className="py-2.5 flex flex-row items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle>{source.name}</CardTitle>
                  {statusBadge(source.status)}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{source.type}</p>
              </div>
            </CardHeader>
            <CardContent className="py-3 space-y-3">
              <p className="text-xs text-slate-400">{source.details}</p>
              {source.lastChecked && (
                <p className="text-xs text-slate-600">
                  Last checked: {new Date(source.lastChecked).toLocaleTimeString()}
                </p>
              )}
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTestConnection(source.id)}
                  disabled={testing === source.id}
                >
                  {testing === source.id ? "Testing…" : "Test Connection"}
                </Button>
                {source.id === "futu-opend" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleFetchSample(source.id)}
                    disabled={testing === source.id + "-fetch" || source.status !== "connected"}
                  >
                    {testing === source.id + "-fetch" ? "Fetching…" : "Fetch AAPL 5Y Daily Bars"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Activity Log */}
        {logs.length > 0 && (
          <Card>
            <CardHeader className="py-2.5 flex flex-row items-center justify-between">
              <CardTitle>Activity Log</CardTitle>
              <button className="text-xs text-slate-500 hover:text-slate-300" onClick={() => setLogs([])}>
                Clear
              </button>
            </CardHeader>
            <CardContent className="py-3 space-y-1 max-h-64 overflow-y-auto">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-2 text-xs font-mono">
                  <span className="text-slate-600 shrink-0">{log.timestamp}</span>
                  <span
                    className={
                      log.type === "error"
                        ? "text-red-400"
                        : log.type === "success"
                        ? "text-green-400"
                        : "text-slate-400"
                    }
                  >
                    {log.message}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
