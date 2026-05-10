// Sprint #3 hypothesis coach: curated examples that double as
//   (a) browseable inspiration in the coach UI ("查看示例"), and
//   (b) few-shot context the LLM coach references when guiding new users.
//
// Each example carries a difficulty, a category, a one-line gist, the
// finished-form hypothesis sentence, and a parameter dict that mirrors
// /studies/new's form fields. Picking an example pre-fills the form fields
// directly, bypassing the dialog.

export type Difficulty = "初级" | "中级" | "高级";

export interface ExampleHypothesis {
  id: string;
  difficulty: Difficulty;
  category: string;
  title: string;
  hypothesis: string;
  rationale: string; // why this hypothesis is interesting / what it tests
  params: {
    universe: string;
    startDate: string;
    endDate: string;
    rebalance: string;
    benchmark: string;
    txCostBps: number;
    factorMix: "momentum" | "multifactor";
  };
}

const COMMON: Omit<ExampleHypothesis["params"], "rebalance" | "factorMix"> = {
  universe: "US Large Cap (Russell 1000)",
  startDate: "2014-01-01",
  endDate: "2024-01-01",
  benchmark: "SPY",
  txCostBps: 5,
};

export const EXAMPLE_HYPOTHESES: ExampleHypothesis[] = [
  // ============== 初级 · 单因子经典（8 条） ==============
  {
    id: "novice-momentum-12-1",
    difficulty: "初级",
    category: "单因子",
    title: "12-1 价格动量",
    hypothesis:
      "美股大市值股中，过去 12 个月（跳过最近 1 月）涨幅最高的 Top 20% 标的，季度调仓后 10 年回测可跑赢 SPY 基准。",
    rationale:
      "Jegadeesh-Titman (1993) 经典：动量在月度截面上有持续性，跳过最近 1 月避免短期反转。最适合作为多因子研究的基线。",
    params: { ...COMMON, rebalance: "季度", factorMix: "momentum" },
  },
  {
    id: "novice-low-pe",
    difficulty: "初级",
    category: "单因子",
    title: "低市盈率（价值）",
    hypothesis:
      "美股大市值股中，市盈率（PE）最低分位的 Top 20% 标的，季度调仓后长期跑赢市场。",
    rationale:
      "Fama-French (1992) 价值因子的核心命题。验证「便宜的股票长期均值回归」的假设是否在 2014-2024 仍成立。",
    params: { ...COMMON, rebalance: "季度", factorMix: "multifactor" },
  },
  {
    id: "novice-high-roe",
    difficulty: "初级",
    category: "单因子",
    title: "高 ROE（质量）",
    hypothesis:
      "美股大市值股中，ROE 最高的 Top 20% 质量股提供更稳定的长期回报。",
    rationale:
      "净资产收益率最高的公司能持续创造股东价值。Quality factor 在熊市时通常下行更小。",
    params: { ...COMMON, rebalance: "季度", factorMix: "multifactor" },
  },
  {
    id: "novice-low-volatility",
    difficulty: "初级",
    category: "单因子",
    title: "低波动率（风险溢价反转）",
    hypothesis:
      "美股大市值股中，过去 12 个月波动率最低的 Top 20% 标的，能以低风险获得不输市场的回报。",
    rationale:
      "Low Volatility Anomaly：传统理论说高风险高回报，实证发现低波股票反而长期回报更稳。",
    params: { ...COMMON, rebalance: "季度", factorMix: "momentum" },
  },
  {
    id: "novice-6-1-momentum",
    difficulty: "初级",
    category: "单因子",
    title: "6-1 短期动量",
    hypothesis:
      "美股大市值股中，过去 6 个月（跳过最近 1 月）涨幅最高的 Top 20% 标的，月度调仓 10 年期望跑赢 SPY。",
    rationale:
      "比 12-1 反应更快，但换手更高、交易成本更敏感。和 12-1 对比可以看动量信号的最佳回看窗口。",
    params: { ...COMMON, rebalance: "月度", factorMix: "momentum" },
  },
  {
    id: "novice-low-debt",
    difficulty: "初级",
    category: "单因子",
    title: "低负债（财务保守）",
    hypothesis:
      "美股大市值股中，负债权益比（D/E）最低的 Top 20% 标的，长期跑赢市场，且最大回撤更小。",
    rationale:
      "杠杆低的公司经济衰退时韧性更强。验证「财务质量」是否提供下行保护。",
    params: { ...COMMON, rebalance: "季度", factorMix: "multifactor" },
  },
  {
    id: "novice-high-gross-margin",
    difficulty: "初级",
    category: "单因子",
    title: "高毛利率（护城河代理）",
    hypothesis:
      "美股大市值股中，毛利率最高的 Top 20% 标的，因有护城河保护长期跑赢 SPY。",
    rationale:
      "Novy-Marx (2013) 提出的简化质量因子：毛利率比 ROE/ROIC 噪音更小，对会计调整更不敏感。",
    params: { ...COMMON, rebalance: "季度", factorMix: "multifactor" },
  },
  {
    id: "novice-low-pb",
    difficulty: "初级",
    category: "单因子",
    title: "低 P/B（账面价值）",
    hypothesis:
      "美股大市值股中，市净率（P/B）最低的 Top 20% 标的，季度调仓后 10 年内跑赢 SPY。",
    rationale:
      "原始 Fama-French value 定义。在科技股泛滥时代 P/B 信号有所失效，验证它是否仍有价值。",
    params: { ...COMMON, rebalance: "季度", factorMix: "multifactor" },
  },

  // ============== 中级 · 多因子组合（10 条） ==============
  {
    id: "mid-quality-value",
    difficulty: "中级",
    category: "多因子",
    title: "Quality + Value 等权（价值陷阱过滤）",
    hypothesis:
      "美股大市值股中，将质量因子（ROE/毛利率/低 D-E）与价值因子（PE/PB/PS）等权合成，季度调仓选 Top 20%，10 年回测跑赢 SPY。",
    rationale:
      "经典策略：用 Quality 过滤掉「便宜但破败」的价值陷阱。Joel Greenblatt 的 Magic Formula 思想。",
    params: { ...COMMON, rebalance: "季度", factorMix: "multifactor" },
  },
  {
    id: "mid-momentum-quality",
    difficulty: "中级",
    category: "多因子",
    title: "Momentum + Quality（防转向）",
    hypothesis:
      "美股大市值股中，将 12-1 动量与质量因子等权合成，季度调仓选 Top 20%，能在保留动量收益的同时降低剧烈反转。",
    rationale:
      "纯动量策略容易在转折点（如 2009、2020）遭受重创。质量因子起平滑作用。AQR 的 QMJ + UMD 思路。",
    params: { ...COMMON, rebalance: "季度", factorMix: "multifactor" },
  },
  {
    id: "mid-3factor-equal",
    difficulty: "中级",
    category: "多因子",
    title: "三因子等权（V+Q+M）",
    hypothesis:
      "美股大市值股中，Value + Quality + Momentum 三因子等权 z-score 合成，季度调仓选 Top 20%，10 年期望跑赢 SPY 至少 2 个百分点。",
    rationale:
      "经典三腿椅。每条腿在不同市场环境下补位（动量在趋势市，价值在均值回归市，质量在波动市）。",
    params: { ...COMMON, rebalance: "季度", factorMix: "multifactor" },
  },
  {
    id: "mid-monthly-quarterly",
    difficulty: "中级",
    category: "再平衡频率",
    title: "月度 vs 季度调仓权衡",
    hypothesis:
      "三因子等权策略月度调仓相比季度调仓，因换手成本超过 2% 后净收益反而更低。",
    rationale:
      "信号衰减 vs 交易成本：高频更敏感但磨损大。专门为评估 rebalance 频率设计。",
    params: { ...COMMON, rebalance: "月度", factorMix: "multifactor" },
  },
  {
    id: "mid-narrow-bucket",
    difficulty: "中级",
    category: "组合集中度",
    title: "窄桶 Top 10% vs 宽桶 Top 30%",
    hypothesis:
      "三因子等权策略选 Top 10% 比选 Top 30% 提供更高的因子暴露与超额收益，但最大回撤显著放大。",
    rationale:
      "集中度 vs 分散度的核心权衡。窄桶信号纯度高但行业暴露集中，回撤厚尾。",
    params: { ...COMMON, rebalance: "季度", factorMix: "multifactor" },
  },
  {
    id: "mid-low-vol-quality",
    difficulty: "中级",
    category: "多因子",
    title: "低波 + 质量（防御组合）",
    hypothesis:
      "美股大市值股中，低波动率 + 高 ROE 等权合成的防御组合，在熊市跑赢 SPY，牛市跑输不超过 5 个百分点。",
    rationale:
      "经典防御策略，目标不是最高 alpha，而是最佳风险调整后回报（Sharpe / Calmar）。",
    params: { ...COMMON, rebalance: "季度", factorMix: "multifactor" },
  },
  {
    id: "mid-pure-quality",
    difficulty: "中级",
    category: "多因子",
    title: "纯质量四因子（ROE+ROIC+毛利+低杠杆）",
    hypothesis:
      "美股大市值股中，ROE / ROIC / 毛利率 / 低 D-E 四个 Quality 子因子等权合成，单独看也能跑赢 SPY。",
    rationale:
      "测试 Quality 因子内部各分支的协同性。AQR Asness 的 Quality Minus Junk 思路简化版。",
    params: { ...COMMON, rebalance: "季度", factorMix: "multifactor" },
  },
  {
    id: "mid-5y-vs-10y",
    difficulty: "中级",
    category: "时间窗口",
    title: "5 年最近窗口 vs 10 年完整窗口",
    hypothesis:
      "三因子等权策略在最近 5 年（2019-2024）的表现显著弱于 2014-2024 完整窗口，反映因子拥挤度上升。",
    rationale:
      "因子衰减检验：时间近 → 拥挤度高 → 超额收益压缩。",
    params: { ...COMMON, startDate: "2019-01-01", rebalance: "季度", factorMix: "multifactor" },
  },
  {
    id: "mid-momentum-vs-multi",
    difficulty: "中级",
    category: "对比研究",
    title: "纯动量 vs 多因子在熊市的表现",
    hypothesis:
      "对比纯 12-1 动量 vs Value+Quality+Momentum 三因子等权，多因子组合在 2018 年末和 2020 Q1 的回撤显著更小。",
    rationale:
      "用最大回撤和恢复时长（Time-to-Recover）评估两种策略的下行保护差异。",
    params: { ...COMMON, rebalance: "季度", factorMix: "multifactor" },
  },
  {
    id: "mid-9-1-momentum",
    difficulty: "中级",
    category: "敏感性",
    title: "9-1 动量 vs 12-1 动量",
    hypothesis:
      "9-1 动量在大市值美股的有效性与 12-1 动量基本相当，但 IC 衰减略快。",
    rationale:
      "看动量信号的最佳回看窗口。Phase 3.1 敏感性扫描可以一次跑完三个变体。",
    params: { ...COMMON, rebalance: "季度", factorMix: "momentum" },
  },

  // ============== 高级 · 制度切换 / 经验现象（8 条） ==============
  {
    id: "adv-defensive-vs-cyclical",
    difficulty: "高级",
    category: "行业",
    title: "防御性板块在熊市的相对表现",
    hypothesis:
      "防御性板块（公用事业 / 必需消费 / 医疗保健）的低波动 + 高股息组合在 SPY 月度回报为负的月份系统性跑赢大盘。",
    rationale:
      "条件性策略：基于市场状态（熊月 / 牛月）动态评估相对表现，而不是绝对 alpha。",
    params: { ...COMMON, rebalance: "月度", factorMix: "multifactor" },
  },
  {
    id: "adv-january-effect",
    difficulty: "高级",
    category: "日历效应",
    title: "1 月效应在大市值股的剩余有效性",
    hypothesis:
      "美股大市值股中，1 月份相比其他月份的因子收益（Quality + Momentum）显著更高。",
    rationale:
      "经典日历异象。在小盘股已明显失效，但在大盘股是否还有残留？",
    params: { ...COMMON, rebalance: "月度", factorMix: "multifactor" },
  },
  {
    id: "adv-mean-reversion-after-vol",
    difficulty: "高级",
    category: "经验现象",
    title: "高波动月后的均值回归",
    hypothesis:
      "上月波动率最高分位的股票，下月回报系统性低于其他分位股票（短期反转）。",
    rationale:
      "短期反转研究的反向应用。和长期动量方向相反。",
    params: { ...COMMON, rebalance: "月度", factorMix: "momentum" },
  },
  {
    id: "adv-pre-earnings",
    difficulty: "高级",
    category: "经验现象",
    title: "财报季前的动量加速",
    hypothesis:
      "美股大市值股票在财报公布前 30 天的动量信号比平时更具预测力。",
    rationale:
      "Pre-Announcement Drift。学术上有大量证据（Bernard & Thomas 1989）。",
    params: { ...COMMON, rebalance: "月度", factorMix: "momentum" },
  },
  {
    id: "adv-quality-in-recession",
    difficulty: "高级",
    category: "宏观条件",
    title: "经济衰退期的 Quality 防御性",
    hypothesis:
      "在 NBER 标定的经济衰退月份中，纯质量因子（ROE+毛利率+低 D-E）相对 SPY 的超额收益显著为正。",
    rationale:
      "条件性研究：宏观状态切换时不同因子的失效 / 加强。",
    params: { ...COMMON, rebalance: "月度", factorMix: "multifactor" },
  },
  {
    id: "adv-value-trap-filter",
    difficulty: "高级",
    category: "过滤器",
    title: "用动量过滤价值陷阱",
    hypothesis:
      "Value（低 PE+PB）选股中再用 12-1 动量做二次过滤（剔除最差 30% 动量）能提升 Sharpe 但不显著降低 alpha。",
    rationale:
      "排除「便宜且趋势不好」的价值陷阱。Asness「Value Reborn」思想。",
    params: { ...COMMON, rebalance: "季度", factorMix: "multifactor" },
  },
  {
    id: "adv-high-roic-low-pe",
    difficulty: "高级",
    category: "Magic Formula",
    title: "Greenblatt Magic Formula 简化版",
    hypothesis:
      "高 ROIC + 低 PE 的双因子排序合成，季度调仓选 Top 20%，10 年回测年化跑赢 SPY 5 个百分点。",
    rationale:
      "Joel Greenblatt 著名公式：找便宜的好公司。直接对标 Magic Formula 经典命题。",
    params: { ...COMMON, rebalance: "季度", factorMix: "multifactor" },
  },
  {
    id: "adv-3y-window",
    difficulty: "高级",
    category: "敏感性",
    title: "因子在 3 年滚动窗口的稳定性",
    hypothesis:
      "三因子等权策略相对 SPY 的滚动 3 年 alpha 标准差小于 4 个百分点，验证因子组合的稳定性。",
    rationale:
      "不光看长期年化，更看短期可承受性。波动大的因子组合实战难持有。",
    params: { ...COMMON, rebalance: "季度", factorMix: "multifactor" },
  },
];

export function exampleById(id: string): ExampleHypothesis | undefined {
  return EXAMPLE_HYPOTHESES.find((e) => e.id === id);
}

export function exampleSummaryForFewShot(): string {
  // Compact rendering used by the LLM coach prompt as inspiration. Each line
  // shows difficulty + category + the hypothesis itself; we omit rationale to
  // keep token count down.
  return EXAMPLE_HYPOTHESES.map(
    (e) => `[${e.difficulty}·${e.category}] ${e.hypothesis}`,
  ).join("\n");
}
