# AI Quant Copilot — Development Review

> 给 CodeX 的开发回顾 + 下一步建议征询。本文档基于 2026-05-08 ~ 2026-05-11 四天迭代后的真实代码库（已上线 Phase 10）。

---

## TL;DR

**AI Quant Copilot** 是一个面向个人研究者的美股量化研究 SaaS，目标演化路径：

> 「投资假设 → AI 教练协助产出 → AI 生成研究计划 → 真实 Yahoo + SEC 全 PIT 多因子回测（含真实成本 + Bootstrap CI + OLS 多基准归因）→ 4-tab 报告 → 一键转 Paper 组合持续追踪」

生产环境：[https://aiquant.kwinweng.com](https://aiquant.kwinweng.com)（DigitalOcean Singapore，Ubuntu + PM2 + Nginx 自托管）。

仓库：单 monorepo，Next.js 15 App Router + TypeScript + Prisma 6 + PostgreSQL 14 + Vitest（**143 个单测，全过**）。

迭代过程：
- 已上线 **Phase 1 → Phase 10 + 7 个 Sprint**（共 ~30 个 commit/批次）。
- 已经过两轮独立评审（代码 + UI），评审发现的 36 项问题全部修复。
- 用户长期目标从「学习工具」演进为「**实盘参考工具**」，Phase 5-10 是为这个目标做的产品化升级。

---

## 产品形态

### 是什么
- **核心循环**：写一句假设（或用 AI 教练 3-12 轮对话生成）→ AI 出研究计划 → 跑真回测（10 步流水线，可取消）→ 看 4-tab 报告 → 复制变体 / 对比研究 / 导出 Markdown / **转 Paper 组合追踪实际表现**
- **量化能力**：60 只大市值美股 + 8 GICS 板块 + Yahoo Finance 月度价格 + SEC EDGAR XBRL 全历史 10-K filings + DeepSeek V3-0324
- **支持因子**：12-1 价格动量（单因子）、Value+Quality+Momentum 等权（**全 PIT 多因子**）
- **真实成本模型**：分层流动性（mega/large/mid: 1/4/10 bps spread）+ √turnover×5bps 市场冲击 + 用户佣金
- **鲁棒性输出**：每个研究自动跑 Bootstrap 95% CI（1000 次重抽样）+ 70/30 OOS 拆分 + 5 ETF OLS 因子归因（SPY/QQQ/IWM/MTUM/IUSV）

### 不是什么（明确边界）
- 不是炒股软件 / 券商终端 / 社交跟单 / 投资建议
- 不连接券商 API、不自动下单
- 不做期权 / 期货 / 日内 / 高频
- Paper trading 只是模拟跟踪，不涉及真实交易

---

## 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 前端框架 | Next.js 15 App Router + React 19 + TypeScript | App Router 自动 metadata、ImageResponse 生成 PWA 图标 |
| 样式 | Tailwind CSS 4 + shadcn/ui | 三个原始件浅色默认（U1 修复），其余手写 |
| 图表 | Recharts | LineChart / BarChart / AreaChart |
| 数据请求 | SWR 客户端 + Server Components | 5s 轮询 dashboard，详情页按需 |
| 数据库 | PostgreSQL 14 + Prisma 6 | JSON 列存复杂结果（metrics, equityCurve, robustness, attribution）|
| 认证 | NextAuth v5 + GitHub OAuth + JWT session | JWT 避开中间件重定向死循环 |
| 价格数据 | yahoo-finance2 SDK | `chart()` 月度，`quoteSummary()` 当前快照基本面 + marketCap |
| 基本面（PIT 历史）| 直接 fetch SEC EDGAR XBRL companyfacts API | 60 标的 CIK 硬编码 + 远程 fallback |
| LLM | DeepSeek V3-0324（OpenAI SDK 协议）| 成本 ~$0.14/1M tokens，比 Claude 便宜 ~95% |
| 测试 | Vitest 4 | 143 单测，~300ms 全跑完 |
| 部署 | DigitalOcean droplet + PM2 + Nginx + Let's Encrypt | self-hosted，月费 ~$6 |

---

## 仓库关键路径

```
src/
  app/
    (app)/                            # NextAuth middleware 保护的路由
      page.tsx                          # 仪表盘
      studies/
        new/page.tsx                    # 新研究表单（?cloneFrom / ?coachData / ?hypothesis）
        coach/page.tsx                  # AI 假设教练（流式对话 + 28 例子库）
        [id]/
          plan/page.tsx                 # AI 研究计划确认（SSE 流式）
          running/page.tsx              # 实时回测进度（10 步流水线）
          result/page.tsx               # 4-tab 报告 + 全部 Phase 5-10 卡片
        compare/page.tsx                # 双研究对比
      paper/page.tsx                    # ★ Phase 10: Paper 组合列表 + 实时估值
      data-sources/page.tsx
      about/page.tsx                    # 含 changelog（每个 phase 一条）
      layout.tsx                        # 应用 layout + PWA viewport meta
    api/
      auth/[...nextauth]/
      studies/
        route.ts                        # GET (slim metrics) + POST (AI title)
        [id]/
          route.ts                      # GET / PATCH / DELETE
          start/route.ts                # 启动回测（atomic claim）
          cancel/route.ts               # 取消（atomic claim）
          plan/generate/route.ts        # SSE 流式
          progress/route.ts
          result/route.ts
          result/conclusion/route.ts
      coach/turn/route.ts               # AI 教练 SSE
      paper/                            # ★ Phase 10
        route.ts                        # GET 列表 + POST 创建
        [id]/value/route.ts             # GET 实时估值 + DELETE 归档
    icon.tsx + apple-icon.tsx + manifest.ts  # PWA dynamic routes

  lib/
    backtest/
      engine.ts                         # 自研回测引擎（月度 axis + 月/季调仓）
      runner.ts                         # 10 步流水线 + 多因子 + 全部 Phase 5-10 计算
      factor.ts                         # 12-1 momentum + 通用 momentum
      prices.ts                         # Yahoo monthly fetch + cache
      metrics.ts                        # CAGR/Sharpe/MaxDD/Calmar/Beta/Alpha/IR
      universe.ts                       # 60 标的 + CIK 映射
      universeProvider.ts               # ★ Phase 6: 时变 universe 抽象
      costModel.ts                      # ★ Phase 7: 分层成本 + sqrt 冲击
      robustness.ts                     # ★ Phase 8: OOS + Bootstrap + 子区间
      benchmarkAttribution.ts           # ★ Phase 9: 5 ETF OLS 归因
    fundamentals/
      types.ts                          # FundamentalSnapshot（含 marketCap + 3 个 SEC 绝对值）
      yahoo.ts                          # YahooFundamentalsProvider + marketCap 抽取
      sec.ts                            # SecEdgarProvider + fetchAll 历史路径
      cikMap.ts                         # 远程 CIK fallback
      merge.ts                          # Yahoo + SEC 合并 + Phase 5 字段透传
      cache.ts                          # 24h TTL + in-flight dedup
    factors/
      multifactor.ts                    # 横截面 z-score + 等权合成
      pitMultifactor.ts                 # ★ Phase 4.2 + 5: 全 PIT 多因子（含历史 Value）
      historicalValue.ts                # ★ Phase 5: PE/PB/PS 反推
    paper/                              # ★ Phase 10
      valuation.ts                      # equalWeight + valuatePortfolio
    util/
      inflight.ts                       # ★ Sprint #7: 通用 in-flight Promise dedup
    ai.ts                               # DeepSeek：plan / conclusion / coach / 标题
    exportMarkdown.ts                   # 客户端 Markdown 导出
    api.ts                              # requireUser / badRequest / serverError
    seedDemo.ts                         # 新用户 seed 3 个 demo studies

  data/
    exampleHypotheses.ts                # 28 条分级例子库（初/中/高级）

  components/
    layout/Sidebar.tsx                  # 桌面侧边栏 + 移动 tab bar（含 FAB 主操作）
    ui/                                 # Card / Button / Badge / Progress 浅色默认
    providers/SessionProvider.tsx

  middleware.ts                         # NextAuth 路由保护 + PUBLIC_PATHS（icons/manifest）

prisma/
  schema.prisma                         # User / Study / StudyPlan / StudyProgress /
                                        # StudyResult / FundamentalSnapshot / 
                                        # AiUsageDay / PaperPortfolio
  migrations/                           # 11 个手写 SQL（项目用 db push）
  seed-data.ts                          # 3 个 demo（合成 SHARED_EQUITY）

docs/
  codex-review.md                       # 本文档
  claude/roadmap/                       # Phase 3.1/3.2/4 路线图

scripts/
  backfill-titles.ts                    # AI 标题回填脚本

src/**/*.test.ts                        # ★ 143 个 Vitest 单测，13 个文件
```

---

## 四天迭代时间轴

### Day 1 (2026-05-08) · Stage 1 原型
6 路由跑通骨架、shadcn/ui + Recharts + Tailwind、中文 UI + 侧边栏。提交：`45334ce` `9caa80a` `6ab506e` `3cf0056`

### Day 2 (2026-05-09) · 持久化 + AI

**Phase 2.1**：Prisma + PostgreSQL + NextAuth v5 + GitHub OAuth + JWT session（修复 middleware 重定向死循环）+ /cancel + 幂等 running 页。`257f7bf` `f032251` `6b0043b`

**Phase 2.2**：DeepSeek 流式 plan + 同步 conclusion + describeAiError + 密钥脱敏 + 每用户每日 quota。`10eeddc` `89b072d` `cba8ed7`

### Day 3 (2026-05-10) · 大爆发 + 评审 backlog 清零

**Phase 3** `394903e` 真实回测引擎：自研 monthly engine + 12-1 momentum + 完整指标 + 因子 IC 诊断

**Phase 3.1** `92d7c0a` 研究体验：DataQualityCard + 年度表 + 月度极值 + 再平衡历史 + 参数敏感性 + Markdown 导出 + Copy & Modify

**Phase 3.2** `e86edb7` 实验管理：tags / favorited / archived + 视图筛选 + 4 种排序 + 双研究对比页

**Phase 4** `8a52dc5` 多因子地基：Yahoo + SEC EDGAR + FundamentalSnapshot 缓存 + Value+Quality+Momentum 等权 + 因子覆盖率
**Phase 4.1** `aea06c2` CIK 自动 fallback + ROIC 自算 + EV/EBITDA 兜底
**Phase 4.2** `6964443` PIT 历史快照：SEC fetchAll + 90 天 reporting lag → SEC Quality 因子真 PIT

**Sprint #1** `cf62432` 5 CRITICAL bug：start/cancel race + PIT cutoff 一月偏差 + SEC anchor truthy + EPS 拆股 + SEC 惊群
**Sprint #2** `93acca7` UI 7 项重大问题：shadcn 默认浅色 + tab 命名 + logs 死链 + 数据源页演示横幅 + plan 假按钮 + Alpha 显示
**Sprint #3** `1058572` AI 假设教练：3-12 轮对话 + 28 例子分级
**Sprint #4** `3393486` result 页 4 tab 重组 + 移动适配 + ETA + 重试文案 + 色盲适配 + clone 提示
**Sprint #5** `b37e4f4` HIGH 健壮性：Yahoo D/E + axis 跳月 + SEC 债务概念 + Plan SSE done + AI quota retry
**Sprint #6** `bd9e701` MEDIUM + UI 微调收尾

**PWA + 标题** `b54653e` `172daa8` `b28257a` `51c49cd` `3417d80` iOS 主屏图标 + AI 概要标题生成

### Day 4 (2026-05-11) · Sprint #7 + Phase 5-10 实盘化

**Sprint #7** `0663f1c` Vitest 引入 + 64 核心单测：PIT cutoff、SEC as-of、engine axis、metrics、merge、inflight dedup、/start atomic claim

**Phase 5** `5331be9` Yahoo Value PIT 化：MarketCap_M = MarketCap_today × (adjclose_M / adjclose_today) → SEC PIT-visible 绝对值（NetIncomeTTM / StockholdersEquity / RevenuesTTM）→ 历史 PE/PB/PS。**消除 Phase 4.2 最后一处披露的前视偏差**

**Phase 6** `afe62f6` 股票池 30 → 60 + UniverseProvider 接口（为时变 universe 铺路）+ 加入 6 只「淡出大市值」（INTC/IBM/GE/F/KSS/X）部分缓解幸存者偏差

**Phase 7** `a3b2e52` 真实交易成本：mega/large/mid 三档 spread（1/4/10 bps）+ √turnover × 5bps 市场冲击 + 用户佣金。BacktestInput.costMode + Study.costModel；新研究默认 tiered

**Phase 8** `29a1bb7` Out-of-sample 70/30 拆分 + IID Bootstrap 1000 次 95% CI（Sharpe/CAGR/MaxDD）+ 前后两段子区间。结果页加 RobustnessCard

**Phase 9** `66076c1` 5 ETF 单变量 OLS 因子归因（SPY 市场 / QQQ 成长 / IWM 小盘 / MTUM 动量 / IUSV 价值）→ alpha 年化 + beta + R²。结果页加 BenchmarkAttributionCard

**Phase 10** `cc4f01a` Paper trading：从研究最末次再平衡转 buy-and-hold 组合 + 实时估值 vs 基准。新表 PaperPortfolio + /paper 页 + 「转 Paper 组合」按钮

---

## 已知限制 / 诚实披露（Phase 5-10 之后）

### 数据层
- **股票池**：60 只硬编码大市值美股，覆盖 8 个 GICS 板块。**仍存在幸存者偏差**——每只标的今天仍在交易（包括 6 只淡出大市值），不重建历史 S&P 500 成分股。Phase 6.5 计划接 Wikipedia 历史成分以彻底消除。
- **Value 因子 PIT 已修**：PE/PB/PS 现在通过 MarketCap × adjclose 比例反推 + SEC 绝对值，PIT-correct。
- **EV/EBITDA 仍 point-in-now**：复杂度 vs 收益不划算（EBITDA 需要 D&A 历史），保留 Yahoo 兜底
- **EPS growth 在历史路径已禁用**（拆股年失真），未做 split-adjusted EPS

### 工程层
- **回测 runner 仍是 fire-and-forget**：单进程 Node，回测 + I/O 全在 web 进程。当前并发量低无瓶颈。
- **AI quota 是 daily counter**，不是 token-based 也不是 sliding window
- **Demo seed 数据是合成 SHARED_EQUITY**（pre-Phase-3 残留）；新用户首次登录看到的 3 个 demo 都用同一份单调递增曲线，无回撤——已在产品文档披露
- **Paper portfolio 当前是 buy-and-hold**：开仓后不调仓；无邮件 / Telegram 通知（用户主动查）；不算股息 / 税务 / 借券费

### UX 层
- 移动端 result 页的图表已做响应式（Sprint #4 U5），但双轴叠加图在 320px 屏仍偏挤
- 数据源页（`/data-sources`）富途 / 另类数据 panel 是路线图占位（已加演示横幅 + muted badge）

---

## 测试覆盖（Sprint #7 + Phase 5-10 累计）

143 个单测 / 13 个文件 / ~300ms 跑完：

| 文件 | 用例数 | 覆盖 |
|---|---|---|
| `pitMultifactor.test.ts` | 18 | PIT cutoff 边界、SEC as-of 不泄未来、cross-sectional z 数学、Phase 5 历史 Value 行为 |
| `historicalValue.test.ts` | 11 | 历史 MarketCap 反推、拆股不变性、PE/PB/PS 公式、负 EPS 处理 |
| `metrics.test.ts` | 12 | CAGR/Sharpe/MaxDD/turnover/SPY 自比 |
| `factor.test.ts` | 9 | 12-1 等价 (12,1)、ranking 字典序 tiebreaker |
| `engine.test.ts` | 6 | axis 严格 1 月、缺失价格、月/季频率、txCost 真扣 |
| `costModel.test.ts` | 13 | tier 排序、simpleCost、tieredCost spread + sqrt impact + commission |
| `robustness.test.ts` | 13 | split 数学、bootstrap 确定性、CI 区间、regime-shift |
| `benchmarkAttribution.test.ts` | 12 | OLS 数学验证、月份对齐、年化 alpha |
| `merge.test.ts` | 11 | Yahoo wins Value、SEC wins Quality、字段缺失回退 |
| `universe.test.ts` | 12 | 60 标的列表完整性、CIK 唯一性、provider 接口 |
| `inflight.test.ts` | 5 | 同 key 复用、不同 key 隔离、settle 后清理 |
| `valuation.test.ts` | 10 | equalWeight、valuatePortfolio、不可用 ticker 隔离 |
| `start/route.test.ts` | 5 | updateMany 谓词、并发声明只一个成功 |

---

## 已经被审过的部分

- **代码独立评审**（用 `代码审查员` 角色 agent）：5 CRITICAL + 6 HIGH + 5 MEDIUM ✅ 全部已修
- **UI 独立评审**（用 `UI 设计师` 角色 agent）：7 重大 + 8 显著 + 5 微调 ✅ 全部已修
- **生产部署**：每个 Phase / Sprint 都走 git commit + push + SSH 服务器 git pull + npm build + pm2 reload + curl health check
- **数据库变更**：每次 schema 改动有手写 SQL migration（`prisma/migrations/`，12 个）；生产用 `npx prisma db push`
- **Vitest 覆盖**：每次 commit 之前 `npm test` 都过（143 个单测）

---

## 给 CodeX 的具体审视请求（已更新）

之前的问题大多已被 Phase 5-10 解决，这里聚焦**新引入的代码 + 仍未解的方向问题**：

1. **Phase 5 历史 Value 数学**：`src/lib/factors/historicalValue.ts` 的 `historicalMarketCap` 公式是 `MarketCap_today × adjclose_M / adjclose_today`。论证：MarketCap 在拆股时不变（price 与 shares 反向），所以使用 today 锚点 + 历史 adjclose 比例可以反推。**有没有遗漏的边界情况**？比如 special dividend、spinoff、ticker 重命名？

2. **Phase 7 成本模型校准**：`costModel.ts` 的 mega/large/mid 1/4/10 bps + sqrt(turnover) × 5 bps 是基于"市面文献感觉"。**这些数字在 2024-2025 实盘是否合理**？有没有更精确的校准（比如基于 ADV / vol regime 的）？

3. **Phase 8 IID bootstrap 局限**：用了 IID 而非 stationary block bootstrap。注释里承认了。**月度大市值数据下这个简化的实际偏差有多大**？是否应该升级到 Politis-Romano stationary bootstrap？

4. **Phase 9 单变量 OLS 而非多因子回归**：每个 ETF 单独跑，没有构造正交因子（没做 Fama-French 3 / 5）。**这种近似在解读上够用吗**？还是应该咬牙做 FF construction？

5. **Phase 10 Paper trading buy-and-hold 不调仓**：当前用户主动来看才更新；没有 cron 任务，没有月底自动再平衡。**最简单的「下一步」是什么**——是 Vercel cron + email 通知，还是引入 BullMQ + Redis 系统化？

6. **架构演进点**：单进程 Node + 在 web 进程里跑回测 + 所有 SEC fetch 都阻塞 server。**当用户量突破 ~50/天 / 回测突破 ~200/天**时，应该拆 BullMQ + Redis 还是 Trigger.dev / Inngest 这种 BaaS？

7. **PaperPortfolio 数据完整性**：`holdings: Json` 没有 schema 验证。**应该用 Zod 做运行时校验吗**？还是在 valuation.ts 函数边界做？

8. **测试缺口**：143 单测覆盖了核心数学，但**没有 integration test**（端到端 happy path）也**没有 API endpoint test**（除了 /start atomic claim）。**最值得补的下一类测试是什么**？

9. **任何 Phase 5-10 看到的隐性 bug / 反模式 / 安全漏洞**——请直接说，不必客气。

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
SEC_USER_AGENT                    # "Project Name (contact: email)"
```

---

## 附录：commit history（最近 24 条，最新在前）

```
cc4f01a feat(phase-10): paper trading — convert studies into tracked portfolios
66076c1 feat(phase-9): multi-benchmark OLS attribution
29a1bb7 feat(phase-8): out-of-sample split + bootstrap CIs + subperiod analysis
a3b2e52 feat(phase-7): tiered transaction cost model
afe62f6 feat(phase-6): expand universe 30 → 60 tickers + UniverseProvider abstraction
5331be9 feat(phase-5): full-PIT Value factors via back-derived historical MarketCap
0663f1c test(sprint-7): Vitest infra + 64 unit tests on critical paths
81273b1 docs: add CodeX review brief
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
6964443 refactor(phase-4): PIT historical snapshots for SEC quality factors
aea06c2 refactor(phase-4): CIK auto-fallback + ROIC self-compute + EV/EBITDA derivation
8a52dc5 feat(phase-4): fundamentals + multi-factor research foundation
e86edb7 feat(phase-3.2): experiment management + study comparison
```
