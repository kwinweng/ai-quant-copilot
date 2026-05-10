# AI Quant Copilot — Development Review

> 给 CodeX 的开发回顾 + 下一步建议征询。本文档基于 2026-05-08 ~ 2026-05-10 三天迭代后的真实代码库。

---

## TL;DR

**AI Quant Copilot** 是一个面向个人研究者的美股量化研究 SaaS，三天内从 mock 原型迭代到生产可用，覆盖：

> 「投资假设 → AI 生成研究计划 → 真实 Yahoo + SEC 回测（含混合 PIT 多因子）→ 4-tab 报告 → 实验管理 + 双研究对比 + Markdown 导出」

生产环境：[https://aiquant.kwinweng.com](https://aiquant.kwinweng.com)（DigitalOcean Singapore，Ubuntu + PM2 + Nginx 自托管）

仓库：单 monorepo，Next.js 15 App Router + TypeScript + Prisma 6 + PostgreSQL 14。

迭代过程已经过两轮独立评审（代码 + UI），评审发现的 36 项问题（5 CRITICAL + 6 HIGH + 5 MEDIUM + 7 重大 UI + 8 显著 UI + 5 微调）**已全部修复并部署**。

---

## 产品形态

### 是什么
- **核心循环**：写一句假设（或用 AI 教练对话生成）→ AI 出研究计划 → 跑真回测（10 步流水线，可取消）→ 看 4-tab 报告 → 复制变体 / 对比研究 / 导出 Markdown
- **量化能力**：30 只大市值美股 + Yahoo Finance 月度价格 + SEC EDGAR XBRL 历史 10-K filings + DeepSeek V3-0324
- **支持因子**：12-1 价格动量（单因子）、Value+Quality+Momentum 等权（多因子，混合 PIT）
- **回测引擎**：自研，月度 axis，季度/月度调仓，单边交易成本，Top 分位等权

### 不是什么（明确边界）
- 不是炒股软件 / 券商终端 / 社交跟单 / 投资建议
- 不连接富途 / Bloomberg / 任何券商 API
- 不做实盘交易、不做期权 / 期货、不做日内
- 不是机构级 PIT（Yahoo Value 因子仍是 point-in-now，已显式披露）

---

## 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 前端框架 | Next.js 15 App Router + React 19 + TypeScript | App Router 自动 metadata、ImageResponse 生成 PWA 图标 |
| 样式 | Tailwind CSS 4 + shadcn/ui (3 components) | shadcn 用 Card/Button/Progress 三个原子件，其余手写 |
| 图表 | Recharts | LineChart / BarChart / AreaChart |
| 数据请求 | SWR 客户端 + Server Components for SSR | 5s 轮询 dashboard，详情页按需 |
| 数据库 | PostgreSQL 14 + Prisma 6 | JSON 列存复杂结果（metrics, equityCurve）|
| 认证 | NextAuth v5 + GitHub OAuth + JWT session | JWT 是为了避开 middleware 重定向死循环 |
| 价格数据 | yahoo-finance2 SDK（v2+）| `chart()` 月度，`quoteSummary()` 当前快照基本面 |
| 基本面（PIT 历史）| 直接 fetch SEC EDGAR XBRL companyfacts API | 30 标的 CIK 硬编码 + 远程 fallback |
| LLM | DeepSeek API (deepseek-chat = V3-0324)，OpenAI SDK 协议 | 比 Claude 便宜 ~95%，生成速度可接受 |
| 部署 | DigitalOcean droplet + PM2 + Nginx + Let's Encrypt | self-hosted，月费 ~$6 |

---

## 仓库关键路径

```
src/
  app/
    (app)/              # 受 NextAuth middleware 保护的路由
      page.tsx              # 仪表盘
      studies/
        new/page.tsx        # 新研究表单（含 ?cloneFrom / ?coachData / ?hypothesis 预填）
        coach/page.tsx      # AI 假设教练（流式对话 + 28 例子库）
        [id]/
          plan/page.tsx     # AI 研究计划确认（SSE 流式）
          running/page.tsx  # 实时回测进度（10 步流水线）
          result/page.tsx   # 4-tab 报告（概览/表现/持仓/分析）
        compare/page.tsx    # 双研究对比
      data-sources/page.tsx # 数据源页（含演示横幅 + 真实状态）
      about/page.tsx        # 关于（使用说明 + changelog）
      layout.tsx            # 应用 layout，已加 PWA viewport meta
    api/
      auth/[...nextauth]/   # NextAuth handlers
      studies/
        route.ts            # GET (slim metrics) + POST (AI title)
        [id]/
          route.ts          # GET / PATCH (tags/favorite/archive) / DELETE
          start/route.ts    # 启动回测（atomic claim）
          cancel/route.ts   # 取消（atomic claim）
          plan/route.ts     # 读取 plan
          plan/generate/route.ts   # SSE 流式生成
          progress/route.ts # 进度查询
          result/route.ts   # 完整结果
          result/conclusion/route.ts  # AI 结论生成
      coach/turn/route.ts   # AI 教练 SSE 单轮
    icon.tsx + apple-icon.tsx + manifest.ts  # PWA dynamic routes

  lib/
    backtest/
      engine.ts             # 自研回测引擎（月度 axis + 月/季调仓 + 交易成本）
      runner.ts             # 编排器：10 步流水线 + 多因子模式
      factor.ts             # 12-1 momentum + 通用 momentum
      prices.ts             # Yahoo monthly fetch + cache
      metrics.ts            # CAGR / Sharpe / Max DD / Calmar / Beta / Alpha / IR
      universe.ts           # 30 标的 + CIK 映射
    fundamentals/
      types.ts              # FundamentalSnapshot 类型
      yahoo.ts              # YahooFundamentalsProvider
      sec.ts                # SecEdgarProvider（fetch + fetchAll 历史路径）
      cikMap.ts             # 远程 CIK fallback
      merge.ts              # Yahoo + SEC 合并策略
      cache.ts              # 24h TTL + in-flight dedup
    factors/
      multifactor.ts        # 横截面 z-score + 等权合成 + 覆盖率报告
    ai.ts                   # DeepSeek 接入：plan / conclusion / coach / 标题生成
    exportMarkdown.ts       # 客户端 Markdown 导出（无 server 依赖）
    api.ts                  # requireUser / badRequest / serverError helper
    seedDemo.ts             # 新用户 seed 3 个 demo studies

  data/
    exampleHypotheses.ts    # 28 条分级例子库（初/中/高级）

  components/
    layout/Sidebar.tsx      # 桌面侧边栏 + 移动 tab bar（含 FAB 主操作）
    ui/                     # Card / Button / Badge / Progress 浅色默认
    providers/SessionProvider.tsx

  middleware.ts             # NextAuth 路由保护 + PUBLIC_PATHS 允许 icons/manifest 匿名访问

prisma/
  schema.prisma             # User / Account / Session / Study / StudyPlan /
                            # StudyProgress / StudyResult / FundamentalSnapshot /
                            # AiUsageDay
  migrations/               # 5 个手写 SQL（项目用 db push，未走 migrate dev）
  seed-data.ts              # 3 个 demo 用合成 SHARED_EQUITY 数据
```

---

## 三天迭代时间轴

### Day 1 (2026-05-08) · Stage 1 原型
**目标**：6 路由全跑通，UI 骨架就位，全部 mock 数据。

- bootstrap Next.js + shadcn/ui + Recharts + Tailwind
- 6 条路由：`/` / `/studies/new` / `/plan` / `/running` / `/demo-result` / `/data-sources`
- 中文 UI + 侧边栏布局
- 提交：`45334ce` `9caa80a` `6ab506e` `3cf0056`

### Day 2 (2026-05-09) · 持久化 + AI
**目标**：让原型变成"真"应用。

#### Phase 2.1 — 数据库 + 多用户
- Prisma + PostgreSQL + NextAuth v5 + GitHub OAuth
- 严格按 userId 隔离的 Study 模型
- JWT session（修复 middleware 重定向死循环 bug `6b0043b`）
- /cancel 端点 + 幂等 running 页 (`f032251`)
- 提交：`257f7bf` `f032251` `6b0043b`

#### Phase 2.2-lite — 真实进度轮询
- 把模拟 setTimeout 替换为真 progress 表轮询
- Dashboard 删除研究功能
- 提交：`c29c853`

#### Phase 2.2 — AI 接入（DeepSeek）
- 最初接 Anthropic Claude，第二天切到 DeepSeek（成本考虑，~95% 节省）
- 流式生成 plan + 同步生成 conclusion
- `describeAiError` 错误信息映射 + 密钥脱敏
- 每用户每日 quota（plan 10 / conclusion 20 / coach 60）
- 提交：`10eeddc` `89b072d` `cba8ed7`

### Day 3 (2026-05-10) · 大爆发

#### Phase 3 — 真实回测引擎
- 自研月度回测引擎（engine.ts）
- 12-1 momentum 因子（Jegadeesh-Titman 经典）
- yahoo-finance2 SDK 拉月度调整收盘价
- 风险指标完整：CAGR / Sharpe / Max DD / Calmar / 年化波动率 / Beta / Alpha / IR / 月度胜率 / 年化换手率
- 因子诊断：IC / IC IR / Q1-Q5 spread
- 提交：`394903e`

#### Phase 3.1 — 研究体验
- DataQualityCard：survivorship + 因子类型 + 免责声明
- AnnualReturnsTable + BestWorstMonthsCard + RebalanceHistoryCard
- 参数敏感性扫描（动量回看 6/9/12 + 月/季再平衡 + Top 10/20/30%）
- Markdown 导出 + Copy & Modify
- /studies/new 加 `?cloneFrom=<id>` 预填
- 提交：`92d7c0a`

#### Phase 3.2 — 实验管理 + 对比
- Study 加 tags / favorited / archived
- PATCH 端点严格白名单
- Dashboard 视图（活跃/收藏/仅归档/全部）+ 实时搜索 + 多维筛选 + 4 种排序
- 新页面 `/studies/compare?a=ID&b=ID`：指标对比 + 参数差异 + 权益叠加 + 回撤对比
- 提交：`e86edb7`

#### Phase 4 — 基本面 + 多因子地基
- Yahoo + SEC EDGAR 混合（**全免费方案**，按用户偏好选定）
- FundamentalSnapshot 缓存表（24h TTL）
- Provider 抽象 + Yahoo 当前快照 + SEC 全历史
- 因子覆盖率报告 + 最末次再平衡持仓的多因子分解
- /studies/new 加因子组合选择器
- 提交：`8a52dc5`

#### Phase 4.1 — 改进微调
- CIK 自动 fallback（远程 sec.gov/files/company_tickers.json）
- ROIC 自算（NetIncome / (Equity + Total Debt) 简化代理）
- EV/EBITDA 兜底（Yahoo enterpriseToEbitda 缺失时用 EV÷EBITDA 自算）
- 提交：`aea06c2`

#### Phase 4.2 — PIT 历史快照（关键正确性升级）
- SEC fetchAll 返回每个 10-K filing 形成的快照数组
- Cache 层加 getSecHistory + getSecHistoryForUniverse
- buildMultiFactorScores 重写为 PIT-aware：每月 M 只用 reportedAt < M-90 天 的最新 filing
- Yahoo Value 因子仍 point-in-now（无历史 API），披露文案明确「混合 PIT」
- 提交：`6964443`

#### Sprint #1 — 5 CRITICAL + 1 HIGH 紧急修复
独立代码评审发现的 race / 正确性 bug：
- C1：PIT cutoff 一个月偏差（runner.ts monthKeyToCutoff）
- C2：/start 双跑竞态（atomic updateMany 修复）
- C3：SEC anchor truthy bug（fiscalDate 被设成 today 污染缓存）
- C4：epsGrowth 在拆股年失真（NVDA/AAPL/TSLA），历史路径已禁用
- C5：SEC 惊群（in-flight Promise dedup）
- H1：/cancel 同样竞态条件
- 提交：`cf62432`

#### Sprint #2 — UI 7 项重大问题
独立 UI 评审发现的高 ROI 改进：
- U1：shadcn Card/Button/Progress 默认浅色（消除 18 处覆盖）
- U2：仪表盘 tab 命名（活跃/收藏/仅归档/全部）
- U3：删 result 页 logs 死链
- U4：About 页矛盾文案（PIT 表述不一致）
- U7：/data-sources 加演示横幅 + 真实数据源绿条
- U12：plan 页假「编辑」按钮删除
- U18：Alpha 负数 +-X% bug
- 提交：`93acca7`

#### Sprint #3 — AI 假设教练
- 新路由 `/studies/coach`：3-12 轮自适应对话
- DeepSeek 流式 + 28 条分级例子（初/中/高级 + 行业/日历/经验现象）
- AI 输出 [FINAL] + JSON sentinel，前端识别后展示「进入新研究」CTA
- AiUsageDay 加 coachCalls 单独计费（每用户每日 60 轮）
- 提交：`1058572`

#### Sprint #4 — Result 页重构 + 移动适配
- result 页 4 tab 重新分配（概览/表现/持仓/分析），消除 3 处指标表重复
- 新增「持仓」tab 容纳 RebalanceHistory + FactorBreakdown
- `useIsNarrow` hook：移动端线条加粗 + tick 间隔放宽 + Y 轴宽度调整
- runner 实时更新 step note（Yahoo+SEC 17/30 · SEC 历史 12/30）
- Running 页失败按钮按 step 区分文案
- MetricCell 加 ▲▼ 三角符号（色盲适配）
- Clone 模式假设输入框琥珀边框 + 警告
- DataQualityCard fallback 按 factorMix 分支
- 提交：`3393486`

#### Sprint #5 — HIGH 健壮性
- H2：Yahoo D/E 单位启发式（>5 视为 pct）
- H3：engine 改用 fullAxis 驱动，跳月不再让 CAGR 错算
- H4：SEC 债务概念去重（LongTermDebtNoncurrent + DebtCurrent，不再混入 LongTermDebtCurrent）
- H5：Plan SSE 错误也发 done 帧
- H6：`isBillableError` —— 429/5xx 扣 quota，401-404 不扣
- 提交：`b37e4f4`

#### Sprint #6 — MEDIUM + UI 微调收尾
- M1：SEC 历史 PIT 行不存 raw + 并发 4→2，内存峰值减半
- M2：rankByFactor 加 ticker tiebreaker，确定性
- M3：prices.ts 跳过 endDate 之后的 in-progress bar
- M4：Study.tags GIN 索引
- M5：GET /api/studies slim metrics（dashboard 轮询载荷砍半）
- U17：Failed badge warning→danger（dashboard 与 running 一致）
- U19：表头 gray-400→gray-500（WCAG AA 4.5:1）
- U20：IconButton 加 focus-visible 焦点环
- 提交：`bd9e701`

#### PWA + 移动 UI 打磨
- iOS apple-icon (180×180 ImageResponse) + 浏览器 favicon (32×32)
- PWA manifest.webmanifest + appleWebApp metadata
- Middleware 把 icons/manifest 加入 PUBLIC_PATHS（否则 iOS 显示字母 A 兜底）
- 移动 tab bar 重设计：~52px → ~72px、22px 图标、11px 标签、激活态蓝条、shadow
- 「新研究」FAB（56×56 圆形蓝色，上抬 28px，4px 白 ring 形成"扣出"效果）
- 「关于」加回 mobile（Sprint #4 一时砍掉）
- AI 标题生成器（DeepSeek + 启发式 fallback），8-16 字精简
- Backfill 老研究标题（4 条扫描，1 条更新）
- 提交：`b54653e` `172daa8` `51c49cd` `b28257a` `3417d80`

---

## 已知限制 / 诚实披露

### 数据层
- **股票池**：30 只硬编码大市值美股，**不重建历史 S&P 500 成分股**，存在幸存者偏差（已在每个研究的 DataQualityCard 中显式披露）
- **Yahoo Value 因子**（PE/PB/PS/EV-EBITDA）仍是 **point-in-now**，应用于所有历史月，存在前视偏差。Phase 5 计划用 SEC EPS + 价格自算历史 PE 消除（未做）
- **ROIC** 是简化版 `NetIncome / (Equity + Total Debt)`，未做 NOPAT 后税利息调整
- **EV/EBITDA** 优先 Yahoo `enterpriseToEbitda`，缺失时用 `enterpriseValue ÷ ebitda` 兜底
- **EPS growth 历史路径已禁用**（拆股年会失真，未做 split-adjusted EPS）

### 工程层
- **回测 runner 是 fire-and-forget**：单进程 Node，回测计算 + I/O 全在 web 进程内。当前并发量很小，没瓶颈，但扩大用户量需要拆 worker
- **AI quota 是 daily counter**，不是 token-based 也不是 sliding window
- **Demo seed 数据是合成的**（`prisma/seed-data.ts` SHARED_EQUITY），新用户落地时看到的 3 个 demo 都用同一份单调递增曲线，无回撤——已在产品文档披露
- **没有自动化测试**：纯手工 + build verify。Vitest 没装

### UX 层
- 移动端 result 页的图表虽然做了响应式（Sprint #4 U5），但**双轴叠加图在 320px 屏上仍然偏挤**
- **数据源页**（`/data-sources`）的富途/另类数据 panel 是路线图占位，已加演示横幅和 muted badge 避免误导
- **没有通知 / 邮件 / Telegram**——回测完成需要用户主动刷新页面或听其他声音判断

---

## 已经被审过的部分

- **代码独立评审**（一名 reviewer 用 `代码审查员` 角色）：5 CRITICAL + 6 HIGH + 5 MEDIUM ✅ 全部已修
- **UI 独立评审**（一名 reviewer 用 `UI 设计师` 角色）：7 重大 + 8 显著 + 5 微调 ✅ 全部已修
- **生产部署**：每个 Sprint 都有 git commit + push origin + SSH 服务器 git pull + npm build + pm2 reload + curl health check
- **数据库变更**：每次 schema 改动有手写 SQL migration（`prisma/migrations/`），生产用 `npx prisma db push` 同步

---

## 给 CodeX 的具体审视请求

1. **架构合理性**：Next.js 15 App Router 单进程 + Postgres + 在 web 进程里跑回测 —— 这个架构在每天 ~10 用户、~30 个回测的量级下扛得住吗？什么时候应该拆 BullMQ + Redis？拆的边界在哪？

2. **PIT 实现完整性**：`src/lib/backtest/runner.ts` 的 `buildMultiFactorScores` 已经是 PIT-aware 了（SEC Quality 因子按 90 天 reporting lag），但 Yahoo Value 因子仍是静态 tilt。**用 SEC EPS × 历史价格自算历史 PE / PB / PS 是否值得？工程量评估？**有没有更简洁的「假 PIT」做法？

3. **回测引擎正确性**：`src/lib/backtest/engine.ts` 的循环逻辑（decision month → performance month）+ Sprint #5 H3 的 `axisMonths` fix。请审视是否有边界情况错误（特别是 universe 中部分 ticker 在某些月份完全无价格的场景）。

4. **代码组织**：`src/lib/backtest/` 9 个文件、`src/lib/fundamentals/` 6 个文件、`src/lib/factors/` 1 个文件。这个分层合理吗？哪些应该合并？哪些应该进一步拆？

5. **测试缺位**：项目零测试。如果只能加 5-10 个测试用例，**哪些是最值得的**？（提示：PIT 边界、cancel race、SEC anchor、merge 优先级、metrics 计算）

6. **下一阶段建议**：基于现状，下一个 Sprint 应该做什么？候选：
   - (a) **Phase 5**：消除 Yahoo Value 因子的最后一处前视偏差（用 SEC EPS/BookValue + 历史价格自算）
   - (b) **股票池扩展**：从 30 标的扩到 S&P 100 / Russell 1000 子集
   - (c) **运营增强**：邮件 / Telegram 通知（回测完成、AI 配额用尽）；监控 / 错误告警接入 Sentry
   - (d) **新分析维度**：行业暴露 / 因子归因 / Sharpe 滚动稳定性 / 蒙特卡洛压力测试
   - (e) **测试覆盖**：先把 5 个高风险边界用 Vitest 覆盖
   - (f) **付费/团队**：Stripe 计费、团队工作区、研究分享链接
   - 你的建议？

7. **任何你看到的隐性 bug / 反模式 / 安全漏洞**——请直接说，不必客气。

---

## 附录：环境变量

```
DATABASE_URL                      # postgres://...
AUTH_SECRET                       # openssl rand -base64 32
AUTH_URL                          # https://aiquant.kwinweng.com
AUTH_TRUST_HOST                   # true
AUTH_GITHUB_ID                    # GitHub OAuth app
AUTH_GITHUB_SECRET                # GitHub OAuth app
DEEPSEEK_API_KEY                  # platform.deepseek.com
AI_MODEL                          # 默认 deepseek-chat (V3-0324)
SEC_USER_AGENT                    # 形如 "Project Name (contact: email)"
```

## 附录：commit history（最近 30 条，最新在前）

```
3417d80 feat: AI-generated concise study titles + backfill script
b28257a style(mobile): roomier bottom tab bar + active accent line
51c49cd style(mobile): elevate "新研究" tab as floating-action-button
4d98399 docs: refresh About page after Sprint #4-#6 + PWA work
172daa8 fix(auth): allow icons + manifest through middleware unauthenticated
b54653e feat(pwa): iOS home-screen icon + PWA manifest + restore About on mobile
bd9e701 chore(sprint-6): MEDIUM backlog cleanup + UI nits
b37e4f4 fix(sprint-5): remaining HIGH from code review
3393486 refactor(sprint-4): result page restructure + mobile + UX polish
1058572 feat(sprint-3): AI hypothesis coach + 28-example library
93acca7 refactor(ui): Sprint #2 cleanup — defaults, labels, dead links
cf62432 fix(critical): race conditions, PIT cutoff, SEC anchor, EPS splits, SEC dedup
b824de4 docs: log Phase 4.1 + 4.2 in About changelog
6964443 refactor(phase-4): PIT historical snapshots for SEC quality factors
aea06c2 refactor(phase-4): CIK auto-fallback + ROIC self-compute + EV/EBITDA derivation
1f4f4d5 feat: add About page with usage guide + changelog
8a52dc5 feat(phase-4): fundamentals + multi-factor research foundation
e86edb7 feat(phase-3.2): experiment management + study comparison
92d7c0a feat(phase-3.1): real backtest research experience
394903e feat(phase-3): real backtest execution via Yahoo Finance + 12-1 momentum
cba8ed7 feat(phase-2.2): describeAiError mapper + secret scrubbing
89b072d refactor(phase-2.2): switch from Anthropic to DeepSeek API
10eeddc feat(phase-2.2): integrate Claude API for plan + conclusion generation
c29c853 feat(phase-2.2-lite): real progress polling and dashboard delete
6b0043b fix(auth): switch to JWT session strategy to fix middleware redirect loop
f032251 feat(stage-2.1): cancel endpoint + idempotent running page
257f7bf feat(stage-2.1): persist studies via Prisma + GitHub OAuth multi-user
3cf0056 feat: redesign UI to Chinese with sidebar layout
6ab506e fix: MetricRow green highlight for CAGR, Max Drawdown, Alpha
9caa80a feat: animate running page pipeline steps + add fix_plan.md
45334ce feat: bootstrap AI Quant Copilot Stage 1 prototype
```
