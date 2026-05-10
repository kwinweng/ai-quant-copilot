"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CheckCircle2,
  Newspaper,
  FileText,
  Activity,
  Satellite,
  Clock,
} from "lucide-react";

const TABS = [
  { key: "market", label: "市场数据" },
  { key: "fundamental", label: "基本面" },
  { key: "alternative", label: "另类数据" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const TEST_SYMBOLS = ["US.AAPL", "US.SPY", "US.MSFT"];

type LogEntry = { ts: string; msg: string; type: "info" | "error" | "success" };

const FUNDAMENTAL_FIELDS = [
  { name: "ROIC", coverage: 94.2, note: "排除金融板块" },
  { name: "ROE", coverage: 97.1, note: "全大盘股覆盖" },
  { name: "毛利率", coverage: 96.8, note: "全大盘股覆盖" },
  { name: "PE 比率", coverage: 92.4, note: "排除负盈利期" },
  { name: "PB 比率", coverage: 98.6, note: "全覆盖" },
  { name: "PS 比率", coverage: 98.9, note: "全覆盖" },
];

const ALT_DATA_SOURCES = [
  {
    icon: Newspaper,
    name: "新闻情绪",
    description: "Reuters / Bloomberg / WSJ 新闻流情绪打分",
  },
  {
    icon: FileText,
    name: "SEC Filings",
    description: "10-K / 10-Q / 8-K 文件文本与异动检测",
  },
  {
    icon: Activity,
    name: "期权链数据",
    description: "波动率曲面、Put/Call 比率、隐含波动率",
  },
  {
    icon: Satellite,
    name: "卫星图像",
    description: "停车场、油储、运输流量等替代信号",
  },
];

export default function DataSourcesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("market");
  const [selectedSymbol, setSelectedSymbol] = useState("US.AAPL");
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [testing, setTesting] = useState(false);
  const [fetching, setFetching] = useState(false);

  function addLog(msg: string, type: LogEntry["type"] = "info") {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [{ ts, msg, type }, ...prev].slice(0, 30));
  }

  function handleTestConnection() {
    setTesting(true);
    addLog("正在尝试连接 Futu OpenD (127.0.0.1:11111)...");
    setTimeout(() => {
      addLog("TCP 连接 127.0.0.1:11111 — Connection refused", "error");
      addLog(
        'Futu OpenD 未运行。请从富途牛牛桌面端启动 OpenD。',
        "error"
      );
      setLastChecked(new Date().toLocaleString("zh-CN"));
      setTesting(false);
    }, 1800);
  }

  function handleFetch() {
    setFetching(true);
    const sym = selectedSymbol.replace("US.", "");
    addLog(`请求 ${sym} 5 年日 K 线数据...`);
    setTimeout(() => {
      addLog('拉取失败：OpenD 未连接。请先点击"测试连接"。', "error");
      setFetching(false);
    }, 1200);
  }

  const aaplShort = selectedSymbol.replace("US.", "");

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">数据源</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          回测实际使用的数据提供方与未来规划路线
        </p>
      </div>

      {/* Phase 4 follow-up U7: actual production data sources, real status. */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 space-y-2">
        <div className="text-sm font-medium text-emerald-900 inline-flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          回测当前使用的真实数据源
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div className="bg-white rounded-md border border-emerald-200/60 px-3 py-2">
            <div className="font-medium text-gray-900">Yahoo Finance</div>
            <div className="text-gray-500 mt-0.5">
              月度调整收盘价 + 当前快照基本面比率
            </div>
          </div>
          <div className="bg-white rounded-md border border-emerald-200/60 px-3 py-2">
            <div className="font-medium text-gray-900">SEC EDGAR XBRL</div>
            <div className="text-gray-500 mt-0.5">
              全历史 10-K filings；Quality 因子 PIT 来源
            </div>
          </div>
          <div className="bg-white rounded-md border border-emerald-200/60 px-3 py-2">
            <div className="font-medium text-gray-900">DeepSeek API</div>
            <div className="text-gray-500 mt-0.5">
              研究计划生成 + 结论解读
            </div>
          </div>
        </div>
      </div>

      {/* Honest demo banner — the panels below are roadmap placeholders, not
          live connections. Adds before-the-fact context to avoid the
          previous "为什么富途显示红字未连接" confusion. */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          <span className="font-medium">演示页面</span>
          ：下面的富途 OpenD / 基本面覆盖率 / 另类数据面板是路线图占位，**不是当前生产配置**。「测试连接」「拉取 K 线」按钮是 UI 草稿，不会发起真实请求。
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 市场数据 Tab */}
      {activeTab === "market" && (
        <div className="space-y-5">
          {/* Futu OpenD Panel */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-900">
                    富途 OpenD
                  </h3>
                  <Badge variant="muted">演示 · 路线图</Badge>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  实时美股行情与历史 K 线接口
                </p>
              </div>
            </div>

            <div className="px-4 py-3 space-y-4">
              {/* 状态详情 */}
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">
                  状态详情
                </h4>
                <div className="bg-gray-50 rounded-lg divide-y divide-gray-100">
                  <StatusRow
                    label="OpenD 状态"
                    value="未连接"
                    statusColor="red"
                  />
                  <StatusRow
                    label="美股数据"
                    value="不可用"
                    statusColor="red"
                  />
                  <StatusRow
                    label="历史 K 线配额"
                    value="0 / 100"
                    statusColor="gray"
                  />
                  <StatusRow
                    label="实时配额"
                    value="0 / 200"
                    statusColor="gray"
                  />
                  <StatusRow
                    label="最后检查"
                    value={lastChecked ?? "尚未检查"}
                    statusColor="gray"
                    icon={<Clock className="h-3.5 w-3.5 text-gray-400" />}
                  />
                </div>
              </div>

              {/* 连接说明 */}
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">
                  连接说明
                </h4>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 space-y-1">
                    <p>1. 启动富途牛牛桌面端并登录账号</p>
                    <p>2. 在【设置 → API】中开启 OpenD 服务</p>
                    <p>
                      3. 默认监听端口为{" "}
                      <code className="font-mono bg-white px-1 rounded">
                        127.0.0.1:11111
                      </code>
                    </p>
                    <p>4. 行情订阅需开通对应权限（美股 LV1 / LV2）</p>
                  </div>
                </div>
              </div>

              {/* 测试标的 */}
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">
                  测试标的
                </h4>
                <div className="flex gap-2 flex-wrap">
                  {TEST_SYMBOLS.map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setSelectedSymbol(sym)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-colors ${
                        selectedSymbol === sym
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap pt-1">
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                  size="sm"
                  onClick={handleFetch}
                  disabled={fetching}
                >
                  {fetching
                    ? "拉取中..."
                    : `获取 ${aaplShort} 5 年日 K 线`}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-gray-200 text-gray-700 hover:bg-gray-50"
                  onClick={handleTestConnection}
                  disabled={testing}
                >
                  {testing ? "测试中..." : "测试连接"}
                </Button>
              </div>
            </div>
          </div>

          {/* Activity Log */}
          {logs.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  活动日志
                </h3>
                <button
                  className="text-xs text-gray-500 hover:text-gray-700"
                  onClick={() => setLogs([])}
                >
                  清空
                </button>
              </div>
              <div className="px-3 py-2 bg-gray-900 font-mono text-xs leading-relaxed max-h-[260px] overflow-y-auto">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-2 px-1 py-0.5">
                    <span className="text-gray-500 shrink-0">[{log.ts}]</span>
                    <span
                      className={
                        log.type === "error"
                          ? "text-red-400"
                          : log.type === "success"
                          ? "text-green-400"
                          : "text-gray-300"
                      }
                    >
                      {log.msg}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 基本面 Tab */}
      {activeTab === "fundamental" && (
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-900">
                    基本面数据（模拟）
                  </h3>
                  <Badge variant="success">已连接</Badge>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Stage 1 原型：模拟的 ROIC、ROE、毛利率、PE、PB、PS 等因子数据
                </p>
              </div>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>所有字段就绪，可立即用于回测</span>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">
                  字段覆盖率
                </h4>
                <div className="space-y-2.5">
                  {FUNDAMENTAL_FIELDS.map((f) => (
                    <div key={f.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-700 font-medium">
                          {f.name}
                        </span>
                        <span className="text-gray-500">{f.coverage}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${f.coverage}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{f.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-900">
                    价格数据（模拟）
                  </h3>
                  <Badge variant="success">已连接</Badge>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Stage 1 原型：模拟的美股大盘股每日 OHLCV
                </p>
              </div>
            </div>
            <div className="px-4 py-3 text-xs text-gray-600 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              <span>2014-01 至 2024-01，约 1023 个标的，2515 个交易日</span>
            </div>
          </div>
        </div>
      )}

      {/* 另类数据 Tab */}
      {activeTab === "alternative" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            以下另类数据源在 Stage 1 阶段尚未集成，规划在 Stage 2 接入。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ALT_DATA_SOURCES.map((src) => {
              const Icon = src.icon;
              return (
                <div
                  key={src.name}
                  className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-3"
                >
                  <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-gray-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-gray-900">
                        {src.name}
                      </h4>
                      <Badge variant="muted">敬请期待</Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {src.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusRow({
  label,
  value,
  statusColor,
  icon,
}: {
  label: string;
  value: string;
  statusColor: "red" | "green" | "gray";
  icon?: React.ReactNode;
}) {
  const dotColor =
    statusColor === "red"
      ? "bg-red-400"
      : statusColor === "green"
      ? "bg-green-400"
      : "bg-gray-300";
  const textColor =
    statusColor === "red"
      ? "text-red-600"
      : statusColor === "green"
      ? "text-green-600"
      : "text-gray-700";

  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-xs text-gray-600">{label}</span>
      <span className={`text-xs font-medium flex items-center gap-1.5 ${textColor}`}>
        {icon ?? <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />}
        {value}
      </span>
    </div>
  );
}
