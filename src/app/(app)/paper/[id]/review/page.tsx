// Phase 15 — per-portfolio quarterly review page.
//
// Reads cached review via GET, recomputes via POST when stale / missing.
// Renders calibration metrics + AI summary + a "considering archive" banner
// when actuals consistently miss the backtest CI lower bound.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  Target,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Review {
  studyTitle?: string;
  periodStart: string | null;
  periodEnd: string | null;
  monthsObserved: number;
  hitRate: number | null;
  trackingError: number | null;
  actualCagr: number | null;
  expectedCagr: number | null;
  executionRate: number | null;
  adviceCounts: { pending: number; confirmed: number; skipped: number };
  computedAt: string;
  aiSummary: string;
}

interface ReviewResponse {
  review: Review;
  stale: boolean;
}

function fmtPct(v: number | null, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export default function PaperReviewPage() {
  const params = useParams<{ id: string }>();
  const paperId = params.id;
  const [review, setReview] = useState<Review | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCache, setHasCache] = useState<boolean | null>(null);

  useEffect(() => {
    if (!paperId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/paper/${paperId}/review`);
        if (cancelled) return;
        if (res.status === 404) {
          setHasCache(false);
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as ReviewResponse;
        setReview(data.review);
        setStale(data.stale);
        setHasCache(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  async function regenerate() {
    if (!paperId || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/paper/${paperId}/review`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ReviewResponse;
      setReview(data.review);
      setStale(false);
      setHasCache(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <Link
        href="/paper"
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-3 w-3" />
        返回 Paper 组合
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 inline-flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            季度复盘
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {review?.studyTitle ?? "Paper 组合"} · 实际持有期 vs 回测预期校准
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={refreshing}
          onClick={regenerate}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {hasCache ? "重新计算" : "生成复盘"}
        </Button>
      </div>

      {loading && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载缓存…
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {stale && hasCache && !refreshing && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 inline-flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          这份复盘已超过 7 天，可点击「重新计算」拉取最新数据
        </div>
      )}

      {hasCache === false && !loading && (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-10 text-center">
          <Sparkles className="h-6 w-6 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600 mb-1">尚未生成复盘</p>
          <p className="text-xs text-gray-500 mb-4">
            首次会拉取 Yahoo 最新价格 + 调 AI 写一段总结，约 5-10 秒
          </p>
          <Button size="sm" onClick={regenerate} disabled={refreshing}>
            {refreshing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                生成中…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                立即生成
              </>
            )}
          </Button>
        </div>
      )}

      {review && (
        <>
          {review.monthsObserved < 1 ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
              <Target className="h-6 w-6 text-blue-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-blue-900 mb-1">
                等待第一次月度调仓
              </p>
              <p className="text-xs text-blue-700">
                这个 Paper 组合刚创建，还没积累完整月度观察。下个月初系统跑完调仓 cron 后就会有数据。
              </p>
            </div>
          ) : (
            <>
              {/* AI summary card */}
              <div className="bg-white border border-purple-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-purple-50 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-semibold text-purple-700">
                    AI 复盘总结
                  </span>
                </div>
                <p className="px-4 py-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {review.aiSummary}
                </p>
              </div>

              {/* Headline metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  label="观察月数"
                  value={`${review.monthsObserved}`}
                  hint={
                    review.periodStart && review.periodEnd
                      ? `${review.periodStart} → ${review.periodEnd}`
                      : ""
                  }
                />
                <MetricCard
                  label="月度方向一致率"
                  value={fmtPct(review.hitRate, 0)}
                  tone={
                    review.hitRate != null && review.hitRate >= 0.55 ? "good" : "neutral"
                  }
                  hint="50% = 随机"
                />
                <MetricCard
                  label="年化跟踪误差"
                  value={fmtPct(review.trackingError, 1)}
                  hint="低 = 接近预期"
                />
                <MetricCard
                  label="实际 / 回测 CAGR"
                  value={`${fmtPct(review.actualCagr, 1)} / ${fmtPct(review.expectedCagr, 1)}`}
                  tone={
                    review.actualCagr != null && review.expectedCagr != null
                      ? review.actualCagr >= review.expectedCagr
                        ? "good"
                        : "bad"
                      : "neutral"
                  }
                />
              </div>

              {/* Execution */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">
                    调仓建议执行情况
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    执行率 = 确认 / (确认 + 跳过)；pending 不计入
                  </p>
                </div>
                <div className="px-4 py-3 grid grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">执行率</p>
                    <p className="text-base font-semibold text-gray-900">
                      {fmtPct(review.executionRate, 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5 inline-flex items-center gap-1 justify-center">
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                      确认
                    </p>
                    <p className="text-base font-semibold text-green-700">
                      {review.adviceCounts.confirmed}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5 inline-flex items-center gap-1 justify-center">
                      <XCircle className="h-3 w-3 text-red-600" />
                      跳过
                    </p>
                    <p className="text-base font-semibold text-red-700">
                      {review.adviceCounts.skipped}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">待处理</p>
                    <p className="text-base font-semibold text-amber-700">
                      {review.adviceCounts.pending}
                    </p>
                  </div>
                </div>
              </div>

              {/* Archive suggestion banner */}
              {review.actualCagr != null &&
                review.expectedCagr != null &&
                review.actualCagr < review.expectedCagr - 0.1 &&
                review.monthsObserved >= 3 && (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-rose-900 mb-0.5">
                        实际表现持续低于回测预期
                      </p>
                      <p className="text-xs text-rose-800 leading-relaxed">
                        实际 CAGR ({fmtPct(review.actualCagr, 1)}) 比回测预期
                        ({fmtPct(review.expectedCagr, 1)}) 低 10pp 以上，已观察{" "}
                        {review.monthsObserved} 月。考虑归档该组合或回到研究页面调整假设。
                      </p>
                    </div>
                  </div>
                )}

              <p className="text-[11px] text-gray-400">
                计算时间：{new Date(review.computedAt).toLocaleString("zh-CN")}
                <span className="ml-2">缓存 7 天有效</span>
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const valueClass =
    tone === "good"
      ? "text-green-700"
      : tone === "bad"
        ? "text-red-700"
        : "text-gray-900";
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-base font-semibold mt-0.5 ${valueClass}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}
