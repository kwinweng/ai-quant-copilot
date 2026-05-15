// Phase 16 — Dynamic OG card image for public share links.
//
// When a user pastes the /share/[token] URL into WeChat / Twitter / Discord /
// Slack, the unfurled preview shows this image instead of the generic
// AI Quant Copilot fallback. The preview tries to communicate at-a-glance:
//   * Strategy title
//   * 3 key metrics (CAGR / Sharpe / vs benchmark)
//   * Brand watermark
//
// Built with Next.js native ImageResponse (no external @vercel/og install).
// Edge runtime would be faster but our DB query needs Node-friendly Prisma,
// so we run on Node and accept ~200ms render time per cache miss.

import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "AI Quant Copilot 量化研究报告";

interface MetricsShape {
  strategy?: { cagr?: number; sharpe?: number };
  spy?: { cagr?: number };
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await prisma.studyShareToken.findUnique({
    where: { token },
    include: {
      study: {
        select: {
          title: true,
          hypothesis: true,
          benchmark: true,
          result: { select: { metrics: true } },
        },
      },
    },
  });

  // Fallback card for invalid / expired tokens — still useful since clients
  // sometimes pre-fetch metadata even when the page would 404.
  if (!share) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)",
            color: "white",
            fontSize: 60,
            fontWeight: 700,
            fontFamily: "sans-serif",
          }}
        >
          AI Quant Copilot
        </div>
      ),
      { ...size },
    );
  }

  const study = share.study;
  const result = study.result;
  const metrics = (result?.metrics as unknown as MetricsShape) ?? {};
  const stratCagr = metrics.strategy?.cagr;
  const benchCagr = metrics.spy?.cagr;
  const sharpe = metrics.strategy?.sharpe;
  const vsCagr =
    stratCagr != null && benchCagr != null ? stratCagr - benchCagr : null;
  const beating = vsCagr != null && vsCagr > 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "60px 70px",
          background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 50%, #eff6ff 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top brand row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: "#2563eb",
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: 18,
            }}
          >
            ✦
          </div>
          AI Quant Copilot
          <div style={{ flex: 1 }} />
          <div
            style={{
              fontSize: 14,
              color: "#64748b",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            量化研究报告
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            fontSize: 60,
            fontWeight: 700,
            color: "#0f172a",
            marginTop: 50,
            lineHeight: 1.15,
            maxWidth: 1050,
          }}
        >
          {truncate(study.title, 50)}
        </div>

        {/* Hypothesis snippet */}
        <div
          style={{
            display: "flex",
            fontSize: 22,
            color: "#475569",
            marginTop: 22,
            lineHeight: 1.4,
            maxWidth: 1050,
            fontWeight: 400,
          }}
        >
          {truncate(study.hypothesis, 120)}
        </div>

        <div style={{ flex: 1 }} />

        {/* Metric row */}
        <div
          style={{
            display: "flex",
            gap: 30,
            marginTop: 30,
          }}
        >
          <MetricBlock
            label="策略 CAGR"
            value={fmtPct(stratCagr)}
            accent={beating ? "#16a34a" : "#0f172a"}
          />
          <MetricBlock label="Sharpe" value={fmtNum(sharpe)} accent="#0f172a" />
          <MetricBlock
            label={`vs ${study.benchmark}`}
            value={
              vsCagr != null
                ? `${vsCagr >= 0 ? "+" : ""}${vsCagr.toFixed(1)}pp`
                : "—"
            }
            accent={beating ? "#16a34a" : "#dc2626"}
          />
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            marginTop: 32,
            fontSize: 18,
            color: "#94a3b8",
          }}
        >
          aiquant.kwinweng.com · 个人量化研究副驾驶 · 仅供研究用途
        </div>
      </div>
    ),
    { ...size },
  );
}

function MetricBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "20px 28px",
        borderRadius: 14,
        background: "white",
        border: "2px solid #e2e8f0",
        minWidth: 220,
      }}
    >
      <div
        style={{
          fontSize: 16,
          color: "#64748b",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: accent,
          marginTop: 6,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
