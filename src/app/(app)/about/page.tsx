"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  History,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Database,
  GitCompare,
  Search,
  Star,
  Archive,
  Tag,
  Download,
  Copy,
  Settings,
  TrendingUp,
} from "lucide-react";

type TabKey = "usage" | "changelog";

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
  highlights: string[];
  // Soft category badge.
  badge?: { label: string; tone: "feature" | "infra" | "fix" };
}

// Source of truth for the in-app changelog. Update this list whenever a new
// phase ships — keep entries newest-first.
const CHANGELOG: ChangelogEntry[] = [
  {
    version: "Sprint #3 · AI 假设教练",
    date: "2026-05-10",
    title: "对话式假设设计 + 28 条分级例子库",
    summary:
      "面向量化新手：通过 3-12 轮对话把模糊的投资想法整理成可回测的假设；同时附带 28 条按初/中/高级分类的现成例子，支持一键预填表单。",
    highlights: [
      "新路由 /studies/coach 和侧边栏「AI 教练」入口",
      "DeepSeek 流式对话，每轮一个聚焦问题，AI 自适应轮数",
      "AI 完成时输出 [FINAL] + JSON，前端识别后展示「进入新研究」CTA",
      "例子库 28 条：8 初级 + 10 中级 + 8 高级 + 2 敏感性，按主题分类",
      "/studies/new 新增 ?hypothesis=...&factorMix=... 等 query 参数预填",
      "AiUsageDay.coachCalls 单独计费，每用户每日 60 轮",
      "首页 + 新研究页加「不知道写什么？让 AI 帮你」入口",
    ],
    badge: { label: "重要", tone: "feature" },
  },
  {
    version: "Sprint #2 · UI 大扫除",
    date: "2026-05-10",
    title: "shadcn 主题统一 + 7 项 UX 修复",
    summary:
      "独立 UI 评审发现的高 ROI 改进打包上线：shadcn 三个原始件改浅色默认；仪表盘 tab 命名理顺；删除 logs 死链；About 文案与 PIT 状态对齐；数据源页演示标记；plan 页假按钮删除；Alpha 负数显示修复。",
    highlights: [
      "Card / Button / Progress 默认 light theme，省去全站样板",
      "仪表盘视图：活跃 / 收藏 / 仅归档 / 全部（语义自洽）",
      "结果页删 logs 死 tab",
      "About 页「混合 PIT」披露与最新 Phase 4.2 对齐",
      "/data-sources 顶部加真实数据源绿条 + 演示横幅",
      "Plan 页每个 section 旁的假「编辑」按钮全删",
      "Alpha 负数不再显示 +-X%",
    ],
    badge: { label: "infra", tone: "infra" },
  },
  {
    version: "Sprint #1 · 紧急修复",
    date: "2026-05-10",
    title: "5 个 CRITICAL 代码问题 + cancel 竞态",
    summary:
      "独立代码评审发现的关键 bug 一次清完：start/cancel 竞态条件、PIT cutoff 一个月偏差、SEC anchor truthy bug、EPS 拆股污染、SEC 惊群。",
    highlights: [
      "C2 — /start 改为原子 updateMany，不会再因并发跑两次",
      "H1 — /cancel 同样原子化，不会覆盖 COMPLETED",
      "C1 — PIT cutoff 修一个月偏差，多因子回测每月用上正确 filing",
      "C3 — SEC fetch() 的 anchor 三元 bug 修复，fiscalDate 不再被设成今天",
      "C4 — 历史 EPS growth 在拆股年禁用，不再出现 100x 假增长",
      "C5 — SEC 历史拉取加 in-flight Promise dedup，避免 429",
    ],
    badge: { label: "fix", tone: "fix" },
  },
  {
    version: "Phase 4.2 · PIT 历史快照",
    date: "2026-05-10",
    title: "消除 SEC 字段的前视偏差",
    summary:
      "Quality 因子（ROE / ROIC / 毛利率 / 负债权益）从「point-in-now 静态贴一份」改为「point-in-time 历史」：每月只用 SEC 提交日早于该月 90 天前的 filing。",
    highlights: [
      "SEC provider 新增 fetchAll(ticker)：返回每个历史 10-K filing 形成的快照数组",
      "Cache 表原生支持多行（PK 已包含 fiscalDate），增加 getSecHistory / getSecHistoryForUniverse 接口",
      "buildMultiFactorScores 重写为 PIT-aware：Quality 字段每月用截止日前最新 filing 做横截面 z-score",
      "Reporting lag = 90 天，覆盖典型 10-K 提交延迟",
      "Yahoo Value 因子（PE/PB/PS/EV-EBITDA）仍为 point-in-now（无历史 API），披露文案明确「混合 PIT」",
      "Runner 中 Yahoo 当前快照 + SEC 历史 filings 并行拉取",
    ],
    badge: { label: "重要", tone: "feature" },
  },
  {
    version: "Phase 4.1 · 改进微调",
    date: "2026-05-10",
    title: "CIK 自动 fallback + ROIC 自算 + EV/EBITDA 兜底",
    summary:
      "Phase 4 末尾列出的 4 项改进里的 3 项：补齐 Quality 因子完整度，提升 Value 因子覆盖率，让 CIK 表自动维护。",
    highlights: [
      "新建 cikMap.ts：硬编码 30 标的为主，cache miss 时从 sec.gov/files/company_tickers.json 拉取并内存缓存",
      "ROIC 自算：NetIncome / (Equity + 长债 + 短债) 简化代理，参与 Quality 合成",
      "EV/EBITDA 兜底：Yahoo enterpriseToEbitda 缺失时用 enterpriseValue ÷ ebitda 自算",
      "披露文案同步更新：明确 ROIC 是简化代理、EV/EBITDA 兜底来源",
    ],
    badge: { label: "feature", tone: "feature" },
  },
  {
    version: "关于页",
    date: "2026-05-10",
    title: "新增「关于」入口（使用说明 + 更新记录）",
    summary:
      "侧边栏第 5 个入口；两个 tab：使用说明（5 步研究流 + Dashboard 用法 + 数据源限制）和更新记录（按时间倒序）。",
    highlights: [
      "新路由 /about（auth-gated）",
      "侧边栏 + 移动 tab bar 加 Info 图标入口",
      "Changelog 数据为唯一源——上线新 phase 只需在数组顶部加一条",
    ],
    badge: { label: "infra", tone: "infra" },
  },
  {
    version: "Phase 4",
    date: "2026-05-10",
    title: "基本面数据 + 多因子研究基础",
    summary:
      "免费方案：Yahoo Finance + SEC EDGAR 混合，落地 Value + Quality + Momentum 等权多因子合成。",
    highlights: [
      "FundamentalSnapshot 缓存表（24 小时 TTL，全用户共享）",
      "Yahoo provider：PE / PB / PS / EV-EBITDA / ROE / 毛利率 / 负债权益比 / 营收 EPS 增长直取",
      "SEC EDGAR provider：XBRL companyfacts，自算 ROE / 毛利率 / D-E、保留 filed 时间戳供 PIT 用",
      "Merge 策略：Yahoo 拿价格相关比率，SEC 拿基本面比率（SEC 优先），互相兜底",
      "新研究表单加因子组合选择器（动量 vs 多因子）",
      "结果页分析 tab 加 FactorCoverageCard + FactorBreakdownCard",
      "回测流程在多因子模式下扩展为 10 步（增加「拉取基本面数据」）",
    ],
    badge: { label: "重要", tone: "feature" },
  },
  {
    version: "Phase 3.2",
    date: "2026-05-10",
    title: "实验管理 + 研究对比",
    summary:
      "把仪表盘从「列表」升级为「实验工作台」：搜索、筛选、收藏、归档、标签、双研究并排对比。",
    highlights: [
      "Study 加 tags / favorited / archived 字段",
      "PATCH /api/studies/[id]：标题 / 标签 / 收藏 / 归档严格白名单更新",
      "仪表盘视图：全部 / 收藏 / 已归档 / 含归档",
      "实时搜索（标题 + 假设），状态 / 因子类型 / 标签筛选",
      "排序：创建时间 / CAGR / Sharpe / Max DD",
      "新页面 /studies/compare?a=ID&b=ID：指标对比 + 参数差异 + 权益叠加 + 回撤叠加",
    ],
    badge: { label: "重要", tone: "feature" },
  },
  {
    version: "Phase 3.1",
    date: "2026-05-10",
    title: "真实回测研究体验",
    summary: "完成的研究不再只是几张图——增加数据质量披露、年度明细、月度极值、再平衡历史、参数敏感性扫描、Markdown 导出、复制并修改。",
    highlights: [
      "结果页顶部固定「数据质量与偏差」面板（幸存者偏差 + 因子类型 + 免责声明）",
      "年度收益明细表（含超额）",
      "最佳 / 最差 5 个月份",
      "再平衡历史卡片（持仓 + 换手 + 交易成本，可展开）",
      "参数敏感性扫描：动量回看期 6/9/12，再平衡频率，分位桶宽度",
      "「导出 Markdown」+「复制并修改」（替换占位的导出 PDF / 分享）",
      "/studies/new 支持 ?cloneFrom=<id> 预填表单",
    ],
    badge: { label: "重要", tone: "feature" },
  },
  {
    version: "Phase 3",
    date: "2026-05-10",
    title: "真实回测执行",
    summary: "切换到真数据 + 真因子：Yahoo Finance 月度调整收盘价 + 12-1 价格动量。",
    highlights: [
      "Yahoo Finance 价格拉取（带预热月数 + 失败容忍）",
      "12-1 动量因子（跳过最近 1 月避免反转）",
      "完整回测引擎：再平衡、交易成本、月度模拟",
      "风险指标：CAGR / Sharpe / Max DD / Calmar / Beta / Alpha / IR / 换手率",
      "因子诊断（IC / IC IR / Q1-Q5 价差）",
    ],
    badge: { label: "重要", tone: "feature" },
  },
  {
    version: "Phase 2.2",
    date: "2026-05-09",
    title: "AI 计划 + AI 解读",
    summary: "DeepSeek API 接入：研究计划 + 结论自动生成；错误信息脱敏。",
    highlights: [
      "新研究 → 自动生成研究计划（数据要求、因子定义、回测规则、风险检查、限制）",
      "结果页按需生成 AI 结论与要点",
      "describeAiError 错误映射器，机密自动脱敏",
      "每用户每日 AI 调用计数（cheap rate limit）",
    ],
    badge: { label: "feature", tone: "feature" },
  },
  {
    version: "Phase 2.1",
    date: "2026-05-09",
    title: "持久化 + 多用户 + 取消能力",
    summary: "PostgreSQL + Prisma + NextAuth v5（GitHub OAuth），所有研究按 userId 严格隔离。",
    highlights: [
      "Prisma schema：User / Study / StudyPlan / StudyProgress / StudyResult",
      "GitHub OAuth 登录",
      "JWT session 策略（修复中间件重定向死循环）",
      "/cancel 端点 + 幂等 running 页",
      "Dashboard 删除研究",
      "实时进度轮询（替换之前的 setTimeout 模拟）",
    ],
    badge: { label: "infra", tone: "infra" },
  },
  {
    version: "Stage 1",
    date: "2026-05-08",
    title: "原型骨架",
    summary: "Next.js + shadcn/ui + Recharts，6 条路由跑通，全部 mock 数据。",
    highlights: [
      "/ 仪表盘",
      "/studies/new 创建研究",
      "/studies/plan 研究计划确认",
      "/studies/running 执行进度（动画占位）",
      "/studies/demo-result 结果报告",
      "/data-sources 数据源检查",
      "中文 UI + 侧边栏布局",
    ],
    badge: { label: "原型", tone: "infra" },
  },
];

