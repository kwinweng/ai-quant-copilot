# AI Quant Copilot — Roadmap (2026 H2)

> 取代 fix_plan.md 之后所有的 phase 规划。Phase 1–12 已完成的内容见 git log。

## 已交付（H2 2026）

- ✅ **Phase 13** 多智能体投研团（Regan / Jayzee / Quinn）— 2026-05-14
- ✅ **Phase 14** 风险约束 + 行业上限 — 2026-05-14
- ✅ **Phase 15** 长期校准闭环 + 用户级仪表盘 — 2026-05-14
- ✅ **Phase 16** 公开分享 + Lightweight Charts — 2026-05-15

## 下一阶段（确认中）

- 🔜 **Phase 6.5** 时变 universe — 消除幸存者偏差，让回测科学性从 A 推到 B（2-3 周）

## 一、产品定位

把一句话假设转成可信回测、可追踪 Paper 组合、可校准长期记录的 AI 投研助理。
**核心差异化**：AI 是产品骨架而非装饰，多 agent 投研团 + 风险约束 + 校准闭环三件套构成短期内难以复制的护城河。

## 二、当前路线图

```
       Phase 13  多智能体投研团       ✅
       Phase 14  风险约束 + 组合优化  ✅
       Phase 15  长期校准闭环         ✅
       Phase 16  公开分享 + LWC       ✅
       Phase 6.5 时变 universe        🔜 (2-3 周)
```

---

## Phase 6.5 · 时变 universe（消除幸存者偏差）（2-3 周）

### 目标

当前 60 ticker 股票池**全是 2026 仍在交易的赢家**——2008 的 Lehman / Bear Stearns / WaMu / Countrywide 这些应该出现在回测里的尸体根本不存在。这让任何包含 2008 区间的回测 CAGR **系统性高估 2-4 个百分点**。Phase 6.5 用每月当时的真实指数成分股替换静态股票池，把工具从「教育级数据质量」推到「半严肃验证级」。

### 范围

#### 数据层
- 新表 `UniverseSnapshot { monthKey: "YYYY-MM" @id, tickers: String[], indexName: String }` 记录每月该指数的成分股清单
- 数据源：从 Wikipedia 历史 S&P 500 成分股表 + 开源 csv（如 `fja05680/sp500` repo）合并，落地成静态 seed
- **MVP 范围**：实现 S&P 100（成分变化少，约每年 2-3 次）作为第一个时变股票池；S&P 500 作为 stretch goal
- 加 `seed-sp100-history.ts` 脚本一次性 hydrate `UniverseSnapshot` 表（从 1990 至今）
- 已退市标的的价格处理：扩展 `src/lib/backtest/prices.ts` 容忍 Yahoo 返回 410 / delisted，记入 `dataQuality.delisted` 列表而非整个失败

#### 引擎层
- `src/lib/backtest/universeProvider.ts` 已有抽象，扩展 `UniverseProvider` 接口：
  - `getUniverseAt(monthKey: string): readonly string[]` — 返回当月成分股
  - 静态版（现有）返回固定 60，时变版查 `UniverseSnapshot`
- `src/lib/backtest/runner.ts` 在每个月度 rebalance 决策时调用 `getUniverseAt(decisionMonth)` 获得当时股票池
- 因子诊断 + 多因子合成需要兼容「每月不同 universe size」

#### UI 层
- 新研究表单加 universe 选择 dropdown：
  - **静态 60**（保留旧默认，向后兼容老 study）
  - **时变 S&P 100**（PIT-correct，无幸存者偏差，**Phase 6.5 主推**）
  - 时变 S&P 500（stretch，可能 Phase 6.6 再发）
- 结果页数据质量面板：显示 `survivorshipBias` 字段为 `false`（启用时变后）+ 加披露文本「每月使用当时的真实指数成分股」
- 老 study 重跑保持原 universe（向后兼容硬保证）

#### 关于退市标的的诚实处理
- 不是所有退市标的 Yahoo 都有完整历史价格——这是行业老问题
- 我们的策略：尽力而为，且**显式披露每个回测有多少 ticker-month 数据缺失**
- 时变 universe 已经比静态大幅改善，但**仍不等于 CRSP-quality 数据**——免费数据源的天花板

### 范围外（明确不做）

- ❌ Russell 1000 / Russell 2000 历史成分股（数据更难获取，付费源依赖）
- ❌ 港股 / A 股的时变 universe（依然在 H2 不做清单）
- ❌ 死亡企业的 PIT 财务数据（SEC EDGAR 仍有，但映射复杂，留给 Phase 6.6）
- ❌ 完美的 corporate action 处理（spinoff / 并购等，依赖付费数据）

### 验收

- ✅ 启用「时变 S&P 100」选项后，2008 年 Q4 回测的 universe 包含 Lehman（已破产）+ Bear Stearns 等关键退市标的
- ✅ 同一假设跑「静态 60」vs「时变 S&P 100」的 CAGR 差异**可观测**（通常时变版 CAGR 低 2-4pp，证明在矫正 survivorship）
- ✅ `dataQuality.survivorshipBias: false` 在结果页正确显示
- ✅ 数据缺失的 ticker-month 显式列出，不静默吞掉
- ✅ 老 study 重跑结果 bit-for-bit 一致（静态 universe 路径未变）
- ✅ 单元测试覆盖 `getUniverseAt` 边界（成分股变更月、IPO 时间、退市时间）

### 工作量分解

