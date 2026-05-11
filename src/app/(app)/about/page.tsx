"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  History,
  GraduationCap,
  Lightbulb,
  AlertOctagon,
  ScanLine,
  Calculator,
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
  Layers,
  Activity,
  Coins,
  Library,
} from "lucide-react";

type TabKey = "usage" | "learn" | "changelog";

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
    version: "Phase 11.5 · 量化入门 4 个进阶章节",
    date: "2026-05-12",
    title: "把 MVP 留的「未来章节计划」全部补完——共 9 章",
    summary:
      "Phase 11 MVP 留了 4 章占位符没写。这一版全部补齐：因子家族详解（动量/价值/质量/低波/成长 5 个因子各自的大白话定义 + 论文起源 + 行为金融解释 + 本工具实现状态）、鲁棒性检验怎么读（Bootstrap CI / IS-OOS / 子区间三个子检验逐个讲）、真实交易成本（spread / impact / commission / 换手放大 + 本工具两种成本模型对比）、推荐资源清单（入门书 / 进阶书 / 5 篇必读论文 / 中英文社区 / 数据源 / 学习路径）。",
    highlights: [
      "Ch6 因子家族：5 个因子各一段，明确标注本工具实现哪些（动量/价值/质量已实现，低波/成长未实现）",
      "Ch7 鲁棒性：Bootstrap CI / IS-OOS 70-30 / 子区间 50-50 三个检验逐个讲解读方式",
      "Ch8 交易成本：spread 按市值分层量级感、market impact 的 √turnover 规律、佣金与隐性 PFOF 成本",
      "Ch9 资源清单：从《打开量化投资的黑箱》到 López de Prado 的完整学习路径建议",
    ],
    badge: { label: "更新", tone: "feature" },
  },
  {
    version: "Phase 12 · Paper 月度调仓提醒",
    date: "2026-05-11",
    title: "Paper 组合每月自动重算 + Telegram 推送，仅建议、不自动改",
    summary:
      "Paper 之前是开仓后就 buy-and-hold 一直放着，看起来\"省心\"但实际上策略可能早就该换股票了。这个版本加了月度调度器：每月初系统重新跑你的策略、把\"该买什么、该卖什么\"算出来，写到该 Paper 组合下做成「待处理」并通过 Telegram 推一份消息给你。重要前提：仅建议，不自动改持仓——必须你点「确认调仓」才会更新，避免脚本 bug 默默把组合弄乱。",
    highlights: [
      "新表 PaperRebalanceAdvice，每月 1 行记录建议持仓 vs 当前持仓 + 加入/卖出 diff",
      "/api/cron/paper-advice 受 CRON_SECRET 保护，遍历所有未归档组合 → 写表 → 发 Telegram",
      "Telegram 通知客户端：sendTelegram() + formatAdviceMessage()，未配置 token 时静默 no-op",
      "Paper 列表页加「待处理」红点 + 展开看 diff 后点「确认调仓」或「跳过本次」",
      "/api/paper/[id]/advice 列表 + PATCH /[adviceId] 原子更新 advice 状态 + 组合持仓",
      "纯函数测试：diffTickerSets / tickerSetsEqual / formatAdviceMessage / isRebalanceMonth 共 +24 个用例",
    ],
    badge: { label: "重要", tone: "feature" },
  },
  {
    version: "Phase 11 · 量化入门科普",
    date: "2026-05-11",
    title: "「关于」加第三个 tab，把报告里的所有术语用大白话讲清楚",
    summary:
      "用户反馈：跑完研究看不懂报告里的指标 + 偏差 + PIT 都是什么。这一版加了「量化入门」tab，MVP 4 章，口语化风格，绑定本工具实际功能讲解。后续每个产品 phase 上线会同步更新对应章节。",
    highlights: [
      "新 tab「量化入门」，与「使用说明」「更新记录」平级",
      "第 1 章「量化交易是什么」：因子 / 回测 / 再平衡 / 基准四个核心概念",
      "第 2 章「报告指标」：CAGR / Sharpe / Max DD / Calmar / Alpha / Beta / IR / 胜率 / 换手率 9 个指标的口语化解释",
      "第 3 章「陷阱」：幸存者偏差 / 前视偏差 / 过拟合 / 样本太小，每个有「类比 + 本工具的现状 / 解法」",
      "第 4 章「PIT」：as-reported vs restated 概念 + 本工具 Phase 4.2 (Quality) + Phase 5 (Value) 的实现",
      "组件 LearnSection / Concept / MetricExplain / Pitfall 设计成可复用模板，后续添新章节零样板代码",
      "尾部标注「未来章节计划」：因子家族、鲁棒性详解、真实成本、推荐资源",
    ],
    badge: { label: "重要", tone: "feature" },
  },
  {
    version: "Phase 10 · Paper Trading",
    date: "2026-05-11",
    title: "完成研究 → 一键转纸面持仓 → 持续追踪实际表现",
    summary:
      "在结果页加「转 Paper 组合」按钮，从研究的最末次再平衡持仓建一个等权 buy-and-hold 模拟组合。新页面 /paper 拉 Yahoo 最新月度价实时估值，对比基准（默认 SPY）。从「回测就完了」变成「持续观察」的工作流闭环。",
    highlights: [
      "新表 PaperPortfolio：sourceStudyId / sourceRebalanceDate / holdings JSON / initialValue / benchmark / archived / notes",
      "POST /api/paper：从已完成研究的最末次再平衡建仓（必须已 COMPLETED + 有 rebalanceHistory）",
      "GET /api/paper：列表（轻量，不重新拉价）",
      "GET /api/paper/[id]/value：拉 Yahoo 最新价实时估值（含基准对比）",
      "DELETE /api/paper/[id]/value：归档（软删除）",
      "src/lib/paper/valuation.ts：valuatePortfolio + equalWeight 纯函数",
      "新页 /paper：列表 + 实时估值卡片 + 跑赢/落后基准徽章",
      "结果页加「转 Paper 组合」按钮（优先级低于「复制并修改」）",
      "侧边栏加 Paper 入口（Briefcase 图标）",
      "+10 个测试（valuation 10 个：等权计算、收益率、不可用 ticker、退化输入）",
      "限制：当前 buy-and-hold 不调仓；无邮件/Telegram 提醒；用户要主动来看",
    ],
    badge: { label: "重要", tone: "feature" },
  },
  {
    version: "Phase 9 · 多基准归因",
    date: "2026-05-11",
    title: "对 SPY/QQQ/IWM/MTUM/IUSV 跑 OLS，看 alpha 是不是因子伪装",
    summary:
      "回测完成后自动拉 5 只因子 ETF 的月度价格，对每只跑一次单变量 OLS 回归，输出 alpha (年化) / beta / R²。如果策略对 MTUM 的 R²=0.85，则所谓 alpha 就是动量因子敞口的别名，不是真 alpha。",
    highlights: [
      "新模块 src/lib/backtest/benchmarkAttribution.ts：纯函数 + ATTRIBUTION_BENCHMARKS 列表",
      "5 个基准 ETF：SPY（市场）/ QQQ（成长）/ IWM（小盘）/ MTUM（动量）/ IUSV（价值）",
      "OLS 单变量回归：strat = α + β × bench + ε",
      "Runner 自动拉缺失的 4 只 ETF 月价（SPY 已是回测 benchmark），跑 5 次 OLS",
      "StudyResult.benchmarkAttribution Json? 持久化，结果页「分析」tab 加 BenchmarkAttributionCard",
      "+12 个测试（OLS 数学验证、月份对齐、年化 alpha、退化情况）",
      "已知简化：单变量 OLS 而非 Fama-French 多因子（构造正交因子 returns 工程量大，留给后续 phase）",
    ],
    badge: { label: "重要", tone: "feature" },
  },
  {
    version: "Phase 8 · OOS 拆分 + Bootstrap 置信区间",
    date: "2026-05-11",
    title: "把 alpha 是否显著、是否依赖某段时间窗口暴露出来",
    summary:
      "回测完成后自动跑：70/30 样本内/外拆分（看 OOS 衰减）+ 前后两段对比（看制度敏感性）+ Bootstrap 1000 次重抽样的 95% CI（看噪音 vs 信号）。结果页「分析」tab 加 RobustnessCard。",
    highlights: [
      "新模块 src/lib/backtest/robustness.ts：纯函数，月度收益输入，输出三个分析",
      "splitInSampleOutOfSample(0.7) → 样本内/外指标差异",
      "halfSplit → 前后段 CAGR/Sharpe/MaxDD 对比",
      "bootstrapMetricCI：IID 重抽样 1000 次，确定性种子，输出 mean/median/95% CI",
      "StudyResult.robustness Json? 字段持久化报告",
      "结果页分析 tab 新 RobustnessCard：3 张子表 + 解读说明",
      "+13 个测试（robustness 13 个：split 数学、bootstrap 确定性、regime-shift 检测）",
      "已知简化：使用 IID bootstrap（非 stationary block bootstrap），月度大市值数据下差异有限",
    ],
    badge: { label: "重要", tone: "feature" },
  },
  {
    version: "Phase 7 · 真实交易成本模型",
    date: "2026-05-11",
    title: "分层流动性 + 平方根市场冲击，新研究默认实盘可信",
    summary:
      "替换原单一 bps 模型为：mega-cap 1 bps、large-cap 4 bps、mid-cap 10 bps 基础点差 + sqrt(turnover) × 5 bps 市场冲击 + 用户填的 bps 佣金。新研究默认走 tiered 模型，老研究保持 simple 兼容。",
    highlights: [
      "新模块 src/lib/backtest/costModel.ts：60 标的按 mega/large/mid 分层（top 10 / 中间 30 / 末 20）",
      "tieredCost：avg(spread by tier) + sqrt(turnover) × 5 bps + userCommission",
      "BacktestInput 加 costMode 参数；engine 改用 costFn 接口（simple 保持 100% 老行为）",
      "Study.costModel 字段（默认 simple 保兼容；新研究通过 form 提交 tiered）",
      "DataQualityCard 增加 costModel 披露：明确告诉用户哪条计算路径",
      "+13 个测试（costModel 13 个：tier 分类、ratio 公式、size 超线性、混合 portfolio）",
    ],
    badge: { label: "重要", tone: "feature" },
  },
  {
    version: "Phase 6 · 股票池 30→60 + UniverseProvider 抽象",
    date: "2026-05-11",
    title: "样本数翻倍 + 8 板块覆盖 + 加入「淡出大市值」反幸存者样本",
    summary:
      "把硬编码股票池从 30 扩到 60，覆盖 8 个 GICS 板块；新增 UniverseProvider 接口为 Phase 6.5 时变成分股铺路。仍是静态 universe，但样本数 2× + 部分弱势标的（INTC/IBM/GE/F/KSS/X）部分缓解幸存者偏差。",
    highlights: [
      "30 → 60 标的：tech/financials/healthcare/consumer disc/staples/energy/industrials/comms 各占合理比例",
      "新增 30 只 CIK 映射并加测试保证唯一性",
      "src/lib/backtest/universeProvider.ts：UniverseProvider 接口 + 静态实现 + 时变 universe 占位（Phase 6.5）",
      "DataQualityCard 文案更新：30 → 60，幸存者偏差仍诚实披露",
      "+12 个测试（universe 12 个：列表完整性、CIK 唯一性、provider 接口、rebalance 解析）",
      "Phase 6.5 待办：Wikipedia 历史 S&P 500 成分 + getUniverseAt(M) 时变接入",
    ],
    badge: { label: "重要", tone: "feature" },
  },
  {
    version: "Phase 5 · Value 因子 PIT 化",
    date: "2026-05-10",
    title: "PE / PB / PS 历史值消除前视偏差，多因子从「混合 PIT」升级到「全 PIT」",
    summary:
      "原 Yahoo Value 静态 tilt（用今天的 PE 贴满全部历史月）替换为：MarketCap_M = MarketCap_today × (adjclose_M / adjclose_today) 反推 + SEC PIT-visible 绝对值（NetIncomeTTM / StockholdersEquity / RevenuesTTM）。所有 SEC-derivable Value 因子现在都 PIT-correct。",
    highlights: [
      "FundamentalSnapshot 加 marketCap / netIncomeTTM / revenuesTTM / stockholdersEquity 4 个新字段",
      "Yahoo provider 从 summaryDetail.marketCap 抽出当前 MarketCap",
      "SEC fetch + fetchAll 透传 NetIncomeTTM / Revenues / StockholdersEquity 绝对值",
      "新模块 src/lib/factors/historicalValue.ts：historicalMarketCap + valueRatiosFromInputs + valueRatiosAtMonth + latestAdjcloseByTicker（4 个纯函数）",
      "buildMultiFactorScores 接受 prices 参数，在每个回测月做 per-month Value z-score 替换原静态 Yahoo z",
      "拆股不变性：MarketCap = price × shares，二者反向缩放，公式天然处理拆股",
      "EV/EBITDA 仍 Yahoo 当前快照兜底（D&A 历史抽取留 Phase 5+）",
      "数据质量披露文案 + About 页同步更新为「全 PIT 多因子」",
      "+12 个测试（historicalValue 11 个 + pitMultifactor 1 个 Phase 5 专项），共 76/76 通过",
    ],
    badge: { label: "重要", tone: "feature" },
  },
  {
    version: "Sprint #7 · 测试与正确性硬化",
    date: "2026-05-10",
    title: "Vitest 引入 + 64 个核心单测覆盖关键边界",
    summary:
      "零新功能、零行为变化的内部 Sprint：Vitest 接入 + 把 PIT 逻辑、回测引擎、metrics、merge 优先级、in-flight 去重、/start 原子声明等高风险路径用 64 个单测固化。",
    highlights: [
      "vitest@4 + @/* alias，npm test / npm run test:watch 即跑",
      "src/lib/factors/pitMultifactor.ts —— 从 runner.ts 抽出 monthKeyToCutoff / pickSnapshotAsOf / crossSectionalZ / buildMultiFactorScores 的纯函数模块",
      "src/lib/util/inflight.ts —— 从 cache.ts 抽出通用 in-flight 去重 helper",
      "PIT 测试 17 个：cutoff 边界、SEC as-of 不泄露未来 filing、PIT 视野下排序方向跟随 SEC 数据切换",
      "engine 测试 6 个：axis 严格 1 月间距（H3）、缺失价格不崩、月/季再平衡频率差异、txCost 真扣 equity",
      "metrics 测试 12 个：CAGR 年化、Sharpe ≈ mean/std×√12、Max DD 峰谷追踪、turnover 年化、SPY 自比 alpha=0/beta=1",
      "factor 测试 9 个：12-1 = computeMomentum(12,1)、ranking ticker 字典序 tiebreaker（M2）",
      "merge 测试 11 个：Yahoo wins Value、SEC wins Quality、SEC reportedAt 保留、缺失字段回退",
      "inflight 测试 5 个：同 key 复用、不同 key 隔离、resolve/reject 后清理",
      "/start route 测试 5 个：updateMany 谓词形状、alreadyRunning 路径、并发声明只一个成功",
      "总：7 测试文件 / 64 测试 / 全过 / 200ms 内跑完",
    ],
    badge: { label: "infra", tone: "infra" },
  },
  {
    version: "PWA · iOS 主屏 App",
    date: "2026-05-10",
    title: "iOS / Android 添加到主屏幕原生体验",
    summary:
      "Safari 添加到主屏幕后以蓝色折线品牌图标显示，开启「作为网页 App 打开」后无浏览器 chrome 全屏运行；同步修复了「关于」入口在移动端被误隐藏的问题。",
    highlights: [
      "新增 /apple-icon（180×180 PNG）、/icon（32×32 PNG）、/manifest.webmanifest 三个动态路由",
      "Logo 设计：蓝色渐变方块 + 白色上升折线 + 右上角光芒，60×60 显示尺寸下仍清晰",
      "layout.tsx 加 appleWebApp / themeColor / Viewport 元数据，iOS 状态栏与品牌色融合",
      "middleware 把 /icon / /apple-icon / /manifest.webmanifest 加入 public 路径，未登录用户也能拉取（否则 iOS 显示字母 A 兜底）",
      "移动 tab bar 把「关于」加回（替换数据源，因数据源页是演示），桌面侧边栏不变",
    ],
    badge: { label: "feature", tone: "feature" },
  },
  {
    version: "Sprint #6 · 评审 backlog 收尾",
    date: "2026-05-10",
    title: "MEDIUM 5 项 + UI 微调 3 项全部清掉",
    summary:
      "把代码评审里的 MEDIUM 和 UI 微调一次刷干净。性能、健壮性、可访问性三个维度的兜底都到位。",
    highlights: [
      "M2 — rankByFactor 加 ticker 字典序 tiebreaker，相同 score 的标的选择确定可重复",
      "M3 — prices.ts 跳过 endDate 之后的 in-progress bar，回测最末月不再混入月中价",
      "M1 — SEC 历史 PIT 行不再存 raw payload；getSecHistoryForUniverse 默认并发 4→2，内存峰值减半",
      "M5 — GET /api/studies 服务端 slim metrics，仅保留 dashboard 用的 CAGR/Sharpe/Max DD，轮询载荷减半",
      "M4 — Study.tags 加 GIN 索引，工作区扩到几百个 study 时标签筛选不再 seq-scan",
      "U17 — Failed badge 从 warning 黄改 danger 红，与 running 页一致",
      "U19 — 表头 text-gray-400 全替换为 gray-500，达 WCAG AA 4.5:1 对比度",
      "U20 — IconButton 加 focus-visible 蓝色焦点环，键盘可见",
    ],
    badge: { label: "fix", tone: "fix" },
  },
  {
    version: "Sprint #5 · 剩余健壮性兜底",
    date: "2026-05-10",
    title: "Yahoo D/E 单位、SEC 债务概念、SSE done 帧、AI quota retry 计费",
    summary:
      "代码评审里剩余的 5 项 HIGH 全部清掉：Yahoo 数据单位启发式、SEC 债务标签去重、流式接口失败时的 done 帧补齐、AI quota 在 retry-friendly 错误下扣费。",
    highlights: [
      "H2 — Yahoo debtToEquity 启发式：>5 视为 pct 形式 / 100，否则信任 SDK",
      "H3 — engine 改用 fullAxis 驱动，跳月也保持 1 月间距，CAGR 不再因跳月误算月数",
      "H4 — SEC 债务概念去重：LongTermDebtNoncurrent + ShortTermBorrowings/DebtCurrent，不再重复入账长债流动部分",
      "H5 — Plan SSE 错误时也发 done 帧，前端 loading 不再卡死",
      "H6 — 新增 isBillableError：429/5xx 等可能消耗 DeepSeek 算力的错误也扣 quota，401-404 配置错误仍不扣，防滥用",
    ],
    badge: { label: "fix", tone: "fix" },
  },
  {
    version: "Sprint #4 · 结果页重构 + 移动适配",
    date: "2026-05-10",
    title: "tab 重构、移动图表、PIT 进度、retry 文案、色盲适配",
    summary:
      "结果页 4 tab 重新分配：概览（唯一指标表）/ 表现（合并 perf+risk）/ 持仓（新）/ 分析。同步修移动端图表、多因子拉取 ETA、失败重试文案、色盲信号、clone 提示等 7 项 UX。",
    highlights: [
      "U8 — 结果页 4 tab 重排：概览只剩唯一一张指标表（消除 3 处重复），新增「持仓」tab 容纳再平衡历史 + 多因子分解",
      "U5 — useIsNarrow hook：移动端线条加粗、tick 间隔放宽、SPY 虚线模式增强，不再挤成一团",
      "U10 — runner 在拉基本面时实时更新 step note：「Yahoo+SEC 17/30 · SEC 历史 12/30」",
      "U10 — 初始消息加 ETA 提示：「首次约 30-60 秒，后续 24h 内复用缓存」",
      "U11 — Running 页失败按钮按 step 区分文案：plan 阶段失败 → 「返回研究计划」；其他 → 「重新执行回测」",
      "U13 — MetricCell 增加 ▲▼ 三角符号 + title 提示，色盲用户也能识别强弱",
      "U14 — Clone 模式下假设输入框边框变琥珀色 + 标题加「记得改一改差异点」标签",
      "U15 — DataQualityCard fallback 按 factorMix 区分：multifactor 模式下显示「混合 PIT」描述而非动量话术",
    ],
    badge: { label: "重要", tone: "feature" },
  },
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

      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        <TabButton
          active={tab === "usage"}
          onClick={() => setTab("usage")}
          icon={<BookOpen className="h-4 w-4" />}
          label="使用说明"
        />
        <TabButton
          active={tab === "learn"}
          onClick={() => setTab("learn")}
          icon={<GraduationCap className="h-4 w-4" />}
          label="量化入门"
        />
        <TabButton
          active={tab === "changelog"}
          onClick={() => setTab("changelog")}
          icon={<History className="h-4 w-4" />}
          label="更新记录"
        />
      </div>

      {tab === "usage" && <UsageGuide />}
      {tab === "learn" && <LearnGuide />}
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
          <FeatureChip>AI 假设教练（3-12 轮对话）</FeatureChip>
          <FeatureChip>AI 计划与解读（DeepSeek）</FeatureChip>
          <FeatureChip>混合 PIT 多因子（Yahoo + SEC）</FeatureChip>
          <FeatureChip>实验管理（标签 / 收藏 / 归档）</FeatureChip>
          <FeatureChip>研究对比（指标 + 曲线叠加）</FeatureChip>
          <FeatureChip>Markdown 导出</FeatureChip>
          <FeatureChip>iOS 主屏 App（添加到主屏幕）</FeatureChip>
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
                进入「新研究」，写一句投资假设（例如「价值 + 质量因子组合在大市值美股上长期跑赢 SPY」），选股票池、回测区间、再平衡频率、基准、交易成本，以及「因子组合」（动量单因子 vs Value+Quality+Momentum 多因子）。
                <span className="block mt-1.5 text-blue-700">
                  写不出假设？走「AI 教练」入口——3-12 轮对话帮你把模糊想法整理成完整可回测的假设，或直接从 28 条分级例子里挑一条预填表单。
                </span>
              </>
            }
            link={{ href: "/studies/coach", label: "AI 教练" }}
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
            body="结果页四个 tab——概览（AI 结论 + 数据质量 + 唯一指标表 + 月度极值）、表现（权益曲线 + 回撤 + 年度收益图与表）、持仓（最末次再平衡的多因子分解 + 历史调仓记录）、分析（因子 IC 诊断 + 基本面字段覆盖率 + 参数敏感性扫描）。"
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
            body="不再活跃但有保留价值的研究归档隐藏，「仅归档」视图找回，或切到「全部」一并查看。"
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
            label="概览"
            body="数据质量与偏差面板（始终在顶部）→ AI 结论 + 唯一一张完整指标表（CAGR / Sharpe / Max DD / Calmar / 年化波动率 / Beta / Alpha / IR / 月度胜率 / 年化换手率）+ 权益与回撤缩略图 → 最佳 / 最差 5 个月份。这一页的目的是 30 秒判断「这个策略有没有意思」。"
          />
          <TabRow
            label="表现"
            body="大尺寸权益曲线 + 回撤曲线 + 年度收益柱状图 + 年度收益明细表（含相对基准的超额）。Hover 查看月度数值。"
          />
          <TabRow
            label="持仓"
            body="多因子模式下的最末次再平衡持仓 V/Q/M z-score 分解（按色阶高亮强弱）→ 完整再平衡历史（每次调仓的持仓清单 + 单边换手 + 交易成本影响）。"
          />
          <TabRow
            label="分析"
            body="因子 IC 诊断 → 基本面字段覆盖率（多因子模式下显示每个 Value/Quality 字段在股票池中的可用率）→ 参数敏感性扫描（6/9/12 动量回看期、月/季再平衡、Top 10/20/30% 桶宽度）。"
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
            usage="月度调整收盘价 + 当前 MarketCap（用于反推历史 MarketCap_M = MarketCap_today × adjclose 比例）+ EV/EBITDA 当前快照"
            limit="非官方 API；Phase 5 起 PE/PB/PS 已是 PIT-correct（拆股不变量），EV/EBITDA 仍为 point-in-now 兜底"
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
              <span className="font-medium">全 PIT 多因子：</span>
              Phase 5 起 Value 因子（PE / PB / PS）从 MarketCap_M = MarketCap_today × adjclose_M / adjclose_today 反推后 ÷ SEC PIT 绝对值（NetIncomeTTM / StockholdersEquity / RevenuesTTM）得到，已 PIT-correct。Quality 因子（ROE / ROIC / 毛利率 / D-E）90 天 reporting lag 也 PIT-correct。仅 EV/EBITDA 仍是 Yahoo 当前快照兜底。
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
            <span className="font-medium">先用 AI 教练再写参数</span>{" "}
            <Sparkles className="inline h-3 w-3 align-text-bottom text-blue-600" />
            ：第一次做研究的话，从 AI 教练入口走一遍，比直接面对空白表单容易得多。教练完成后表单自动预填，你只要确认参数即可。
          </li>
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
          <li>
            <span className="font-medium">添加到 iOS 主屏</span>：Safari 打开主域 → 分享按钮 → 「添加到主屏幕」，开启「作为网页 App 打开」即可全屏运行。建议手机端常用——回测进度推送看起来更像原生 App。
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
// Learn — Phase 11: quant-101 primer for non-quant users.
//
// Style: 口语化 / 多例子 / 少公式. MVP covers 4 chapters; the structure is
// kept open for later additions (factor families, robustness, real costs,
// resources). Each new product phase that introduces a concept the user
// can't read in the report page WITHOUT context should add a paragraph
// to the relevant chapter here.
// =====================================================================

