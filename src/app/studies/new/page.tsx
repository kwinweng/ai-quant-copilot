"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

const EXAMPLE_HYPOTHESIS =
  "美股大盘股中，综合质量因子（ROIC/ROE/毛利率）与价值因子（PE/PB/PS）的组合策略，在扣除交易成本后，10 年回测期内可超越 SPY 基准。";

const MAX_CHARS = 500;

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

const labelCls = "block text-xs font-medium text-gray-600 mb-1";

export default function NewStudy() {
  const router = useRouter();
  const [hypothesis, setHypothesis] = useState("");
  const [universe, setUniverse] = useState("US Large Cap (Russell 1000)");
  const [startDate, setStartDate] = useState("2014-01-01");
  const [endDate, setEndDate] = useState("2024-01-01");
  const [rebalance, setRebalance] = useState("季度");
  const [benchmark, setBenchmark] = useState("SPY");
  const [txCost, setTxCost] = useState("5");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [slippage, setSlippage] = useState("1");
  const [maxPosition, setMaxPosition] = useState("5");
  const [longShort, setLongShort] = useState("仅做多");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => router.push("/studies/plan"), 600);
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">创建新研究</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          描述您的投资假设，AI 将为您生成完整的研究计划
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Hypothesis */}
        <Card className="bg-white border-gray-200 text-gray-900">
          <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
            <CardTitle className="text-sm font-semibold text-gray-900">
              投资假设
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            <div className="relative">
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            <div className="px-4 pb-4 pt-2 border-t border-gray-100">
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
                  <label className={labelCls}>单票最大仓位（%）</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className={inputCls}
                    value={maxPosition}
                    onChange={(e) => setMaxPosition(e.target.value)}
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
            </div>
          )}
        </div>

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
