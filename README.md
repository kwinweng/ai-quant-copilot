# AI Quant Copilot

> 把一句话假设变成可信回测、可追踪 Paper 组合、可校准长期记录的 AI 投研助理。

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io/)
[![DeepSeek](https://img.shields.io/badge/LLM-DeepSeek-5A67D8)](https://www.deepseek.com/)
[![License](https://img.shields.io/badge/license-private-lightgrey)]()

**语言**：简体中文 · [English](./README.en.md)

线上：[aiquant.kwinweng.com](https://aiquant.kwinweng.com)

---

## 它解决什么问题

普通投资者写不出严谨的因子回测，做了也不敢相信结果，更没耐心把策略养成可校准的长期记录。AI Quant Copilot 把这条链路压缩到三步：

1. **说出假设** —— 「过去 10 年低估值高动量在科技股里的表现」
2. **拿到带 AI 解读的回测** —— PIT 因子合成 + 月度再平衡 + 风险约束 + 稳健性测试 + 三 agent 投研团辩论
3. **派生 Paper 组合 → 季度校准** —— 系统每月给出再平衡建议，每个季度回头算预测命中率、跟踪误差，把「这策略到底是真信号还是回测过拟合」变成可观察的数字

跟「装了 LLM 皮肤的回测工具」的根本区别：**AI 不是装饰，是产品骨架**。多 agent 辩论 + 风险约束 + 校准闭环三件套构成短期内难以复制的护城河。

---

## 功能地图

### 回测引擎
- **多因子合成**：动量 / 价值 / 质量 / 低波，每个因子可加权组合
- **PIT 财务数据**：Yahoo TTM + SEC EDGAR 历史 hybrid（24h 共享缓存）
- **月度再平衡**：等权 top quintile，可配置持仓数 / 调仓频率
- **成本模型**：`simple`（uniform bps × turnover）或 `tiered`（流动性感知 + sqrt 市场冲击）
- **风险约束**：单票上限 + 行业上限（GICS），调仓时截断+重新归一化
- **稳健性测试**：in/out-of-sample 切分 + bootstrap 置信区间
- **基准归因**：对 SPY / QQQ / IWM / MTUM / IUSV 做 OLS 拆解 α / β
- **时变 Universe**（Phase 6.5 进行中）：PIT-correct S&P 500 成分股 + 数据缺失诚实披露

### AI 投研团
- **Regan / Jayzee / Quinn 三 agent 辩论**：4 轮论证 → 共识 → 最终建议（基于 DeepSeek）
- **AI 计划生成**：自然语言假设 → 结构化 StudyPlan
- **AI 结论解读**：把回测指标翻译成「这个策略到底意味着什么」
- **AI Coach**：基于历史 study 的对话式策略迭代

### Paper 组合与校准
- 任意 study → 一键派生 Paper 组合
- 月度再平衡建议（带 diff，用户选择执行 / 跳过）
- 季度校准报告：**预测命中率**、**跟踪误差**、**执行率**
- AI 季度 Review：把校准数据翻译成可读总结

### 协作与分享
- 公开分享链接（token-gated 只读）
- Lightweight Charts 实时净值曲线
- 个人仪表盘：累计 study 数、校准趋势、AI 用量

---

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Next.js 15 App Router · React 19 · Tailwind v4 · Radix UI · Lightweight Charts · Recharts |
| 后端 | Next.js Route Handlers · NextAuth v5（GitHub OAuth）· JWT session |
| 数据库 | PostgreSQL · Prisma 6 |
| LLM | DeepSeek（OpenAI 兼容 SDK） |
| 数据源 | Yahoo Finance 2 + SEC EDGAR（免费源，无 API key） |
| 测试 | Vitest（colocated `*.test.ts`） |
| 部署 | DigitalOcean Singapore · Nginx · PM2 · 自有 Postgres |

---

## 快速开始

### 前置条件

- Node.js 20+
- PostgreSQL 14+
- GitHub OAuth App（[创建入口](https://github.com/settings/developers)）
- DeepSeek API key（[官网申请](https://platform.deepseek.com/)）

### 安装

```bash
git clone https://github.com/kwinweng/ai-quant-copilot.git
cd ai-quant-copilot
npm install
```

### 环境变量

新建 `.env`：

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/ai_quant_copilot"
AUTH_SECRET="<openssl rand -base64 32>"
AUTH_GITHUB_ID="<your github oauth client id>"
AUTH_GITHUB_SECRET="<your github oauth client secret>"
AUTH_URL="http://localhost:3000"
DEEPSEEK_API_KEY="<your deepseek key>"
AI_MODEL="deepseek-chat"           # 可选，默认 deepseek-chat
CRON_SECRET="<random string>"      # /api/cron/* 的鉴权头
```

### 初始化数据库

```bash
npx prisma generate
npx prisma db push       # 本地开发用 db push，没有 migrate 历史
npm run db:seed          # 可选，灌入 demo studies
```

### 启动

```bash
npm run dev              # http://localhost:3000
```

首次用 GitHub 登录后系统会自动种入 3 个 demo studies。

---

## 常用命令

```bash
npm run dev          # 开发服务器
npm run build        # 生产构建
npm start            # 跑构建产物
npm run lint         # next lint
npm test             # vitest run（单次）
npm run test:watch   # vitest watch

# 跑单个测试文件 / 单个测试名
npx vitest run src/lib/backtest/factor.test.ts
npx vitest run -t "computes momentum"

# Prisma
npx prisma generate
npx prisma db push
npm run db:seed
```

`@/` 已在 `tsconfig.json` 和 `vitest.config.ts` 里 alias 到 `src/`。

---

## 项目结构

```
src/
├── app/
│   ├── (app)/            # 登录后的页面（studies / paper / profile / data-sources / about）
│   ├── api/              # Route handlers（studies / paper / coach / cron / profile）
│   └── share/[token]/    # 公开只读分享页（唯一不需登录的业务页）
├── auth.ts               # NextAuth v5 配置 + 首登种子事件
├── middleware.ts         # 未登录拦截（白名单：/api/auth/*, /api/cron/*, /share/*）
├── lib/
│   ├── backtest/         # 回测引擎核心：runner / engine / factor / prices / costModel /
│   │                     # robustness / benchmarkAttribution / universeProvider
│   ├── factors/          # 多因子合成
│   ├── ai/               # DeepSeek 调用：client / debate / reviewSummary / debateContext
│   ├── ai.ts             # 旧版 plan + conclusion 生成
│   ├── fundamentals/     # Yahoo + SEC EDGAR hybrid，24h 缓存
│   ├── portfolio/        # 风险约束（单票 cap + 行业 cap + GICS 映射）
│   ├── paper/            # Paper 组合估值 / 调仓 / 校准
│   ├── api.ts            # requireUser + 标准错误助手
│   └── prisma.ts         # Prisma client 单例
└── components/           # UI 组件
prisma/
├── schema.prisma         # 数据模型唯一来源（每条业务行都有 userId）
├── migrations/           # SQL 迁移（生产手动 cat | psql，详见 docs）
└── seed.ts               # demo study 种子
```

### 数据模型核心

每条业务行都通过 `userId` 隔离（用户删除级联）：

- `Study` → `StudyPlan` / `StudyProgress` / `StudyResult` / `StudyShareToken`
- `PaperPortfolio` → `PaperRebalanceAdvice`
- `UniverseSnapshot` —— 时变 universe，复合 PK `(monthKey, indexName)`
- `FundamentalSnapshot` —— 跨用户共享缓存（**不**带 userId），复合 PK `(ticker, source, fiscalDate)`
- `AiUsageDay` —— 用户级每日 AI 调用计数（plan / conclusion / coach / debate / review），日重置

---

## 已交付能力（按 Phase 时间轴）

| Phase | 内容 | 状态 |
|---|---|---|
| 1–12 | 基础研究流（plan → 回测 → 结论）+ Paper 组合 + 月度建议 | ✅ |
| 13 | 多智能体投研团（Regan / Jayzee / Quinn 4 轮辩论） | ✅ 2026-05-14 |
| 14 | 风险约束（单票 cap + 行业 cap） | ✅ 2026-05-14 |
| 15 | 长期校准闭环 + 用户级仪表盘 | ✅ 2026-05-14 |
| 16 | 公开分享 + Lightweight Charts | ✅ 2026-05-15 |
| 6.5 | 时变 universe（PIT + 数据缺失诚实披露） | 🔜 W2 进行中 |

完整路线图见 [`ROADMAP.md`](ROADMAP.md)。

---

## 设计上的几个关键决定

- **每条业务行都 scoped by `userId`**，cascade on user delete。`requireUser()` 是每个 API 的第一行。
- **回测启动用原子 claim 反竞态**：`prisma.study.updateMany({ where: { status: { not: "RUNNING" } } })`，不要换成 read-then-write，曾经两个并发 /start 同时通过检查的 bug 是这么修的。
- **Runner 是 fire-and-forget**：`void runBacktest(id)`，所有错误捕获后写 `FAILED` + `StudyProgress`，不抛出。
- **新分析字段一律 `Json?` nullable**，UI 必须能优雅渲染旧 `StudyResult`，向后兼容是硬需求。
- **不接付费数据源**（Sharadar / EODHD / Polygon）—— 与产品定位冲突；架构留口子，未来需要再切。详见 `memory/project_yahoo_delisted_gap.md`。

---

## 部署

生产部署的完整 checklist 见 `docs/UPDATE-DEPLOY-SOP.md`（本地 SOP 文档，已 gitignore）。几个**不要踩**的坑：

- **生产没有 `_prisma_migrations` 表**，`prisma migrate deploy` 会 P3005。手动 `cat prisma/migrations/<DIR>/migration.sql | sudo -u postgres psql -d ai_quant_copilot`。
- **所有迁移 SQL 必须幂等**：`ADD COLUMN IF NOT EXISTS`、`CREATE INDEX IF NOT EXISTS`。重跑必须是 no-op。
- **新 `CREATE TABLE` 必须以 `ALTER TABLE "<Name>" OWNER TO aiquant`** 结尾（包在 `DO $$ ... IF EXISTS pg_roles ... $$` 里），否则 app role permission denied。
- 新字段要么可空、要么有 default —— 老行必须能继续工作。
- 重启用 `pm2 reload ai-quant-copilot --update-env`（不是 `restart`），`--update-env` 是为了让 `.env` 变更生效。
- `/api/cron/*` 在 middleware 里跳过 auth，靠 `X-Cron-Secret` 头自保护。新 cron 端点必须放这个前缀下。

初次上线指南见 [`DEPLOY.md`](DEPLOY.md)。

---

## 约定

- **`ROADMAP.md`** 是活的路线图（Phase 13+）。`fix_plan.md` 是 legacy，已冻结。
- 注释里的 `Phase N — ...` / `Sprint #N — ...` 标记字段添加时机，扩展时保持这个约定。
- 时间序列 JSON 列统一用 `monthKey: "YYYY-MM"` 作为月份标识符。
- 每次 AI 调用成功后要 increment `AiUsageDay` 里对应的 counter（`planCalls` / `conclusionCalls` / `coachCalls` / `debateCalls` / `reviewCalls`）。

---

## License

私有项目，未开源。

---

## 联系

- 作者：[@kwinweng](https://github.com/kwinweng)
- 反馈：开 issue 或邮件