function LearnGuide() {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
        <div className="font-medium mb-1 inline-flex items-center gap-1.5">
          <Lightbulb className="h-4 w-4" />
          这份文档是干嘛的
        </div>
        <p className="text-xs text-blue-800 leading-relaxed">
          AI Quant Copilot
          的报告页有不少专业术语（CAGR / Sharpe / PIT / Bootstrap / Alpha
          ...）。这一页用大白话把它们讲清楚，结合本工具实际功能讲解。每次产品有新功能上线，会同步更新对应章节。**当前是 MVP，4 章**，后续会加更多。
        </p>
      </div>

      {/* ============ Chapter 1 — 量化交易概念起步 ============ */}
      <LearnSection
        index={1}
        title="量化交易是什么 / 不是什么"
        icon={<GraduationCap className="h-4 w-4 text-blue-600" />}
      >
        <Para>
          先讲<em>不是</em>什么：
        </Para>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
          <li>
            <strong>不是「比你聪明的 AI 自动炒股」</strong>——本工具不下单、不预测下周走势。
          </li>
          <li>
            <strong>不是「跟着算法保赚」</strong>——任何号称这点的都是骗子。
          </li>
          <li>
            <strong>不是高频交易</strong>——我们做月度调仓，不做秒级。
          </li>
        </ul>
        <Para>
          <em>是</em>什么：把「按什么规则选股」这件事写成可重复执行的规则（比如「每月选过去 12 个月涨幅最高的 20% 股票」），然后用历史数据测一遍，看这个规则**过去**赚不赚钱、亏多少、稳不稳。
        </Para>

        <Concept name="因子（Factor）">
          一种「按规则给股票打分」的维度。例如：
          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-xs">
            <li>
              <strong>动量因子</strong>：过去一段时间涨得多的股票打高分
            </li>
            <li>
              <strong>价值因子</strong>：PE / PB 低（便宜）的股票打高分
            </li>
            <li>
              <strong>质量因子</strong>：ROE / 毛利率高（赚钱能力强）打高分
            </li>
          </ul>
          一个「策略」就是把若干个因子组合起来 → 按总分排序 → 选前 20% 来持有 → 定期换仓。本工具支持单因子（12-1 动量）和多因子（Value + Quality + Momentum 等权）两种模式。
        </Concept>

        <Concept name="回测（Backtest）">
          「**假设我过去这么做，结果会是什么样**」的模拟实验。本工具的做法：从 2014 年开始，每月或每季按因子分排序选股，假设你按这个组合持有，看 10 年后赚多少、回撤多大。
        </Concept>

        <Concept name="再平衡（Rebalance）">
          多久换一次仓。月度调仓 = 每月底重新选；季度调仓 = 三个月换一次。频率高更敏感但交易成本高，频率低更稳但反应慢。本工具支持月度 / 季度两种。
        </Concept>

        <Concept name="基准（Benchmark）">
          策略的对照组。最常见是 SPY（追踪 S&P 500 的 ETF）——你的策略「跑赢 SPY」才算赚到 alpha；不然不如直接买指数。本工具默认 SPY，也支持 QQQ / IWM 等。
        </Concept>

        <Para>
          所以本工具的定位很明确：<strong>研究你的策略想法是不是站得住脚</strong>。它不替你做决策，是给你判断材料的。
        </Para>
      </LearnSection>

      {/* ============ Chapter 2 — 报告里的指标都是什么意思 ============ */}
      <LearnSection
        index={2}
        title="报告里的指标都是什么意思"
        icon={<Calculator className="h-4 w-4 text-blue-600" />}
      >
        <Para>
          每个研究跑完，你会在「概览」tab 看到一张关键指标表。挨个解释：
        </Para>

        <MetricExplain
          name="CAGR"
          full="Compound Annual Growth Rate · 年化复合收益率"
        >
          「平均每年涨多少」——但是按复利算的。
          <br />
          <strong>例</strong>：起始 $100，10 年后 $260 → CAGR ≈ 10%（因为 1.10^10 ≈ 2.59）。
          <br />
          <strong>怎么读</strong>：8-12% 在美股大盘是合理预期；超过 20%
          长期年化是非常少见的（巴菲特一辈子也就 19%）。
        </MetricExplain>

        <MetricExplain
          name="Sharpe Ratio"
          full="夏普比率 · 收益 / 风险比"
        >
          收益除以波动的比率。越高表示<strong>每承担一份波动能换来多少收益</strong>。
          <br />
          <strong>例</strong>：A 和 B 都 10% 年化，A 月月稳健 / B
          天天大涨大跌。A 的 Sharpe 远高于 B。
          <br />
          <strong>怎么读</strong>：&gt;1 算不错，&gt;2 优秀，&gt;3
          要警惕（可能过拟合或数据有问题）。SPY 长期 ~0.5-0.7。
        </MetricExplain>

        <MetricExplain name="Max Drawdown" full="最大回撤">
          从历史最高点到最低点的<strong>最深亏损百分比</strong>。
          <br />
          <strong>例</strong>：账户从 $130 跌到 $80 → 回撤 -38%。
          <br />
          <strong>怎么读</strong>：这是实盘最考验心态的指标。如果策略 Max DD
          是 -40%，问问自己：账户里 $100 万跌到 $60 万你能不能不慌不卖？大多数人在 -30% 就会动摇。
        </MetricExplain>

        <MetricExplain name="Calmar Ratio" full="卡玛比率 · CAGR ÷ |Max DD|">
          每承担 1% 的回撤换多少收益。
          <strong>例</strong>：CAGR 12% / Max DD -20% → Calmar 0.6。&gt;1 算优秀，&gt;2 罕见。
        </MetricExplain>

        <MetricExplain name="Alpha" full="阿尔法 · 相对基准的「真本事」">
          扣除基准影响后，策略<strong>额外</strong>赚到的部分。
          <br />
          <strong>例</strong>：SPY 涨 10%，你的策略涨 12% → alpha ≈ 2%（年化）。
          <br />
          <strong>注意</strong>：本工具的「分析」tab 用 OLS 回归算 alpha，已经扣除了 beta 的影响。如果 alpha 是 0，那基本就是 SPY 的代理而已。
        </MetricExplain>

        <MetricExplain name="Beta" full="贝塔 · 跟基准的相关性">
          β=1 表示完全跟基准同涨同跌；β=0 表示跟基准毫无关系；β=1.5 表示基准涨 1% 你涨 1.5%（更激进）。
          <br />
          <strong>怎么读</strong>：高 β 策略在牛市领跑、在熊市也跌得多。
        </MetricExplain>

        <MetricExplain name="IR · Information Ratio" full="信息比率">
          类似 Sharpe，但分子分母换成「主动收益 / 主动波动」。
          <strong>衡量策略 alpha 的稳定性</strong>。&gt;0.5 算可观。
        </MetricExplain>

        <MetricExplain name="月度胜率">
          一年 12 个月里有几个月赚钱。50% 是基线，60%+ 算稳。但<strong>不要单看这个</strong>——胜率高但每次小赚、偶尔巨亏的策略也很糟糕。
        </MetricExplain>

        <MetricExplain name="年化换手率">
          一年大约调仓多少次。低 = 持仓稳，交易成本低；高 = 反应快，但磨损大。月度调仓的多因子策略通常 200-400%（即一年换 2-4 次全部持仓）。
        </MetricExplain>
      </LearnSection>

      {/* ============ Chapter 3 — 量化研究里的陷阱 ============ */}
      <LearnSection
        index={3}
        title="量化研究里的「陷阱」（看到这些指标会自动警觉）"
        icon={<AlertOctagon className="h-4 w-4 text-blue-600" />}
      >
        <Para>
          回测看起来很美好，但有几个常见陷阱会让「美好」变成幻觉。你要学会一眼识别。
        </Para>

        <Pitfall name="幸存者偏差（Survivorship Bias）">
          <p>
            <strong>什么意思</strong>：你只看那些「现在还活着」的股票，那些破产的、退市的、被并购的没在样本里。结果就是回测显得「特别赚」，因为输家都被你不知不觉删掉了。
          </p>
          <p className="mt-1">
            <strong>类比</strong>：你统计「高考上重点大学的学生现在年薪多少」，但是只问了愿意接受你采访的——失败的人多半不接你电话。统计结果会比真实高不少。
          </p>
          <p className="mt-1">
            <strong>本工具的现状</strong>：60 只股票仍然都是「今天还在交易」的。**仍有幸存者偏差**，Phase 6.5 计划接 Wikipedia 历史 S&P 500 成分股以彻底消除。这就是为什么所有研究报告的「数据质量」面板会显式提醒你。
          </p>
        </Pitfall>

        <Pitfall name="前视偏差（Look-ahead Bias）">
          <p>
            <strong>什么意思</strong>：回测 2014 年时用了 2014 年那会儿还<em>不知道</em>的信息。
          </p>
          <p className="mt-1">
            <strong>例</strong>：你用「公司 2024 年的 ROE」去回测 2014
            年——但 2014 年这家公司可能还没产生这个数据，或者数据后来被修正了。
          </p>
          <p className="mt-1">
            <strong>类比</strong>：让你「重新考一次高考」，但允许你看完答案再做题。当然能考满分。
          </p>
          <p className="mt-1">
            <strong>本工具的解法</strong>：Phase 4.2 + 5 实现的「PIT」（看下一章详解）。所有 Quality / Value 因子都只用「当时已经公开发布」的信息。
          </p>
        </Pitfall>

        <Pitfall name="过拟合（Overfitting）">
          <p>
            <strong>什么意思</strong>：你不停调参数（回看期 / 桶宽 / 再平衡频率…），直到回测结果<em>完美</em>。但这个完美只在过去那段历史成立，未来一用就崩。
          </p>
          <p className="mt-1">
            <strong>类比</strong>：你猜上期彩票号码——猜对了，但下次能赢吗？你只是把一组随机数字「拟合」到一个已经发生的结果上。
          </p>
          <p className="mt-1">
            <strong>本工具的解法</strong>：
            <ul className="list-disc pl-5 mt-1 space-y-0.5 text-xs">
              <li>
                「参数敏感性扫描」——单独调动量回看期 / 调仓频率 / 桶宽，看 Sharpe 是不是<em>每个变体都还不错</em>。如果只有一组参数 work，那就是过拟合。
              </li>
              <li>
                Phase 8 加的「Out-of-Sample 拆分」+「Bootstrap 95% CI」——专门防过拟合（看下一章详解）。
              </li>
            </ul>
          </p>
        </Pitfall>

        <Pitfall name="样本太小">
          <p>
            <strong>什么意思</strong>：本工具 60 只股票 × 10 年 ≈ 720 个月度观察。统计学上不算多。任何「Sharpe 1.5」之类的指标都可能是噪音。
          </p>
          <p className="mt-1">
            <strong>解法</strong>：Phase 8 的 Bootstrap 重抽样 1000 次给你一个置信区间，告诉你「Sharpe 真实值大概在 0.5 到 2.0 之间」——区间越宽，原始数字越不可信。
          </p>
        </Pitfall>
      </LearnSection>

      {/* ============ Chapter 4 — PIT 到底是什么 ============ */}
      <LearnSection
        index={4}
        title="PIT 到底是什么 · 为什么是量化里最难的问题"
        icon={<ScanLine className="h-4 w-4 text-blue-600" />}
      >
        <Para>
          PIT = <strong>Point-in-Time</strong>，意思是「站在历史那个时间点能看到的」，与之相对的是「事后才知道的」。
        </Para>

        <Para>
          <strong>具体场景</strong>：你想做一个「选 ROE 最高的 20% 股票」的策略，回测 2014 到 2024。
        </Para>

        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
          <li>
            <strong>非 PIT 做法</strong>（错误但常见）：用 Apple 今天（2026 年）的 ROE 数据，去回测 2014 年的 Apple。但 2014 年的财报上 Apple 的 ROE 是<em>当时</em>报告的数字，不是后来调整的。
          </li>
          <li>
            <strong>PIT 做法</strong>（正确）：找 Apple 2013 年 10-K 的报告，取那份报告里写的 ROE，再加 90 天「报告延迟」（公司报告期结束到真正提交 SEC 的时间）→ 这才是 2014 年 3 月你<em>真的能看到</em>的 ROE。
          </li>
        </ul>

        <Concept name="Restated vs As-reported（修正后 vs 当时报告的）">
          公司每年发新财报时，可能会<strong>修正</strong>过去几年的数字（会计变更、合并、错误更正等）。Yahoo Finance 通常显示 restated 数据，而 SEC 提交的 10-K 永远是 as-reported（除非公司明确替换）。**PIT 的标准做法是用 as-reported**。
        </Concept>

        <Concept name="为什么 PIT 这么重要">
          <p>没做 PIT 的回测会系统性虚高收益，因为：</p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-xs">
            <li>
              你「提前知道」了未来会变好/变差的公司——选股不公平
            </li>
            <li>
              restated 数据往往是「向好修正」（坏数据多被掩埋），所以基于它选股像考试有答案
            </li>
            <li>
              学术研究估计：非 PIT 的 Value 因子回测会虚高 0.5-2% 年化
            </li>
          </ul>
        </Concept>

        <Concept name="本工具的 PIT 实现（Phase 4.2 + Phase 5）">
          <p>
            <strong>Quality 因子</strong>（ROE / ROIC / 毛利率 / 负债权益）— Phase 4.2 已实现：
          </p>
          <ul className="list-disc pl-5 mt-1 mb-2 space-y-0.5 text-xs">
            <li>SEC EDGAR 拉每个 10-K filing 的<strong>filing date</strong>（提交日期）</li>
            <li>
              加 90 天 reporting lag：每月 M 的策略只能用 reportedAt &lt;= M − 90 天 的 filing
            </li>
            <li>
              代码位置：<code>src/lib/factors/pitMultifactor.ts</code> 的{" "}
              <code>pickSnapshotAsOf</code> 函数
            </li>
          </ul>
          <p>
            <strong>Value 因子</strong>（PE / PB / PS）— Phase 5 才实现：
          </p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-xs">
            <li>
              关键洞察：MarketCap 在拆股时不变（价格腰斩、股本翻倍 → 总市值不变）
            </li>
            <li>
              所以可以反推：MarketCap_M = MarketCap_今天 × (调整收盘价_M ÷
              调整收盘价_今天)
            </li>
            <li>有了历史 MarketCap，再除以 SEC 的 PIT 财报绝对数 → 历史 PE / PB / PS</li>
          </ul>
          <p className="mt-2 text-xs text-gray-600">
            注：EV/EBITDA 暂时还是「今天的快照」，因为构造历史 EV 需要历史现金 / 长债 / D&A
            数据，工程量大，后续 Phase 5+ 补齐。
          </p>
        </Concept>

        <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-sm text-emerald-900">
          <strong>怎么验证你跑的研究是 PIT 的</strong>：完成的研究 →「概览」tab → 顶部「数据质量与偏差」面板 →「因子类型」字段。看到「全 PIT 多因子」就是 Phase 5+ 流程，写「混合 PIT」是 Phase 4.2 流程（Quality 是 PIT，Value 不是）。
        </div>
      </LearnSection>

      {/* ============ Chapter 5 — Paper 月度调仓提醒（Phase 12） ============ */}
      <LearnSection
        index={5}
        title="Paper 月度调仓提醒怎么用"
        icon={<Lightbulb className="h-4 w-4 text-blue-600" />}
      >
        <Para>
          研究跑完之后你可以「转 Paper 组合」，这个组合会一直跟着 Yahoo 最新价更新市值。但<strong>策略本身是会变的</strong>——动量因子下个月会看到不同的领涨股，价值因子会看到不同的便宜股。如果你开仓后就放着不管，几个月后这个组合其实跟你的策略已经没关系了。
        </Para>
        <Para>
          所以 Phase 12 加了月度提醒：
        </Para>
        <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
          <li>每月初系统自动重跑你的策略，看「现在该持仓什么」</li>
          <li>跟你 Paper 当前的持仓对比 → 算出「加入哪几只 / 卖出哪几只」</li>
          <li>把这条「建议」写到 Paper 组合下，状态是<strong>待处理</strong></li>
          <li>同时通过 Telegram 推一份消息给你（前提是你配过 bot token）</li>
        </ul>
        <Para>
          你看到提醒后有两个选择：
        </Para>
        <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
          <li><strong>确认调仓</strong>：Paper 持仓被更新成最新推荐，等权重新分配</li>
          <li><strong>跳过本次</strong>：记一笔说你看过了但不动，下个月再说</li>
        </ul>
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900">
          <strong>为什么不自动调？</strong>因为脚本 bug 默默把你的组合改掉是噩梦。「先建议、你点确认」是研究项目里更安全的默认。等用了几个月觉得放心了，未来可以加一个「这个 Paper 我授权自动调」的选项。
        </div>
      </LearnSection>

      {/* ============ Chapter 6 — 因子家族详解 ============ */}
      <LearnSection
        index={6}
        title="因子家族都有谁？（动量 / 价值 / 质量 / 低波 / 成长）"
        icon={<Layers className="h-4 w-4 text-blue-600" />}
      >
        <Para>
          学界这 40 年挖出来的「能持续跑赢基准的特征」就那么几大类。本工具实现了其中三个（动量 / 价值 / 质量），低波和成长目前没做。下面是大白话版科普——每一段最后会告诉你「在本工具里它现在长什么样」。
        </Para>

        <Concept name="📈 动量（Momentum）">
          <p>
            <strong>大白话</strong>：过去一段时间涨得猛的，倾向于继续涨；跌得猛的，倾向于继续跌（不绝对，但概率上是这样）。最经典的版本叫「12-1 动量」——看过去 12 个月的累计涨幅，但**跳过最近 1 个月**，因为最近 1 个月有反转效应。
          </p>
          <p className="mt-1">
            <strong>为什么有效</strong>：行为金融解释——人对新信息反应慢（业绩好了不会马上把价格涨到位）、对涨势上瘾（已经涨了的接着追）、对亏损不愿割肉（输家不愿卖、价格慢慢往下磨）。
          </p>
          <p className="mt-1">
            <strong>论文起源</strong>：Jegadeesh & Titman (1993)。这篇是动量因子的「圣经」，至今 30 多年还在被引用。
          </p>
          <p className="mt-1">
            <strong>注意</strong>：动量在熊市后期会突然失效（叫 momentum crash），2009 年 3 月那种 V 反就是经典案例。本工具的鲁棒性检验会暴露这种问题。
          </p>
          <p className="mt-1">
            <strong>本工具里</strong>：默认就是 12-1 动量。在「新研究」页选「multifactor」时也会用它作为多因子的一条腿。
          </p>
        </Concept>

        <Concept name="💰 价值（Value）">
          <p>
            <strong>大白话</strong>：便宜的股票（PE / PB / PS 低）平均长期跑赢贵的股票。「便宜」不是绝对意义上股价低，而是相对每股盈利、每股净资产来说便宜。
          </p>
          <p className="mt-1">
            <strong>为什么有效</strong>：行为解释——人对「明星股」过度追捧，导致它们贵到不合理；对「无聊的便宜货」无视，导致估值压低。最终业绩会让市场修正这个偏差。
          </p>
          <p className="mt-1">
            <strong>论文起源</strong>：Fama & French (1992)。和动量一起被列为「股票收益的两大基石」。
          </p>
          <p className="mt-1">
            <strong>注意</strong>：价值因子在 2010-2020 这十年表现非常差（「价值陷阱」论盛行），但 2022 后随着科技股估值修正又活过来了。说明因子是有周期的，不是永远赚钱的。
          </p>
          <p className="mt-1">
            <strong>本工具里</strong>：PE / PB / PS / EV-EBITDA 四个子因子等权合成。Phase 5 后已经是 PIT 的（每个月用当时知道的财报算估值），不是用今天的快照倒填。
          </p>
        </Concept>

        <Concept name="🏗️ 质量（Quality）">
          <p>
            <strong>大白话</strong>：「赚钱效率高、负债低」的公司平均跑赢「亏损或高杠杆」的公司。指标看 ROE（净资产收益率）、ROIC（投入资本回报率）、毛利率、债务比率。
          </p>
          <p className="mt-1">
            <strong>为什么有效</strong>：质量好的公司本来就该贵——但市场往往低估「质量持续性」的价值。今年 ROE 35% 的公司，明年大概率还 30%+，而市场不愿意为这种确定性付足够的溢价。
          </p>
          <p className="mt-1">
            <strong>论文起源</strong>：Asness, Frazzini & Pedersen (2019) 的「Quality Minus Junk」论文最系统。但 Warren Buffett 早就用这套了——他买的就是「便宜的好公司」（价值+质量的组合）。
          </p>
          <p className="mt-1">
            <strong>注意</strong>：质量因子是最「平稳」的——不像动量会突然 crash、不像价值会十年低迷——但收益率也比那两个低。它的角色是稳定器。
          </p>
          <p className="mt-1">
            <strong>本工具里</strong>：ROE / ROIC / 毛利率 / 债务/股本 四个子因子等权合成，从 SEC 10-K 财报抽。Phase 4.2 起是 PIT 的（应用 90 天报告滞后）。
          </p>
        </Concept>

        <Concept name="📉 低波动（Low Volatility）">
          <p>
            <strong>大白话</strong>：波动小的股票长期收益反而不输波动大的股票——按风险调整后，**完爆**它们。这违反「高风险高收益」的直觉，是金融学最反直觉的发现之一。
          </p>
          <p className="mt-1">
            <strong>为什么有效</strong>：行为+结构两方面。行为：散户喜欢「彩票股」（暴涨潜力），导致它们被高估、长期 underperform。结构：基金有「杠杆约束」，只能通过买高 β 股票来追求高收益，进一步抬升它们的价格。
          </p>
          <p className="mt-1">
            <strong>论文起源</strong>：Frazzini & Pedersen (2014) 的「Betting Against Beta」是最有名的版本。
          </p>
          <p className="mt-1">
            <strong>本工具里</strong>：<strong>暂未实现</strong>。需要计算过去 N 个月的收益标准差，做 cross-section z-score 取反（低波动 = 高分）。工程量不大，未来某个 Phase 可以加。
          </p>
        </Concept>

        <Concept name="🌱 成长（Growth）">
          <p>
            <strong>大白话</strong>：营收/利润增长快的公司倾向于跑赢增长慢的。但**单独用成长因子作为多头基本无效**（因为市场已经把高增长定价进去了），所以学界更常用「合理估值下的成长」（GARP, Growth At Reasonable Price）——成长 × 价值的混合策略。
          </p>
          <p className="mt-1">
            <strong>为什么单独用没效</strong>：你认为「明显高增长」的公司，市场也认为，所以已经贵了。真正的 alpha 在「市场没意识到的、估值还合理的高增长」上，这本质是 GARP。
          </p>
          <p className="mt-1">
            <strong>本工具里</strong>：<strong>暂未实现</strong>。需要 YoY 营收/利润增长率，从 SEC 数据可以算。如果加，建议直接做 GARP（成长 × 价值合成）而非纯成长。
          </p>
        </Concept>

        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-900">
          <strong>怎么选因子组合？</strong>对自用研究来说，最经典也最稳的搭配是「价值 + 质量 + 动量」三因子等权（就是本工具 multifactor 模式的默认）。如果你想偏防御，加低波；如果偏激进，纯动量也行——但要承担更大的 drawdown 和 momentum crash 风险。
        </div>
      </LearnSection>

      {/* ============ Chapter 7 — 鲁棒性检验怎么读 ============ */}
      <LearnSection
        index={7}
        title="鲁棒性检验：一次回测的结果，到底信不信？"
        icon={<Activity className="h-4 w-4 text-blue-600" />}
      >
        <Para>
          假设你跑了一个研究，结果说「CAGR 14%，Sharpe 1.5，跑赢 SPY 5 个点」——看起来很美。但你应该立刻问三个问题：
        </Para>
        <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
          <li>这个结果是<strong>运气还是稳定</strong>？换个起点跑会不会就崩了？</li>
          <li>你是不是把<strong>训练数据当成验证数据</strong>了？（过拟合）</li>
          <li>这个结果在<strong>不同的市场环境</strong>（牛市/熊市/震荡）下都成立吗？</li>
        </ul>
        <Para>
          鲁棒性检验就是回答这三个问题的工具。研究结果页底部有一个「鲁棒性分析」面板，包含三个子检验：
        </Para>

        <Concept name="🎲 Bootstrap CI（自助法置信区间）">
          <p>
            <strong>是什么</strong>：把你的月度收益序列<strong>有放回随机抽样</strong>重组 1000 次，每次重新算 CAGR / Sharpe / 最大回撤。然后看这 1000 次结果的分布——取 5% 和 95% 分位数就是 90% 置信区间。
          </p>
          <p className="mt-1">
            <strong>类比</strong>：你抛了 100 次硬币得到 56 次正面。这个 56% 是稳定的偏好还是运气？把这 100 次结果有放回抽样 1000 遍，每遍重新数正面，看 56% 落在多大的区间里——如果区间是 [50%, 62%]，说明硬币基本公平；如果是 [54%, 58%]，那硬币可能真的有偏。
          </p>
          <p className="mt-1">
            <strong>怎么读</strong>：研究结果里看到「Sharpe 1.5（CI: 0.8 - 2.1）」就是说：用同样的月度序列重组，Sharpe 大概率落在 0.8 到 2.1 之间。<strong>CI 越窄越可信</strong>，CI 跨越 0（比如 -0.2 to 1.8）就要警惕——可能是噪音。
          </p>
          <p className="mt-1">
            <strong>本工具里</strong>：默认 1000 次抽样，用确定性 PRNG（mulberry32 + 固定种子）所以同一份数据每次跑结果一致。
          </p>
        </Concept>

        <Concept name="🎯 样本内 vs 样本外（IS / OOS）">
          <p>
            <strong>是什么</strong>：把回测期切成<strong>前 70% / 后 30%</strong> 两段。前段是「样本内（In-Sample, IS）」，相当于训练集；后段是「样本外（Out-of-Sample, OOS）」，相当于真实考核。
          </p>
          <p className="mt-1">
            <strong>类比</strong>：你给学生看 70% 的题做练习，期末考剩下 30% 的题。如果练习题平均 90 分但期末只考 60 分，说明他没真学会，只是把练习题背了。
          </p>
          <p className="mt-1">
            <strong>怎么读</strong>：看 IS Sharpe vs OOS Sharpe。
          </p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-xs">
            <li><strong>IS 1.8 / OOS 1.5</strong>：略掉一点，可以接受。OOS 通常会差一些，这是正常的</li>
            <li><strong>IS 2.0 / OOS 0.3</strong>：严重过拟合，这个策略大概率不行</li>
            <li><strong>IS 1.0 / OOS 1.4</strong>：OOS 反而更好？要么运气好、要么策略真的稳，再用别的检验交叉验证</li>
          </ul>
          <p className="mt-1">
            <strong>本工具里</strong>：固定 70/30 split，OOS 是你最不熟悉的最近 30%——这能告诉你「按历史训练出来的策略，到了近期还灵不灵」。
          </p>
        </Concept>

        <Concept name="📆 子区间分析（Subperiod Analysis）">
          <p>
            <strong>是什么</strong>：把整个回测期均分成两段（前半段 + 后半段），分别算 metric。
          </p>
          <p className="mt-1">
            <strong>类比</strong>：你十年成绩单——前五年和后五年的平均分对比。如果前五年 80 后五年 60，要警惕：可能你不是变笨了，而是学校题变难了（市场环境变了）。
          </p>
          <p className="mt-1">
            <strong>怎么读</strong>：看两段 Sharpe / CAGR 的差异。
          </p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-xs">
            <li>差异小 → 策略在不同市场环境下都稳，鲁棒</li>
            <li>差异大 → 策略对市场环境敏感，可能某段时间纯靠运气（比如赶上 QQQ 大涨）</li>
          </ul>
          <p className="mt-1">
            <strong>本工具里</strong>：固定 50/50 split。和 IS/OOS 不冲突——一个查「最近行不行」，一个查「换个环境行不行」。
          </p>
        </Concept>

        <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-sm text-emerald-900">
          <strong>三个检验都通过 ≠ 一定赚钱</strong>，但通过 = 你排除了三个最常见的虚假信号。这是研究纪律的最低标准——任何「Sharpe 高得离谱、所有检验都不看」的策略，几乎都是过拟合。
        </div>
      </LearnSection>

      {/* ============ Chapter 8 — 真实交易成本 ============ */}
      <LearnSection
        index={8}
        title="真实交易成本：你回测时省掉了什么钱"
        icon={<Coins className="h-4 w-4 text-blue-600" />}
      >
        <Para>
          学术论文和入门教程经常把交易成本简化成「单边 5 bps」或者干脆 0。但真实交易里的成本是三层叠加的：买卖价差 + 市场冲击 + 佣金。你的策略<strong>表面上的 alpha</strong> 经常会被这三层吃掉一半甚至全部。
        </Para>

        <Concept name="📏 买卖价差（Spread）">
          <p>
            <strong>是什么</strong>：任何股票同一时刻都有买价（bid）和卖价（ask），中间有差。比如 AAPL 报价 buy 200.10 / sell 200.12，你买入立刻就「亏 2 分」——这就是 spread 成本。
          </p>
          <p className="mt-1">
            <strong>量级感</strong>：
          </p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-xs">
            <li><strong>超大盘股（mega cap，AAPL/MSFT/NVDA）</strong>：spread ~1 bps（0.01%），可忽略</li>
            <li><strong>大盘股（large cap，市值 100-1000 亿）</strong>：~4 bps</li>
            <li><strong>中盘股（mid cap，市值 20-100 亿）</strong>：~10 bps</li>
            <li><strong>小盘股</strong>：30 bps 起跳，有时候 50+ bps</li>
          </ul>
        </Concept>

        <Concept name="🌊 市场冲击（Market Impact）">
          <p>
            <strong>是什么</strong>：你下单的本身会推动价格。如果你想一次买 1000 万美元 NVDA，等你买完，它的价格已经比你下单时高一点了——这部分就是你自己造成的成本。
          </p>
          <p className="mt-1">
            <strong>规律</strong>：冲击大约和 <strong>√（下单金额 ÷ 日成交额）</strong>成正比。简单理解：你买的金额相对市场容量越大，冲击越大；但是是平方根关系，不是线性，所以稍微分散一下能省不少。
          </p>
          <p className="mt-1">
            <strong>类比</strong>：你在一个农贸市场要买 10 斤土豆，挑一家店就买完，老板会涨价；分 3 家店买，价格基本不动。市场冲击就是这个意思。
          </p>
          <p className="mt-1">
            <strong>对个人投资者</strong>：一般下单几千到几万美金，冲击可以忽略不计——但**机构跑回测必须考虑**，否则 100 亿规模的策略上线会发现「赚的全没了」。
          </p>
        </Concept>

        <Concept name="💵 佣金（Commission）">
          <p>
            <strong>是什么</strong>：券商收的费用。零售券商现在大多 0 佣金（IBKR Lite、Robinhood、富途等），机构是 0.5-2 bps 不等。
          </p>
          <p className="mt-1">
            <strong>注意</strong>：零佣金不代表零成本——券商靠 PFOF（Payment For Order Flow，订单流卖给做市商）赚你的钱，体现为你的成交价稍微差一点（隐性成本）。这部分大概也是 1-2 bps，但你看不到。
          </p>
        </Concept>

        <Concept name="🔄 换手率（Turnover）的放大效应">
          <p>
            <strong>是什么</strong>：单边交易成本 × 换手率 = 年化成本拖累。如果你的策略月度调仓、年换手 400%（每年所有持仓换 4 遍）+ 单边 10 bps，那么<strong>每年 80 bps（0.8%）</strong>从 alpha 里被扣掉。
          </p>
          <p className="mt-1">
            <strong>实际意义</strong>：高频策略对成本极度敏感（因为换手率上千%），低频策略（年换手 50%以下）对成本基本不敏感。本工具默认月度再平衡 + 多因子 → 年换手通常 200-400%。
          </p>
        </Concept>

        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900">
          <strong>本工具的两种成本模型</strong>：
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li>
              <strong>simple</strong>：你设的单边 bps × 换手率，简单粗暴，所有标的同价。适合快速试策略。
            </li>
            <li>
              <strong>tiered</strong>（Phase 7+）：按流动性分层（mega/large/mid 三档）应用不同 spread + √turnover 市场冲击 + 你的佣金。更接近真实，回测结果会比 simple 模式低 0.5-2 个点。
            </li>
          </ul>
          建研究时选哪个？早期探索用 simple，看到一个想认真上的策略再换 tiered 验证一下。如果换了模型 Sharpe 从 1.5 掉到 0.6，那就是<strong>策略其实经不起真实成本</strong>，别上。
        </div>
      </LearnSection>

      {/* ============ Chapter 9 — 推荐资源清单 ============ */}
      <LearnSection
        index={9}
        title="想再深入学一点？推荐资源清单"
        icon={<Library className="h-4 w-4 text-blue-600" />}
      >
        <Para>
          这份清单是「我会推荐自己朋友看」的版本，不是「应试」的版本。按难度从浅到深排，每本/每个都简短说明<strong>谁适合</strong>、<strong>解决什么问题</strong>。
        </Para>

        <Concept name="📚 入门书（不需要数学背景）">
          <p>
            <strong>《打开量化投资的黑箱》Rishi Narang</strong>（中信出版）
          </p>
          <p className="text-xs mt-0.5">
            最薄、最白话的量化导论。看完你就知道「Two Sigma 和 D.E. Shaw 大概在干什么」。
          </p>
          <p className="mt-2">
            <strong>《赤裸裸的统计学》Charles Wheelan</strong>
          </p>
          <p className="text-xs mt-0.5">
            统计学入门读物，把回归、假设检验、p 值这些概念讲到不需要数学就能懂。看完再回头读量化论文不会怵。
          </p>
        </Concept>

        <Concept name="📖 进阶书（需要点统计 / Python 基础）">
          <p>
            <strong>《Quantitative Equity Portfolio Management》Chincarini & Kim</strong>
          </p>
          <p className="text-xs mt-0.5">
            因子模型最系统的教材，从 CAPM 到 Fama-French 三因子 / 五因子全覆盖。本工具的多因子框架就是这套理论的简化实现。
          </p>
          <p className="mt-2">
            <strong>《Advances in Financial Machine Learning》Marcos López de Prado</strong>
          </p>
          <p className="text-xs mt-0.5">
            如果你想把 ML 用到量化里，这是必读。第 7 章「Cross-Validation in Finance」专门讲为什么金融数据不能用传统 K-fold CV——和本工具的 IS/OOS 设计有直接关系。
          </p>
          <p className="mt-2">
            <strong>《Python for Finance》Yves Hilpisch</strong>
          </p>
          <p className="text-xs mt-0.5">
            想自己写代码跑回测时的工具书。讲 pandas、numpy 在金融场景的用法，能跟 yfinance / SEC EDGAR 这些数据源对接。
          </p>
        </Concept>

        <Concept name="🎓 学术论文（要看「源头」时）">
          <ul className="list-disc pl-5 space-y-0.5 text-xs">
            <li>
              <strong>Jegadeesh & Titman (1993)</strong>：动量因子开山之作。&quot;Returns to Buying Winners and Selling Losers&quot;
            </li>
            <li>
              <strong>Fama & French (1992)</strong>：&quot;The Cross-Section of Expected Stock Returns&quot;，价值因子 + 三因子模型。
            </li>
            <li>
              <strong>Fama & French (2015)</strong>：五因子升级（加质量 + 投资）。
            </li>
            <li>
              <strong>Frazzini & Pedersen (2014)</strong>：&quot;Betting Against Beta&quot;，低波因子。
            </li>
            <li>
              <strong>Asness, Frazzini & Pedersen (2019)</strong>：&quot;Quality Minus Junk&quot;，质量因子最完整版。
            </li>
          </ul>
          <p className="text-xs mt-1 text-gray-500">
            上面这些都能在 SSRN 或 Google Scholar 免费搜到全文，不用付钱。
          </p>
        </Concept>

        <Concept name="🌐 中文社区 / 公众号">
          <ul className="list-disc pl-5 space-y-0.5 text-xs">
            <li>
              <strong>「川总写量化」</strong>（公众号 / 知识星球）：石川博士，价值取向，文风扎实，适合长期看。
            </li>
            <li>
              <strong>「集思录」</strong>：散户量化讨论社区，A 股场景多，看可转债 / 套利 / 网格策略很有用。
            </li>
            <li>
              <strong>「优矿 / JoinQuant / 米筐」</strong>：国内三大量化平台，文档区有大量入门教程 + 因子复现笔记。
            </li>
          </ul>
        </Concept>

        <Concept name="🌍 英文社区 / 博客">
          <ul className="list-disc pl-5 space-y-0.5 text-xs">
            <li>
              <strong>QuantConnect 论坛</strong>：策略实现讨论，能看到大量带回测代码的讨论。
            </li>
            <li>
              <strong>SSRN「FNANC: Financial Economics」</strong>：最新量化论文聚集地。
            </li>
            <li>
              <strong>Robert Carver 的 blog (qoppac.blogspot.com)</strong>：前 AHL 量化经理，写了《Systematic Trading》，博客里讲很多实战细节。
            </li>
            <li>
              <strong>Quantopian Lectures（已归档）</strong>：Quantopian 倒闭了但课程还在 GitHub，是公开课里最系统的量化课程。
            </li>
          </ul>
        </Concept>

        <Concept name="🛠️ 数据源 / 工具">
          <ul className="list-disc pl-5 space-y-0.5 text-xs">
            <li>
              <strong>Yahoo Finance（yfinance）</strong>：免费，月度/日度调整收盘价。本工具用的就是它。
            </li>
            <li>
              <strong>SEC EDGAR companyfacts API</strong>：免费，所有美股 10-K / 10-Q 财报。本工具的质量因子 / PIT 价值因子的来源。
            </li>
            <li>
              <strong>FRED（Federal Reserve Economic Data）</strong>：宏观数据（利率、CPI、失业率），免费。
            </li>
            <li>
              <strong>Tushare / AkShare</strong>：A 股和港股数据，免费版够用。
            </li>
            <li>
              <strong>WRDS</strong>：学术研究金标准，但要大学订阅。如果有访问权限，覆盖率和准确度都是免费数据没法比的。
            </li>
          </ul>
        </Concept>

        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-900">
          <strong>学习路径建议</strong>：先看完《打开量化投资的黑箱》对整个领域有个全貌 → 在本工具里跑 5-10 个研究、对照量化入门 1-5 章理解每个指标 → 看《Quantitative Equity Portfolio Management》前 5 章把因子模型打牢 → 找 1-2 篇原论文（推荐从 Fama-French 1992 开始）读完整版，体会「严谨研究长啥样」→ 最后如果还有兴趣，看 López de Prado 学怎么把 ML 引入。
        </div>
      </LearnSection>
    </div>
  );
}

function LearnSection({
  index,
  title,
  icon,
  children,
}: {
  index: number;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
        <CardTitle className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
            {index}
          </span>
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">{children}</CardContent>
    </Card>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-gray-700 leading-relaxed">{children}</p>
  );
}

function Concept({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-l-2 border-blue-300 pl-3 py-1 text-sm text-gray-700">
      <div className="font-medium text-gray-900 mb-0.5">{name}</div>
      <div className="leading-relaxed text-xs">{children}</div>
    </div>
  );
}

function MetricExplain({
  name,
  full,
  children,
}: {
  name: string;
  full?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-100 rounded-md p-3 bg-gray-50/40">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-sm font-semibold text-gray-900">{name}</span>
        {full ? <span className="text-xs text-gray-500">· {full}</span> : null}
      </div>
      <div className="text-xs text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}

function Pitfall({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-amber-200 bg-amber-50/50 rounded-md p-3">
      <div className="text-sm font-semibold text-amber-900 mb-1 inline-flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        {name}
      </div>
      <div className="text-xs text-amber-900 leading-relaxed space-y-1">
        {children}
      </div>
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
