"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Sparkles,
} from "lucide-react";

const EXAMPLE_HYPOTHESIS =
  "美股大盘股中，综合质量因子（ROIC/ROE/毛利率）与价值因子（PE/PB/PS）的组合策略，在扣除交易成本后，10 年回测期内可超越 SPY 基准。";

const MAX_CHARS = 500;

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

const labelCls = "block text-xs font-medium text-gray-600 mb-1";

interface SourceStudy {
  id: string;
  title: string;
  hypothesis: string;
  universe: string;
  startDate: string;
  endDate: string;
  rebalance: string;
  benchmark: string;
  txCostBps: number;
  factorMix?: string;
}

function NewStudyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneFrom = searchParams.get("cloneFrom");
  const [hypothesis, setHypothesis] = useState("");
  const [universe, setUniverse] = useState("US Large Cap (Russell 1000)");
  const [startDate, setStartDate] = useState("2014-01-01");
  const [endDate, setEndDate] = useState("2024-01-01");
  const [rebalance, setRebalance] = useState("季度");
  const [benchmark, setBenchmark] = useState("SPY");
  const [txCost, setTxCost] = useState("5");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [slippage, setSlippage] = useState("1");
  const [longShort, setLongShort] = useState("仅做多");
  // Phase 14: portfolio risk constraints. Disabled by default to preserve
  // legacy equal-weight behavior for users who don't opt in.
  const [enableConstraints, setEnableConstraints] = useState(false);
  const [maxPositionPct, setMaxPositionPct] = useState("20");
  const [maxSectorPct, setMaxSectorPct] = useState("35");
  const [factorMix, setFactorMix] = useState<"momentum" | "multifactor">(
    "momentum",
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cloneStatus, setCloneStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [cloneSource, setCloneSource] = useState<SourceStudy | null>(null);
  const cloneAppliedRef = useRef(false);
  const queryAppliedRef = useRef(false);
  const [coachPrefilled, setCoachPrefilled] = useState(false);

  // Sprint #3: when launched from the coach or example library, the URL has
  // ?hypothesis=…&universe=…&… query params. Prefill the form on first mount.
  // Skips if cloneFrom is set (clone is the dominant signal — fetches the
  // source study, which would clobber any query-string defaults anyway).
  useEffect(() => {
    if (queryAppliedRef.current) return;
    if (cloneFrom) return; // clone path takes over below.
    queryAppliedRef.current = true;
    const q = searchParams;
    const qHypothesis = q.get("hypothesis");
    if (!qHypothesis) return;
    setHypothesis(qHypothesis);
    const qUniverse = q.get("universe");
    if (qUniverse) setUniverse(qUniverse);
    const qStart = q.get("startDate");
    if (qStart) setStartDate(qStart);
    const qEnd = q.get("endDate");
    if (qEnd) setEndDate(qEnd);
    const qRebal = q.get("rebalance");
    if (qRebal) setRebalance(qRebal);
    const qBench = q.get("benchmark");
    if (qBench) setBenchmark(qBench);
    const qTx = q.get("txCostBps");
    if (qTx && !Number.isNaN(Number(qTx))) setTxCost(qTx);
    const qFm = q.get("factorMix");
    if (qFm === "momentum" || qFm === "multifactor") setFactorMix(qFm);
    setCoachPrefilled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloneFrom]);

  // Phase 3.1 Copy & Modify: when ?cloneFrom=<id> is present, fetch the source
  // study once and prefill the form. We don't auto-submit; the user reviews
  // and tweaks before kicking off a new run.
  useEffect(() => {
    if (!cloneFrom || cloneAppliedRef.current) return;
    cloneAppliedRef.current = true;
    setCloneStatus("loading");
    void (async () => {
      try {
        const res = await fetch(`/api/studies/${cloneFrom}`);
        if (!res.ok) throw new Error(`无法加载源研究 (HTTP ${res.status})`);
        const { study } = (await res.json()) as { study: SourceStudy };
        setCloneSource(study);
        setHypothesis(study.hypothesis ?? "");
        setUniverse(study.universe ?? "US Large Cap (Russell 1000)");
        setStartDate((study.startDate ?? "").slice(0, 10) || "2014-01-01");
        setEndDate((study.endDate ?? "").slice(0, 10) || "2024-01-01");
        setRebalance(study.rebalance ?? "季度");
        setBenchmark(study.benchmark ?? "SPY");
        setTxCost(String(study.txCostBps ?? 5));
        if (study.factorMix === "multifactor" || study.factorMix === "momentum") {
          setFactorMix(study.factorMix);
        }
        setCloneStatus("loaded");
      } catch (err) {
        setCloneStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "加载源研究失败");
      }
    })();
  }, [cloneFrom]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/studies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hypothesis: hypothesis.trim(),
          market: "US",
          universe,
          startDate,
          endDate,
          rebalance,
          benchmark,
          txCostBps: Number(txCost) || 0,
          factorMix,
          // Phase 7: new studies default to the realistic tiered cost model.
          // Server still accepts "simple" for parity with old API behavior.
          costModel: "tiered",
          // Phase 14: only send constraints if user explicitly enabled them.
          // Empty object preserves legacy equal-weight behavior.
          ...(enableConstraints
            ? {
                constraints: {
                  maxPositionWeight: Number(maxPositionPct) / 100,
                  maxSectorWeight: Number(maxSectorPct) / 100,
                },
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `创建失败 (HTTP ${res.status})`);
      }
      const { study } = (await res.json()) as { study: { id: string } };
      router.push(`/studies/${study.id}/plan`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "创建研究失败");
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">创建新研究</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            描述您的投资假设，AI 将为您生成完整的研究计划
          </p>
        </div>
        {!cloneFrom && !coachPrefilled && (
          <Link href="/studies/coach">
            <Button
              variant="outline"
              size="sm"
              className="inline-flex items-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              不知道写什么？让 AI 帮你
            </Button>
          </Link>
        )}
      </div>

      {coachPrefilled && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-emerald-900 font-medium">
              已从 AI 教练 / 例子库预填
            </div>
            <div className="text-xs text-emerald-700 mt-0.5">
              所有字段都可以再修改。确认无误后点「生成研究计划」。
            </div>
          </div>
        </div>
      )}

      {cloneFrom && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm flex items-start gap-2">
          <Copy className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            {cloneStatus === "loading" && (
              <span className="inline-flex items-center gap-1.5 text-blue-700">
                <Loader2 className="h-3 w-3 animate-spin" />
                正在加载源研究…
              </span>
            )}
            {cloneStatus === "loaded" && cloneSource && (
              <>
                <div className="text-blue-900 font-medium">
                  从已有研究复制：{cloneSource.title}
                </div>
                <div className="text-xs text-blue-700 mt-0.5">
                  字段已预填，请按需修改后提交。源研究 ID:{" "}
                  <span className="font-mono">{cloneSource.id}</span>
                </div>
              </>
            )}
            {cloneStatus === "error" && (
              <span className="text-red-700">
                加载源研究失败，下方为默认值。
              </span>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Hypothesis */}
        <Card className="bg-white border-gray-200 text-gray-900">
          <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
            <CardTitle className="text-sm font-semibold text-gray-900 flex items-center justify-between gap-2">
              <span>投资假设</span>
              {/* Sprint #4 U14: surface a "记得改假设" warning so cloned
                  studies don't accidentally re-run with the source's
                  identical hypothesis text. */}
              {cloneFrom && cloneStatus === "loaded" && (
                <span className="text-[10px] font-normal text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                  已复制源研究的假设，记得改一改差异点
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            <div className="relative">
              <textarea
                className={`w-full border rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  cloneFrom && cloneStatus === "loaded"
                    ? "border-amber-300"
                    : "border-gray-200"
                }`}
                rows={4}
                placeholder="请描述您的投资假设，例如：美股大盘股中，低估值 + 高质量因子组合在 10 年内超越 SPY..."
                value={hypothesis}
                maxLength={MAX_CHARS}
                onChange={(e) => setHypothesis(e.target.value)}
                required
              />
              <span className="absolute bottom-2 right-3 text-xs text-gray-400 pointer-events-none">
                {hypothesis.length}/{MAX_CHARS}
              </span>
            </div>
            <button
              type="button"
              className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
              onClick={() => setHypothesis(EXAMPLE_HYPOTHESIS)}
            >
              使用示例假设 →
            </button>
          </CardContent>
        </Card>

        {/* Parameters */}
        <Card className="bg-white border-gray-200 text-gray-900">
          <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
            <CardTitle className="text-sm font-semibold text-gray-900">
              研究参数
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>股票池</label>
                <select
                  className={inputCls}
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
                <label className={labelCls}>再平衡频率</label>
                <select
                  className={inputCls}
                  value={rebalance}
                  onChange={(e) => setRebalance(e.target.value)}
                >
                  <option value="月度">月度</option>
                  <option value="季度">季度</option>
                  <option value="半年">半年</option>
                  <option value="年度">年度</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>开始日期</label>
                <input
                  type="date"
                  className={inputCls}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <label className={labelCls}>结束日期</label>
                <input
                  type="date"
                  className={inputCls}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div>
                <label className={labelCls}>基准指数</label>
                <select
                  className={inputCls}
                  value={benchmark}
                  onChange={(e) => setBenchmark(e.target.value)}
                >
                  <option>SPY</option>
                  <option>QQQ</option>
                  <option>IWM</option>
                  <option>不设基准</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>交易成本（bps/笔）</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className={inputCls}
                  value={txCost}
                  onChange={(e) => setTxCost(e.target.value)}
                />
              </div>
            </div>

            {/* Phase 4: factor mix selector */}
            <div className="mt-5 pt-5 border-t border-gray-100">
              <label className={labelCls}>因子组合</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFactorMix("momentum")}
                  className={`text-left rounded-lg border-2 p-3 transition-colors ${
                    factorMix === "momentum"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="text-sm font-medium text-gray-900">
                    单因子：12-1 动量
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    经典 Jegadeesh-Titman 价格动量，仅用价格信息，无前视偏差
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setFactorMix("multifactor")}
                  className={`text-left rounded-lg border-2 p-3 transition-colors ${
                    factorMix === "multifactor"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="text-sm font-medium text-gray-900">
                    多因子：Value + Quality + Momentum
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Yahoo + SEC EDGAR 基本面 + 12-1 动量等权 z-score 合成。基本面数据为
                    point-in-now，存在前视偏差
                  </div>
                </button>
              </div>
              {factorMix === "multifactor" && (
                <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                  ⚠ 多因子回测会拉取所有 30 个标的的基本面数据（首次约 30-60 秒，之后 24 小时内复用缓存）
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Advanced Options */}
        <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span>高级选项</span>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>
          {showAdvanced && (
            <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>滑点（bps）</label>
                  <input
                    type="number"
                    min="0"
                    className={inputCls}
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>多空方向</label>
                  <select
                    className={inputCls}
                    value={longShort}
                    onChange={(e) => setLongShort(e.target.value)}
                  >
                    <option>仅做多</option>
                    <option>多空对冲</option>
                    <option>市场中性</option>
                  </select>
                </div>
              </div>

              {/* Phase 14 — portfolio risk constraints */}
              <div className="border-t border-gray-100 pt-4">
                <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={enableConstraints}
                    onChange={(e) => setEnableConstraints(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-medium text-gray-700">
                    启用风险约束（行业 + 单仓上限）
                  </span>
                </label>
                <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                  不启用 = 经典等权篮子，所有 Top 20% 标的等权重持有。<br />
                  启用 = 应用单仓上限和行业上限后再归一化，结果更接近真实资金经理的组合（Phase 14）。
                </p>
                {enableConstraints && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>单仓上限（%）</label>
                      <input
                        type="number"
                        min="5"
                        max="100"
                        step="1"
                        className={inputCls}
                        value={maxPositionPct}
                        onChange={(e) => setMaxPositionPct(e.target.value)}
                      />
                      <p className="text-[11px] text-gray-400 mt-1">
                        单只标的的最大权重，默认 20%
                      </p>
                    </div>
                    <div>
                      <label className={labelCls}>行业上限（%）</label>
                      <input
                        type="number"
                        min="15"
                        max="100"
                        step="1"
                        className={inputCls}
                        value={maxSectorPct}
                        onChange={(e) => setMaxSectorPct(e.target.value)}
                      />
                      <p className="text-[11px] text-gray-400 mt-1">
                        同一 GICS 板块的累计权重上限，默认 35%
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="border-gray-200 text-gray-700 hover:bg-gray-50"
            onClick={() => router.back()}
          >
            取消
          </Button>
          <Button
            type="submit"
            disabled={loading || !hypothesis.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            {loading ? "生成中..." : "生成研究计划 →"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewStudy() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">加载中…</div>}>
      <NewStudyForm />
    </Suspense>
  );
}
