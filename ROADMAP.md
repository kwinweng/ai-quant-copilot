# AI Quant Copilot — Roadmap (2026 H2)

> 取代 fix_plan.md 之后所有的 phase 规划。Phase 1–12 已完成的内容见 git log。

## 已交付（H2 2026）

- ✅ **Phase 13** 多智能体投研团（Regan / Jayzee / Quinn）— 2026-05-14
- ✅ **Phase 14** 风险约束 + 行业上限 — 2026-05-14
- ✅ **Phase 15** 长期校准闭环 + 用户级仪表盘 — 2026-05-14
- ✅ **Phase 16** 公开分享 + Lightweight Charts — 2026-05-15

## 一、产品定位

把一句话假设转成可信回测、可追踪 Paper 组合、可校准长期记录的 AI 投研助理。
**核心差异化**：AI 是产品骨架而非装饰，多 agent 投研团 + 风险约束 + 校准闭环三件套构成短期内难以复制的护城河。

## 二、9 周路线图

```
       Phase 13  多智能体投研团（4 周）★ 战略护城河
       Phase 14  风险约束 + 组合优化（3 周）
       Phase 15  长期校准闭环（2 周）
```

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
| 公开分享研究 + Lightweight Charts 全站迁移 | 用户决策，推迟到 2027 H1 |
| 日频回测 | 改造 engine 太大、个人投资者价值有限 |
| A 股 / 港股 | 数据基建复杂，TAM 不够大 |
| 真实 broker 接入 | 监管/责任门槛高，等用户量证明再说 |
| 原生 App | PWA 已经够用 |
| min_var / Black-Litterman / CVaR | Phase 14 应急砍，余力再做 |
