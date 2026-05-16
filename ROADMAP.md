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

## Phase 6.5 · 时变 universe（PIT-correct + 诚实披露数据缺失）（2-3 周）

### 价值叙事（2026-05-16 重新校准）

**原计划**：用 PIT 指数成分股替换静态 60 股票池 → 「消除幸存者偏差」。

**现实校准**：W1 完工后做 reality check 发现 **Yahoo Finance 完全没有 LEHMQ / BSC / WAMUQ / CFC / MER / ENE 等关键退市标的的历史价格**（0/6 覆盖）。即使我们把 LEHMQ 放进 2008-08 的成分股，引擎拿不到价格 → 因子 NaN → 静默跳过。**仅靠免费源无法兑现「完全消除幸存者偏差」**。

替代付费源调研后判定不接（Sharadar SEP $299/年、EODHD $19.99/月、Polygon Advanced $199/月 都能解决，但与产品「明确不做付费源」定位冲突，且当前用户量不到验证 ROI 的临界点——见 `memory/project_yahoo_delisted_gap.md`）。

**Phase 6.5 重定义为「部分 PIT + 数据缺失诚实披露」**：
- Universe 本身 PIT-correct（每月使用真实指数成分股，包括 LEHMQ 在 2008-08 仍在列）
- 价格层数据缺失被**精确统计并展示**（多少 ticker-month 缺数据、占总 ticker-month 多少比例）
- 用户看到的是「诚实的数据质量披露」，不是「魔法消除幸存者偏差」
- CAGR 实际矫正幅度预计 <1pp（远低于原 ROADMAP 写的 2-4pp）

### 范围

#### 数据层（W1 已交付，commit `773b101`）
- ✅ 新表 `UniverseSnapshot { monthKey, indexName, tickers }`，复合 PK
- ✅ `Study.universeProvider` 字段，默认 `"static-60"` 保留旧行为
- ✅ Seed 数据：`prisma/seed-data/sp500-history.json`（1.1 MB，361 个月 1996-01→2026-01，源自 `fja05680/sp500`）
- ✅ `scripts/prepare-sp500-history.ts` / `scripts/seed-sp500-history.ts`

#### 引擎层（W2 进行中）
- ✅ `TimeVaryingUniverseProvider` 类 + `load(prisma, indexName)` 异步工厂
- 🔜 `runner.ts` 根据 `study.universeProvider` 解析 provider；上游 fetch 用 `provider.allTickers(window)`；rebalance 决策用 `provider.tickersAt(decisionMonth)`
- 🔜 `prices.ts` 区分「真退市无数据」vs「网络错误」，输出 `missingTickers` 集合
- 🔜 因子合成兼容月度变化的 universe size

#### UI 层（W2.5）
- 🔜 研究表单加 universe dropdown：
  - **静态 60**（默认，保留旧行为）
  - **时变 S&P 500（PIT, partial coverage）**
- 🔜 Result 页 DataQualityCard 更新：
  - 显示 `surveyMode: "partial-pit"`（不是 `survivorshipBias: false`，因为不诚实）
  - 缺失数据明细：「本次回测覆盖 N 个 ticker-month，其中 X 个（Y%）因 Yahoo 无数据被跳过」
  - 「为何缺失」可展开说明：Yahoo 对真破产标的不提供历史价格，这是免费源天花板

### 范围外（明确不做）

- ❌ 接付费数据源（Sharadar / EODHD / Polygon）—— 与产品定位冲突；架构已预留，未来需要时再切
- ❌ Russell 1000 / Russell 2000 历史成分股
- ❌ S&P 100 时变 universe（数据源不如 SP500 完整，留 Phase 6.6 if needed）
- ❌ 港股 / A 股的时变 universe
- ❌ 死亡企业的 PIT 财务数据
- ❌ 完美的 corporate action 处理

### 验收

- ✅ 启用「时变 SP500」选项后，2008-08 的 universe 包含 LEHMQ（W1 已实现，seed 已验证）
- ✅ Result 页明确显示数据缺失统计（不静默吞掉）
- ✅ 老 study 重跑 bit-for-bit 一致（静态 universe 路径未变）
- ✅ 单元测试覆盖 `tickersAt` 边界 + `allTickers` window 切片（W1 已 12 个测试）
- 🔜 同一假设跑「静态 60」vs「时变 SP500」CAGR 差异**可观测**（预计 0.3-1pp，体现部分 PIT 矫正）
- 🔜 缺失 ticker-month 统计准确（spot-check 2008-Q4：LEHMQ 应在 missing 列表）

### 工作量分解

| 周 | 任务 | 状态 |
|---|---|---|
| W1 | 数据层 + Provider 类 + 单测 | ✅ commit `773b101` (2026-05-16) |
| W2.0 | 价值叙事重新校准（本次提交） | 🔄 |
| W2.1 | Runner 接入 UniverseProvider | 🔜 |
| W2.2 | prices.ts 退市价格鲁棒 + missingData 追踪 | 🔜 |
| W2.3 | 表单 dropdown + DataQualityCard | 🔜 |
| W2.4 | 单测 + smoke test | 🔜 |

### 风险点

| 风险 | 缓解 |
|---|---|
| 用户读完文档觉得「就这？」 | 价值叙事改成「诚实披露」而不是「魔法消除」；用户教育成本由 Result 页文案承担 |
| 月度变化的 universe size 让因子诊断抖动 | 文档披露；IC 测量在 PIT universe 上做才对 |
| 老 study 兼容性破坏 | 默认 `universeProvider="static-60"` + runner 路由严格按字段分支 |

### 与产品定位的关系

**仍是把工具往「半严肃研究产品」推的关键一步**，但价值表达方式变了：
- ~~回测理直气壮没有幸存者偏差~~ → **回测的 universe 是 PIT-correct，数据缺失精确披露**
- 零售工具里能做到「universe PIT + 诚实披露 missing」的依然很少
- 架构已经为未来接付费源（Sharadar SEP / EODHD）零代价铺好——当用户量 / 收入到位时一行切换

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
