// Phase 16 — Public share page charts.
//
// Wraps LightweightLine with the two flavors we need on the share page:
//   * Equity (price-format Y axis)
//   * Drawdown (with zero reference line)
//
// Day 4-5: migrated from Recharts to Lightweight Charts (financial-grade
// crosshair, sharper baseline visual, ~35KB lib).

"use client";

import { LightweightLine } from "@/components/charts/LightweightLine";

interface Point {
  date: string;
  strategy: number;
  spy: number;
}

export function PublicEquityChart({
  data,
  height = 300,
}: {
  data: Point[];
  height?: number;
}) {
  return <LightweightLine data={data} height={height} valueFormat="raw" />;
}

export function PublicDrawdownChart({
  data,
  height = 220,
}: {
  data: Point[];
  height?: number;
}) {
  return (
    <LightweightLine data={data} height={height} valueFormat="pct" zeroLine />
  );
}