export default function AboutPage() {
  const [tab, setTab] = useState<TabKey>("usage");

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">关于</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          AI Quant Copilot · 个人量化研究副驾驶 · 美股大市值
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200">
        <TabButton
          active={tab === "usage"}
          onClick={() => setTab("usage")}
          icon={<BookOpen className="h-4 w-4" />}
          label="使用说明"
        />
        <TabButton
          active={tab === "changelog"}
          onClick={() => setTab("changelog")}
          icon={<History className="h-4 w-4" />}
          label="更新记录"
        />
      </div>

      {tab === "usage" && <UsageGuide />}
      {tab === "changelog" && <Changelog />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "text-blue-600"
          : "text-gray-500 hover:text-gray-900"
      }`}
    >
      {icon}
      {label}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
      )}
    </button>
  );
}

// =====================================================================
// Usage guide
// =====================================================================

function UsageGuide() {
  return (
    <div className="space-y-6">
      <Section
        title="它是什么"
        icon={<Sparkles className="h-4 w-4 text-blue-600" />}
      >
        <p className="text-sm text-gray-700 leading-relaxed">
          AI Quant Copilot 是一个面向个人研究者的美股量化研究平台。它把「投资假设 → 研究计划 → 真实回测 → 报告解读」串成一条可重复的工作流，并把回测结果做成可对比、可复制、可导出的研究资产。
        </p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <FeatureChip>真实回测（Yahoo Finance 价格）</FeatureChip>
          <FeatureChip>AI 计划与解读（DeepSeek）</FeatureChip>
          <FeatureChip>多因子（Yahoo + SEC）</FeatureChip>
          <FeatureChip>实验管理（标签 / 收藏 / 归档）</FeatureChip>
          <FeatureChip>研究对比（指标 + 曲线叠加）</FeatureChip>
          <FeatureChip>Markdown 导出</FeatureChip>
        </div>
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium">不是什么：</span>
            不是炒股软件、不是券商终端、不是社交跟单平台、不是投资建议。所有研究结果仅供研究和教育用途。
          </div>
        </div>
      </Section>

      <Section
        title="一次完整研究的 5 步"
        icon={<ArrowRight className="h-4 w-4 text-blue-600" />}
      >
        <ol className="space-y-3">
          <Step
            n={1}
            title="新建研究"
            body={
              <>
                进入「新研究」，写一句投资假设（例如「价值 + 质量因子组合在大市值美股上长期跑赢 SPY」），选股票池、回测区间、再平衡频率、基准、交易成本。
                <span className="block mt-1.5 text-blue-700">
                  Phase 4 起还能选「因子组合」：动量单因子 vs Value+Quality+Momentum 多因子。
                </span>
              </>
            }
            link={{ href: "/studies/new", label: "开始" }}
          />
          <Step
            n={2}
            title="确认研究计划"
            body="提交后 AI 自动生成研究计划：数据要求、因子定义、回测规则、风险检查、限制。看一眼，确认无误就启动回测。"
          />
          <Step
            n={3}
            title="跑回测（实时进度）"
            body="9 步流程（多因子模式 10 步）：拉价、拉基准、（拉基本面）、算因子、构组合、跑引擎、算指标、敏感性扫描、入库。可随时取消。"
          />
          <Step
            n={4}
            title="读报告"
            body="结果页四个 tab——总览（AI 结论 + 数据质量 + 月度极值）、指标（年度收益 + 详细指标）、图表（权益 + 回撤 + 年度）、分析（因子诊断 + 因子覆盖 + 持仓多因子分解 + 参数敏感性 + 再平衡历史）。"
          />
          <Step
            n={5}
            title="衍生：复制 / 对比 / 导出"
            body="一个研究做完后可以「复制并修改」生成变体，或在「对比」页选两个已完成的研究做并排比较，或一键导出 Markdown 报告。"
          />
        </ol>
      </Section>

      <Section
        title="仪表盘怎么用"
        icon={<Search className="h-4 w-4 text-blue-600" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Tip
            icon={<Search className="h-3.5 w-3.5" />}
            title="搜索"
            body="顶部搜索框实时过滤标题和假设。"
          />
          <Tip
            icon={<Star className="h-3.5 w-3.5" />}
            title="收藏"
            body="星标保留你最有把握的研究，「收藏」视图集中查看。"
          />
          <Tip
            icon={<Archive className="h-3.5 w-3.5" />}
            title="归档"
            body="不再活跃但有保留价值的研究归档隐藏，「已归档」视图找回。"
          />
          <Tip
            icon={<Tag className="h-3.5 w-3.5" />}
            title="标签"
            body="在每张卡片右下加自定义标签（如「价值因子」「2024-q4」），顶部标签筛选器统一过滤。"
          />
          <Tip
            icon={<Settings className="h-3.5 w-3.5" />}
            title="筛选 + 排序"
            body="按状态 / 因子类型 / 标签筛选；按创建时间 / CAGR / Sharpe / Max DD 排序。"
          />
          <Tip
            icon={<GitCompare className="h-3.5 w-3.5" />}
            title="对比"
            body="顶部「对比研究」入口，挑两个已完成的研究做并排分析。"
          />
        </div>
      </Section>

      <Section
        title="结果页的 4 个 tab"
        icon={<TrendingUp className="h-4 w-4 text-blue-600" />}
      >
        <div className="space-y-2 text-sm">
          <TabRow
            label="总览"
            body="数据质量与偏差面板（始终在顶部）→ AI 结论 + 关键指标卡 → 最佳 / 最差 5 个月份。这一页的目的是 30 秒判断「这个策略有没有意思」。"
          />
          <TabRow
            label="指标"
            body="年度收益对比图 + 明细表 + 月度极值表 + 完整指标表（CAGR / Sharpe / Max DD / Calmar / 年化波动率 / Beta / Alpha / IR / 月度胜率 / 年化换手率）。"
          />
          <TabRow
            label="图表"
            body="权益曲线 + 回撤序列。Hover 查看月度数值。"
          />
          <TabRow
            label="分析"
            body="因子 IC 诊断 → 基本面字段覆盖率（多因子模式）→ 最末次再平衡持仓的 V/Q/M z-score 分解（多因子模式）→ 参数敏感性扫描（6/9/12 动量、月/季再平衡、Top 10/20/30%）→ 再平衡历史。"
          />
        </div>
      </Section>

      <Section
        title="数据来源与限制"
        icon={<Database className="h-4 w-4 text-blue-600" />}
      >
        <div className="space-y-2.5 text-sm text-gray-700">
          <DataRow
            source="Yahoo Finance"
            usage="月度调整收盘价 + 当前快照基本面比率（PE/PB/PS/EV-EBITDA 用于 Value 静态 tilt）"
            limit="非官方 API；Value 因子仍为 point-in-now，应用于所有历史月，存在前视偏差（Phase 5 计划用 SEC EPS 自算历史 PE 消除）"
          />
          <DataRow
            source="SEC EDGAR XBRL"
            usage="全历史 10-K filings；ROE / ROIC / 毛利率 / 负债权益 自算，按 90 天 reporting lag 做 PIT-correct 回测"
            limit="EPS growth 在拆股年份会失真，历史路径中已禁用；ROIC 为简化代理"
          />
          <DataRow
            source="DeepSeek API"
            usage="研究计划生成 + 结果解读（按需触发，每用户每日有调用计数）"
            limit="API 出错时降级到错误提示，不会阻塞回测"
          />
        </div>
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">幸存者偏差：</span>
              当前股票池为静态 30 只大市值美股（硬编码），不重建历史成分股。
            </div>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">混合 PIT：</span>
              SEC Quality 因子（ROE / ROIC / 毛利率 / D-E）已是 point-in-time（90 天 reporting lag）；Yahoo Value 因子（PE/PB/PS/EV-EBITDA）仍是 point-in-now 静态贴一份，存在前视偏差。
            </div>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">非投资建议：</span>
              本平台输出仅为研究和教育用途，不构成任何投资建议。
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="实用技巧"
        icon={<CheckCircle2 className="h-4 w-4 text-blue-600" />}
      >
        <ul className="space-y-2 text-sm text-gray-700 list-disc pl-5">
          <li>
            <span className="font-medium">复制并修改</span>{" "}
            <Copy className="inline h-3 w-3 align-text-bottom" />
            ：不要从零写新研究——基于一个已有研究做参数变化，比较容易判断改动是否有效。
          </li>
          <li>
            <span className="font-medium">敏感性扫描</span>：在分析 tab 看动量回看期 / 再平衡频率 / 分位桶宽度的指标变化。如果策略对单个参数极敏感，要警惕过拟合。
          </li>
          <li>
            <span className="font-medium">导出 Markdown</span>{" "}
            <Download className="inline h-3 w-3 align-text-bottom" />
            ：定期导出研究存档到笔记系统（Obsidian / Notion 等），免得日后回看 Markdown 完整保留指标 + 图表数据 + 数据质量披露。
          </li>
          <li>
            <span className="font-medium">多因子的首次拉取</span>：30 个标的的 Yahoo + SEC 数据约 30-60 秒；之后 24 小时内复用缓存。所以连跑多个多因子变体不会重复付出这个时间。
          </li>
          <li>
            <span className="font-medium">用标签管 Sprint</span>：给同一组实验打同一个标签（如「2026-q2-momentum」），方便事后回顾整个研究 Sprint 的轨迹。
          </li>
        </ul>
      </Section>

      <Section
        title="技术栈"
        icon={<Settings className="h-4 w-4 text-blue-600" />}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Tech>Next.js 15 (App Router)</Tech>
          <Tech>React 19</Tech>
          <Tech>TypeScript</Tech>
          <Tech>Tailwind CSS 4</Tech>
          <Tech>shadcn/ui</Tech>
          <Tech>Recharts</Tech>
          <Tech>SWR</Tech>
          <Tech>Prisma 6 + PostgreSQL 14</Tech>
          <Tech>NextAuth v5（GitHub OAuth）</Tech>
          <Tech>yahoo-finance2 SDK</Tech>
          <Tech>SEC EDGAR XBRL API</Tech>
          <Tech>DeepSeek API</Tech>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-white border-gray-200">
      <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
        <CardTitle className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

function FeatureChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs bg-blue-50 border border-blue-100 text-blue-800 rounded-md px-2.5 py-1.5">
      {children}
    </div>
  );
}

function Step({
  n,
  title,
  body,
  link,
}: {
  n: number;
  title: string;
  body: React.ReactNode;
  link?: { href: string; label: string };
}) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
        {n}
      </span>
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-900 mb-0.5">
          {title}
          {link && (
            <Link href={link.href} className="ml-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-blue-600 hover:bg-blue-50"
              >
                {link.label} →
              </Button>
            </Link>
          )}
        </div>
        <div className="text-sm text-gray-600 leading-relaxed">{body}</div>
      </div>
    </li>
  );
}

function Tip({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="border border-gray-100 rounded-md p-2.5 bg-gray-50/40">
      <div className="text-xs font-medium text-gray-900 mb-0.5 inline-flex items-center gap-1.5">
        <span className="text-blue-600">{icon}</span>
        {title}
      </div>
      <div className="text-xs text-gray-600 leading-relaxed">{body}</div>
    </div>
  );
}

function TabRow({ label, body }: { label: string; body: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <Badge variant="muted" className="shrink-0 mt-0.5">
        {label}
      </Badge>
      <div className="text-gray-700 leading-relaxed">{body}</div>
    </div>
  );
}

function DataRow({
  source,
  usage,
  limit,
}: {
  source: string;
  usage: string;
  limit: string;
}) {
  return (
    <div className="border border-gray-100 rounded-md p-3 bg-gray-50/30">
      <div className="text-sm font-medium text-gray-900">{source}</div>
      <div className="text-xs text-gray-600 mt-0.5">
        <span className="font-medium text-gray-500">用途：</span>
        {usage}
      </div>
      <div className="text-xs text-gray-600 mt-0.5">
        <span className="font-medium text-amber-700">限制：</span>
        {limit}
      </div>
    </div>
  );
}

function Tech({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center bg-gray-50 border border-gray-100 rounded px-2 py-1.5 text-gray-700">
      {children}
    </div>
  );
}

// =====================================================================
// Changelog
// =====================================================================

function Changelog() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 mb-4">
        按时间倒序排列。所有条目都对应 git 提交记录与生产部署。
      </p>
      {CHANGELOG.map((entry, idx) => (
        <ChangelogCard
          key={entry.version}
          entry={entry}
          isLatest={idx === 0}
        />
      ))}
    </div>
  );
}

function ChangelogCard({
  entry,
  isLatest,
}: {
  entry: ChangelogEntry;
  isLatest: boolean;
}) {
  const toneCls =
    entry.badge?.tone === "feature"
      ? "bg-blue-100 text-blue-700"
      : entry.badge?.tone === "fix"
        ? "bg-amber-100 text-amber-800"
        : "bg-gray-100 text-gray-700";

  return (
    <div
      className={`bg-white border rounded-lg overflow-hidden ${
        isLatest ? "border-blue-300 ring-1 ring-blue-100" : "border-gray-200"
      }`}
    >
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">
            {entry.version}
          </span>
          {isLatest && (
            <span className="text-[10px] uppercase tracking-wider bg-blue-600 text-white rounded px-1.5 py-0.5">
              最新
            </span>
          )}
          {entry.badge && (
            <span
              className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${toneCls}`}
            >
              {entry.badge.label}
            </span>
          )}
          <span className="text-xs text-gray-400 font-mono">{entry.date}</span>
        </div>
      </div>
      <div className="px-4 py-3">
        <h3 className="text-sm font-medium text-gray-900 mb-1">
          {entry.title}
        </h3>
        <p className="text-sm text-gray-600 mb-3 leading-relaxed">
          {entry.summary}
        </p>
        <ul className="space-y-1">
          {entry.highlights.map((h, i) => (
            <li
              key={i}
              className="text-xs text-gray-700 leading-relaxed flex items-start gap-2"
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