| 周 | 任务 |
|---|---|
| W1 | 数据获取 + Schema migration + Seed 脚本 + UniverseSnapshot 表 + getUniverseAt 查询 |
| W2 | universeProvider 扩展 + runner 集成 + 退市价格 fetcher 鲁棒性 + 测试 |
| W2.5 | UI 表单 dropdown + 数据质量面板更新 + 文档（About 更新说明 + 量化入门 Ch3 幸存者偏差章节修订） |

### 风险点

| 风险 | 缓解 |
|---|---|
| Wikipedia 历史成分股数据本身有错误 | 用 2+ 开源源交叉验证；写入 seed 后做静态 review；提供「报告数据错误」入口 |
| 退市标的 Yahoo 拿不到完整价格 | 在 dataQuality 显式列出缺失 ticker；不静默插值 |
| 时变 universe 月度变化导致 factor IC 抖动 | 文档披露：Universe 变化本身是市场过程的一部分，IC 测量应在 PIT universe 上做 |
| 实际工作量超 2-3 周 | MVP 砍范围到 S&P 100；S&P 500 推到 Phase 6.6 |

### 与产品定位的关系

**这是把工具从「教育产品」推向「半严肃研究产品」的最大单点杠杆**。完成 Phase 6.5 后：
- 我们的回测**理直气壮可以说没有幸存者偏差**——零售工具里几乎找不到第二家这么做
- Phase 15 校准闭环的数据从此**真正可信**（不被 universe bias 污染）
- 用户调研里最常见的吐槽点之一被消除

但**仍不等于「下真金白银的工具」**——见 §「明确不做」的付费数据源那条。

---

## Phase 13 · 多智能体投研团（4 周）

把单一 conclusion AI 升级成「Regan（多头） + Jayzee（风险官） + Quinn（量化主管）」三方辩论制。

### 范围

- Schema：`StudyResult.aiDebate Json?`、`AiUsageDay.debateCalls Int`
- `src/lib/ai/debateContext.ts`：把 StudyResult 摘要成 agent 上下文（≤6k tokens）
- `src/lib/ai/debate.ts`：三个 agent system prompt + 顺序协调器
- `POST /api/studies/[id]/debate`：SSE 流式，4 轮（Regan → Jayzee → Regan 回应 → Quinn 仲裁）
- 配额：5 次/天/用户
- UI：result 页新增「投研讨论」tab，三栏 timeline + 数据论据可点击回链
- 测试：Vitest 覆盖 debateContext / 输出 schema 校验

### 验收

- ✅ P95 端到端 < 35s（SSE 流式呈现，用户感知延迟低）
- ✅ Jayzee 在「明显垃圾假设」上能给出实质反驳
- ✅ 老 study 无 aiDebate 字段时 UI 优雅显示「点击生成」

---

## Phase 14 · 风险约束 + 组合优化（3 周）

让 paper 组合从「等权篮子」变成「真实资金经理建的组合」。

### 范围

- Schema：`Study.constraints Json @default("{}")`、`StudyResult.sectorAllocation Json?`
- `src/lib/portfolio/sectorMap.ts`：60-ticker → GICS sector 静态映射
- `src/lib/portfolio/constraints.ts`：单仓上限 + 行业上限 + 截尾归一化
- 集成进 `src/lib/backtest/runner.ts` 的每次 rebalance
- UI：研究表单加「风险约束」折叠区；结果页 sector allocation 可视化
- Paper portfolio 创建时继承 source study 的约束

### 范围外（应急砍）

- ❌ `min_var` 优化器 → 推到下一个 minor。只发等权 + 约束截尾。
- ❌ 波动率目标 → 同上。

### 验收

- ✅ 启用默认约束后 paper 组合单仓中位数 ≤ 25%
- ✅ 老 study 重跑 bit-for-bit 一致（无 constraints 路径）
- ✅ 约束相容性单测全绿

---

## Phase 15 · 长期校准闭环（2 周）

用真实运行数据校准 study 的预测能力。

### 范围

- Schema：`PaperPortfolio.quarterlyReview Json?` 缓存
- `src/lib/paper/calibration.ts`：hit rate / 跟踪误差 / 执行率
- `GET /api/paper/[id]/review`：返回缓存或现算（7 天 TTL）
- `/paper/[id]` 新增「季度复盘」tab
- `/profile/calibration` 新页：所有 paper 组合的预测 vs 实际散点图
- 失败策略归档建议 banner（实际 < bootstrap CI 下沿 连续 2 个月）

### 验收

- ✅ 季度复盘在无数据时优雅降级
- ✅ 校准散点图能在 ≥ 5 组合时清晰展示偏差
- ✅ 用户级仪表盘可读「我的研究 hit rate 中位数」

---

## 明确不做（H2 2026）

| 不做 | 理由 |
|---|---|
| 日频回测 | 改造 engine 太大、个人投资者价值有限 |
| A 股 / 港股 | 数据基建复杂，TAM 不够大 |
| 真实 broker 接入 | 监管/责任门槛高，等用户量证明再说 |
| 原生 App | PWA 已经够用 |
| min_var / Black-Litterman / CVaR | Phase 14 应急砍，余力再做 |
| 接付费数据源（Compustat / CRSP / Norgate） | 推工具到「下真金白银」级别需要，但当前用户群没到 |
| LSTM / Transformer 价格预测 | 哲学冲突：我们做因子验证而非短期预测；多个公开实证显示线性模型在金融时间序列上常打败深度模型 |
| 接入金融基础模型（Kronos / FinGPT 等） | 频率 / 哲学 / infra 三重不匹配（详见 memory `project_kronos_review`） |
