// Phase 16 — Lightweight Charts wrapper for our equity/drawdown line views.
//
// Reusable two-series line chart (strategy + benchmark). Used by both the
// authenticated result page and the public /share/[token] page so the
// visual is identical.
//
// API choices:
//   * Data points use month-end strings "YYYY-MM" → we append "-01" to feed
//     the BusinessDay time format Lightweight Charts requires.
//   * Crosshair sync with shared time axis — clicking on equity will move
//     the cursor on drawdown if they're rendered in the same component
//     tree (Phase 16+ may sync them via TimeScale.subscribeVisibleRange,
//     for now they're independent).

"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type LineSeriesPartialOptions,
  type Time,
} from "lightweight-charts";

interface Point {
  date: string; // YYYY-MM
  strategy: number;
  spy: number;
}

interface LightweightLineProps {
  data: Point[];
  height?: number;
  /** Show a zero reference line (used for drawdown). */
  zeroLine?: boolean;
  /** Tick format on the value axis. "pct" for percent, "raw" for plain numbers. */
  valueFormat?: "pct" | "raw";
}

const STRATEGY_COLOR = "#2563eb";
const BENCH_COLOR = "#94a3b8";

function toTime(monthStr: string): Time {
  // YYYY-MM → BusinessDay { year, month, day:1 } for Lightweight Charts.
  const [y, m] = monthStr.split("-").map(Number);
  return { year: y, month: m, day: 1 };
}

function dedupeSorted<T extends { time: Time }>(arr: T[]): T[] {
  // Lightweight Charts requires strictly ascending unique times. We don't
  // expect duplicates from our data, but defensive sort + dedupe avoids
  // a runtime throw if a study's equity curve ever has them.
  const sorted = [...arr].sort((a, b) => timeKey(a.time) - timeKey(b.time));
  const out: T[] = [];
  let lastKey = -1;
  for (const p of sorted) {
    const k = timeKey(p.time);
    if (k === lastKey) continue;
    out.push(p);
    lastKey = k;
  }
  return out;
}

function timeKey(t: Time): number {
  if (typeof t === "string") return Date.parse(t);
  if (typeof t === "number") return t;
  // BusinessDay
  return t.year * 10000 + t.month * 100 + t.day;
}

export function LightweightLine({
  data,
  height = 280,
  zeroLine = false,
  valueFormat = "raw",
}: LightweightLineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const strategySeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const benchSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Init / dispose chart once on mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { color: "transparent" },
        textColor: "#6b7280",
        fontSize: 11,
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      },
      grid: {
        vertLines: { color: "#e5e7eb", style: 1 },
        horzLines: { color: "#e5e7eb", style: 1 },
      },
      rightPriceScale: {
        borderColor: "#e5e7eb",
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: {
        borderColor: "#e5e7eb",
        timeVisible: false,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: {
          color: "#9ca3af",
          width: 1,
          style: 2,
          labelBackgroundColor: "#374151",
        },
        horzLine: {
          color: "#9ca3af",
          width: 1,
          style: 2,
          labelBackgroundColor: "#374151",
        },
      },
      autoSize: false,
    });

    const commonOptions: LineSeriesPartialOptions = {
      priceFormat:
        valueFormat === "pct"
          ? { type: "percent", precision: 2, minMove: 0.01 }
          : { type: "price", precision: 2, minMove: 0.01 },
    };

    const strategySeries = chart.addSeries(LineSeries, {
      ...commonOptions,
      color: STRATEGY_COLOR,
      lineWidth: 2,
      title: "策略",
    });
    const benchSeries = chart.addSeries(LineSeries, {
      ...commonOptions,
      color: BENCH_COLOR,
      lineWidth: 2,
      lineStyle: 2, // dashed
      title: "基准",
    });

    chartRef.current = chart;
    strategySeriesRef.current = strategySeries;
    benchSeriesRef.current = benchSeries;

    // Resize observer keeps chart width in sync with container.
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? container.clientWidth;
      chart.applyOptions({ width: Math.floor(w), height });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      strategySeriesRef.current = null;
      benchSeriesRef.current = null;
    };
  }, [height, valueFormat]);

  // Push data updates on every change.
  useEffect(() => {
    if (!strategySeriesRef.current || !benchSeriesRef.current) return;
    const strategyData = dedupeSorted(
      data.map((p) => ({ time: toTime(p.date), value: p.strategy })),
    );
    const benchData = dedupeSorted(
      data.map((p) => ({ time: toTime(p.date), value: p.spy })),
    );
    strategySeriesRef.current.setData(strategyData);
    benchSeriesRef.current.setData(benchData);

    if (zeroLine) {
      // Add a horizontal zero line on the strategy series.
      strategySeriesRef.current.createPriceLine({
        price: 0,
        color: "#d1d5db",
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: false,
        title: "",
      });
    }

    // Fit content so the user sees the whole series on first paint.
    chartRef.current?.timeScale().fitContent();
  }, [data, zeroLine]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height }}
      className="lightweight-chart-host"
    />
  );
}
